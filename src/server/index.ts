import "dotenv/config";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Socket } from "net";
import express, { type Response } from "express";
import compression from "compression";
import cors from "cors";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, hasDatabase, pool } from "../db/index.js";
import {
  auctionRegistrations,
  clubActivities,
  clubMemberships,
  notices,
  notifications,
  playerPhotos,
  sportsClubs,
  teamRosterMembers,
  tournamentMatches,
  tournaments,
  tournamentTeams,
  users,
} from "../db/schema.js";
import { auctionState, demoStore } from "./demoStore.js";
import {
  attachOptionalAuth,
  isDemoSwitcherEnabled,
  requireAuth,
  signSessionToken,
  toPublicUser,
  toSelfUser,
  verifyPassword,
  type AuthUserRecord,
} from "./auth.js";
import {
  buildCorsOptions,
  createRateLimiter,
  detectImageMimeFromBuffer,
  normalizeBatchCode,
  securityHeadersMiddleware,
  sendServerError,
} from "./security.js";
import {
  hydrateAuctionFromDb,
  registerAuctionRoutes,
} from "./auctionRoutes.js";
import { registerTournamentRoutes } from "./tournamentRoutes.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

app.disable("x-powered-by");
app.use(securityHeadersMiddleware);
app.use(cors(buildCorsOptions()));

// Gzip compression for JSON/HTML/assets (never compress SSE event streams)
app.use(
  compression({
    filter(req, res) {
      if (req.path === "/api/auction/stream") return false;
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
  })
);

// Dedicated higher cap ONLY for authenticated player photo upload route
const photoUploadJson = express.json({ limit: "4.5mb" });
// Tighter JSON cap across all other API routes
app.use((req, res, next) => {
  if (req.path === "/api/uploads/player-photo") {
    return photoUploadJson(req, res, next);
  }
  return express.json({ limit: "1.5mb" })(req, res, next);
});

const publicDir = path.resolve(process.cwd(), "public");
const playerUploadsDir = path.join(publicDir, "uploads", "players");
if (!fs.existsSync(playerUploadsDir)) {
  fs.mkdirSync(playerUploadsDir, { recursive: true });
}
app.use(
  express.static(publicDir, {
    maxAge: IS_PRODUCTION ? "7d" : "1h",
  })
);

let dbAvailable = false;
const useDb = () => dbAvailable && Boolean(db);
const sseClients = new Set<Response>();

// Rate limiters
const authLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 40,
  keyPrefix: "auth",
});
const writeLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 180,
  keyPrefix: "write",
});
const uploadLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 25,
  keyPrefix: "upload",
});

// Resolve user by ID from DB or demoStore
async function getUserById(id: number): Promise<AuthUserRecord | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  if (useDb() && db) {
    const [u] = await db.select().from(users).where(eq(users.id, id));
    return u || null;
  }
  return demoStore.users.find((u) => u.id === id) || null;
}

// Attach verified req.authUser (null when unauthenticated) on every request
app.use(attachOptionalAuth(getUserById));

// Apply write rate limiting to mutating API methods
app.use("/api", (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return writeLimiter(req, res, next);
  }
  return next();
});

// Persist raster image data URL durably into PostgreSQL `player_photos` (or demoStore + disk)
async function persistPhotoFromDataUrl(
  dataUrl: string,
  uploadedByUserId: number
): Promise<string | null> {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const declaredMime = match[1].toLowerCase();
  const base64Body = match[2];

  // Max 2.5 MB decoded image
  const maxBytes = 2.5 * 1024 * 1024;
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Body, "base64");
  } catch {
    return null;
  }
  if (buffer.length === 0 || buffer.length > maxBytes) return null;

  const detectedMime = detectImageMimeFromBuffer(buffer);
  if (!detectedMime) return null;
  // Reject MIME spoofing (e.g., SVG/HTML disguised as PNG)
  const normalizedDeclared =
    declaredMime === "image/jpg" ? "image/jpeg" : declaredMime;
  if (normalizedDeclared !== detectedMime) return null;

  const ext =
    detectedMime === "image/png"
      ? "png"
      : detectedMime === "image/webp"
        ? "webp"
        : detectedMime === "image/gif"
          ? "gif"
          : "jpg";
  const publicKey = `p-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;

  if (useDb() && db) {
    await db.insert(playerPhotos).values({
      publicKey,
      uploadedByUserId,
      mimeType: detectedMime,
      dataBase64: buffer.toString("base64"),
      sizeBytes: buffer.length,
    });
    return `/api/media/players/${publicKey}`;
  }

  // Dev fallback: store in demoStore.playerPhotos and optionally write to disk
  demoStore.playerPhotos.set(publicKey, {
    publicKey,
    uploadedByUserId,
    mimeType: detectedMime,
    dataBase64: buffer.toString("base64"),
    sizeBytes: buffer.length,
    createdAt: new Date().toISOString(),
  });
  try {
    fs.writeFileSync(path.join(playerUploadsDir, publicKey), buffer);
  } catch {
    // Non-fatal in ephemeral containers; /api/media/players/:key still serves from memory
  }
  return `/api/media/players/${publicKey}`;
}

// =========================================================================
// RESOURCE-SCOPED CLUB RBAC HELPERS
// =========================================================================

function isPlatformAdmin(actor: AuthUserRecord | null | undefined): boolean {
  return Boolean(
    actor &&
      (actor.role === "SPORTS_SECRETARY" || actor.role === "FACULTY_ADVISOR")
  );
}

async function getClubMembershipForUser(clubId: number, userId: number) {
  if (useDb() && db) {
    const [m] = await db
      .select()
      .from(clubMemberships)
      .where(
        and(
          eq(clubMemberships.clubId, clubId),
          eq(clubMemberships.userId, userId)
        )
      );
    return m || null;
  }
  return (
    demoStore.memberships.find(
      (m) => m.clubId === clubId && m.userId === userId
    ) || null
  );
}

/**
 * Enforces resource-scoped club permissions:
 * - SPORTS_SECRETARY & FACULTY_ADVISOR have platform override across all clubs.
 * - Club SECRETARY (status INDUCTED) can manage THAT club for all batches.
 * - Club COORDINATOR (status INDUCTED) can manage THAT club ONLY for their batchScope
 *   (unless batchScope === "ALL").
 */
async function checkClubPermission(
  actor: AuthUserRecord,
  clubId: number,
  targetBatchRaw?: string
): Promise<{ allowed: boolean; reason?: string; scope: string }> {
  if (isPlatformAdmin(actor)) {
    return { allowed: true, scope: "ALL" };
  }
  const membership = await getClubMembershipForUser(clubId, actor.id);
  if (!membership || membership.status !== "INDUCTED") {
    return {
      allowed: false,
      scope: "NONE",
      reason: "You are not an active official of this club",
    };
  }
  if (membership.memberRole === "SECRETARY") {
    return { allowed: true, scope: "ALL" };
  }
  if (membership.memberRole === "COORDINATOR") {
    const coordScope = normalizeBatchCode(membership.batchScope);
    if (coordScope === "ALL") {
      return { allowed: true, scope: "ALL" };
    }
    if (!targetBatchRaw) {
      return { allowed: true, scope: coordScope };
    }
    const reqBatch = normalizeBatchCode(targetBatchRaw);
    if (reqBatch === coordScope) {
      return { allowed: true, scope: coordScope };
    }
    return {
      allowed: false,
      scope: coordScope,
      reason: `Your coordinator permissions in this club are scoped to batch ${coordScope}, not ${reqBatch}`,
    };
  }
  return {
    allowed: false,
    scope: "NONE",
    reason: "Only this club's Secretary, scoped Coordinator, or Sports Admin can perform this action",
  };
}

// =========================================================================
// HEALTH & AUTH ROUTES
// =========================================================================

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    databaseConnected: useDb(),
    demoSwitcherEnabled: isDemoSwitcherEnabled(),
    serverTime: new Date().toISOString(),
  });
});

// Demo persona login — strictly gated on ENABLE_DEMO_SWITCHER === "true"
app.post("/api/auth/demo-login", authLimiter, async (req, res) => {
  try {
    if (!isDemoSwitcherEnabled()) {
      return res.status(403).json({
        error: "Demo persona switching is disabled on this server",
      });
    }
    const userId = Number(req.body?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Valid userId is required" });
    }
    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const token = signSessionToken({ id: user.id, role: user.role });
    res.json({
      token,
      user: toSelfUser(user),
    });
  } catch (err) {
    sendServerError(res, "POST /api/auth/demo-login", err);
  }
});

// Standard email + password sign-in (for non-demo / production environments)
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    let user: AuthUserRecord | null = null;
    if (useDb() && db) {
      const [u] = await db.select().from(users).where(eq(users.email, email));
      user = u || null;
    } else {
      user =
        demoStore.users.find((u) => u.email.toLowerCase() === email) || null;
    }

    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signSessionToken({ id: user.id, role: user.role });
    res.json({ token, user: toSelfUser(user) });
  } catch (err) {
    sendServerError(res, "POST /api/auth/login", err);
  }
});

// Current authenticated session profile
app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const actor = req.authUser!;
    let memberships: Array<{
      clubId: number;
      memberRole: string;
      batchScope: string;
      status: string;
    }> = [];
    let captainTeamIds: number[] = [];

    if (useDb() && db) {
      memberships = await db
        .select({
          clubId: clubMemberships.clubId,
          memberRole: clubMemberships.memberRole,
          batchScope: clubMemberships.batchScope,
          status: clubMemberships.status,
        })
        .from(clubMemberships)
        .where(eq(clubMemberships.userId, actor.id));
      const cTeams = await db
        .select({ id: tournamentTeams.id })
        .from(tournamentTeams)
        .where(eq(tournamentTeams.captainUserId, actor.id));
      captainTeamIds = cTeams.map((t) => t.id);
    } else {
      memberships = demoStore.memberships
        .filter((m) => m.userId === actor.id)
        .map((m) => ({
          clubId: m.clubId,
          memberRole: m.memberRole,
          batchScope: m.batchScope,
          status: m.status,
        }));
      captainTeamIds = demoStore.tournamentTeams
        .filter((t) => t.captainUserId === actor.id)
        .map((t) => t.id);
    }

    res.json({
      user: toSelfUser(actor),
      memberships,
      captainTeamIds,
    });
  } catch (err) {
    sendServerError(res, "GET /api/auth/me", err);
  }
});

// =========================================================================
// SANITIZED BOOTSTRAP ENDPOINT (ZERO PII TO ANONYMOUS CALLERS)
// =========================================================================

app.get("/api/bootstrap", async (req, res) => {
  try {
    const demoEnabled = isDemoSwitcherEnabled();
    const auctionStatus = auctionState.auction.status;
    const auctionPlanned = auctionStatus !== "DRAFT";
    const liveAuctionActive =
      auctionStatus === "LIVE" ||
      auctionStatus === "COMPLETED" ||
      auctionStatus === "PUBLISHED";

    if (useDb() && db) {
      const [noticeList, clubList, userList, liveMatches, archivedTournaments] =
        await Promise.all([
          db.select().from(notices).orderBy(desc(notices.id)),
          db.select().from(sportsClubs).orderBy(asc(sportsClubs.sortOrder)),
          db.select().from(users).orderBy(asc(users.id)),
          db
            .select()
            .from(tournamentMatches)
            .where(eq(tournamentMatches.status, "LIVE")),
          db
            .select()
            .from(tournaments)
            .where(eq(tournaments.status, "ARCHIVED")),
        ]);

      const urgentNotice = noticeList.find((n) => n.isUrgentBanner) || null;
      const archiveYears = Array.from(
        new Set(archivedTournaments.map((t) => t.year))
      ).sort((a, b) => b - a);

      // Only expose public persona list (id, name, batch, branch, role — NO email/rollNumber) when demo switcher is explicitly enabled
      const demoPersonas = demoEnabled ? userList.map(toPublicUser) : [];
      const selfUser = req.authUser ? toSelfUser(req.authUser) : null;

      return res.json({
        demoSwitcherEnabled: demoEnabled,
        alertBanner: urgentNotice ? urgentNotice.title : null,
        notices: noticeList,
        clubs: clubList,
        users: demoPersonas,
        currentUser: selfUser,
        hasLiveMatches: liveMatches.length > 0,
        archiveYears,
        auctionPlanned,
        liveAuctionActive,
        auctionStatus,
      });
    }

    const urgentNotice = demoStore.notices.find((n) => n.isUrgentBanner) || null;
    const hasLiveMatches = demoStore.matches.some((m) => m.status === "LIVE");
    const archiveYears = Array.from(
      new Set(
        demoStore.tournaments
          .filter((t) => t.status === "ARCHIVED")
          .map((t) => t.year)
      )
    ).sort((a, b) => b - a);

    const demoPersonas = demoEnabled ? demoStore.users.map(toPublicUser) : [];
    const selfUser = req.authUser ? toSelfUser(req.authUser) : null;

    res.json({
      demoSwitcherEnabled: demoEnabled,
      alertBanner: urgentNotice ? urgentNotice.title : null,
      notices: demoStore.notices,
      clubs: demoStore.clubs,
      users: demoPersonas,
      currentUser: selfUser,
      hasLiveMatches,
      archiveYears,
      auctionPlanned,
      liveAuctionActive,
      auctionStatus,
    });
  } catch (err) {
    sendServerError(res, "GET /api/bootstrap", err);
  }
});

// =========================================================================
// NOTIFICATIONS (AUTHENTICATED, SCOPED TO SELF)
// =========================================================================

app.get("/api/notifications", requireAuth, async (req, res) => {
  try {
    const uid = req.authUser!.id;
    if (useDb() && db) {
      const list = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, uid))
        .orderBy(desc(notifications.id))
        .limit(40);
      const unreadCount = list.filter((n) => !n.isRead).length;
      return res.json({ notifications: list, unreadCount });
    }
    const list = demoStore.notifications
      .filter((n) => n.userId === uid)
      .sort((a, b) => b.id - a.id)
      .slice(0, 40);
    res.json({
      notifications: list,
      unreadCount: list.filter((n) => !n.isRead).length,
    });
  } catch (err) {
    sendServerError(res, "GET /api/notifications", err);
  }
});

app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const uid = req.authUser!.id;
    if (useDb() && db) {
      const [updated] = await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, id), eq(notifications.userId, uid)))
        .returning();
      if (!updated) {
        return res.status(404).json({ error: "Notification not found" });
      }
      return res.json({ notification: updated });
    }
    const item = demoStore.notifications.find(
      (n) => n.id === id && n.userId === uid
    );
    if (!item) return res.status(404).json({ error: "Notification not found" });
    item.isRead = true;
    res.json({ notification: item });
  } catch (err) {
    sendServerError(res, "PATCH /api/notifications/:id/read", err);
  }
});

app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const uid = req.authUser!.id;
    if (useDb() && db) {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.userId, uid));
      return res.json({ ok: true });
    }
    for (const n of demoStore.notifications) {
      if (n.userId === uid) n.isRead = true;
    }
    res.json({ ok: true });
  } catch (err) {
    sendServerError(res, "POST /api/notifications/read-all", err);
  }
});

// =========================================================================
// AUTHENTICATED PHOTO UPLOAD & DURABLE SERVING ROUTE
// =========================================================================

app.post(
  "/api/uploads/player-photo",
  requireAuth,
  uploadLimiter,
  async (req, res) => {
    try {
      const dataUrl = String(req.body?.dataUrl || "").trim();
      if (!dataUrl.startsWith("data:image/")) {
        return res.status(400).json({ error: "Image dataUrl is required" });
      }
      const photoUrl = await persistPhotoFromDataUrl(dataUrl, req.authUser!.id);
      if (!photoUrl) {
        return res.status(400).json({
          error:
            "Unsupported or oversized image. Upload JPEG, PNG, WebP, or GIF up to 2.5 MB.",
        });
      }
      res.status(201).json({ photoUrl });
    } catch (err) {
      sendServerError(res, "POST /api/uploads/player-photo", err);
    }
  }
);

app.get("/api/media/players/:publicKey", async (req, res) => {
  try {
    const key = String(req.params.publicKey || "").trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
      return res.status(400).json({ error: "Invalid photo key" });
    }

    if (useDb() && db) {
      const [row] = await db
        .select()
        .from(playerPhotos)
        .where(eq(playerPhotos.publicKey, key));
      if (row) {
        const buf = Buffer.from(row.dataBase64, "base64");
        res.setHeader("Content-Type", row.mimeType);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return res.send(buf);
      }
    } else {
      const mem = demoStore.playerPhotos.get(key);
      if (mem) {
        const buf = Buffer.from(mem.dataBase64, "base64");
        res.setHeader("Content-Type", mem.mimeType);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return res.send(buf);
      }
    }

    // Fallback to static uploads directory with strict path containment check
    const resolved = path.resolve(playerUploadsDir, key);
    if (!resolved.startsWith(playerUploadsDir + path.sep) || !fs.existsSync(resolved)) {
      return res.status(404).json({ error: "Photo not found" });
    }
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.sendFile(resolved);
  } catch (err) {
    sendServerError(res, "GET /api/media/players/:publicKey", err);
  }
});

// =========================================================================
// PUBLIC PLAYER PROFILE & SPORTS STATS (ZERO PII)
// =========================================================================

app.get("/api/players/:id", async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid player ID" });
    }

    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: "Player not found" });

    // Strict public view — NEVER include email, rollNumber, phone, or hostel
    const profile = toPublicUser(user);

    let clubs: Array<{
      clubId: number;
      clubSlug: string;
      clubName: string;
      memberRole: string;
      status: string;
    }> = [];

    let teamHistory: Array<{
      teamId: number;
      teamName: string;
      sportName: string;
      tournamentName: string;
      tournamentYear: number;
      placement: string | null;
      playerRole: string;
    }> = [];

    if (useDb() && db) {
      const [mems, allClubs, rosterRows, allTeams, allTourneys] =
        await Promise.all([
          db
            .select()
            .from(clubMemberships)
            .where(eq(clubMemberships.userId, userId)),
          db.select().from(sportsClubs),
          db
            .select()
            .from(teamRosterMembers)
            .where(eq(teamRosterMembers.userId, userId)),
          db.select().from(tournamentTeams),
          db.select().from(tournaments),
        ]);

      const clubMap = new Map(allClubs.map((c) => [c.id, c]));
      clubs = mems
        .filter((m) => m.status === "INDUCTED")
        .map((m) => {
          const c = clubMap.get(m.clubId);
          return {
            clubId: m.clubId,
            clubSlug: c?.slug || "",
            clubName: c?.name || "Club",
            memberRole: m.memberRole,
            status: m.status,
          };
        });

      const teamMap = new Map(allTeams.map((t) => [t.id, t]));
      const tourneyMap = new Map(allTourneys.map((t) => [t.id, t]));
      teamHistory = rosterRows.map((r) => {
        const tm = teamMap.get(r.teamId);
        const tr = tm ? tourneyMap.get(tm.tournamentId) : undefined;
        return {
          teamId: r.teamId,
          teamName: tm?.teamName || "Team",
          sportName: tm?.sportName || "",
          tournamentName: tr?.name || "Tournament",
          tournamentYear: tr?.year || 2026,
          placement: tm?.placement || null,
          playerRole: r.playerRole,
        };
      });
    } else {
      const clubMap = new Map(demoStore.clubs.map((c) => [c.id, c]));
      clubs = demoStore.memberships
        .filter((m) => m.userId === userId && m.status === "INDUCTED")
        .map((m) => {
          const c = clubMap.get(m.clubId);
          return {
            clubId: m.clubId,
            clubSlug: c?.slug || "",
            clubName: c?.name || "Club",
            memberRole: m.memberRole,
            status: m.status,
          };
        });

      const teamMap = new Map(demoStore.tournamentTeams.map((t) => [t.id, t]));
      const tourneyMap = new Map(demoStore.tournaments.map((t) => [t.id, t]));
      teamHistory = demoStore.rosterMembers
        .filter((r) => r.userId === userId)
        .map((r) => {
          const tm = teamMap.get(r.teamId);
          const tr = tm ? tourneyMap.get(tm.tournamentId) : undefined;
          return {
            teamId: r.teamId,
            teamName: tm?.teamName || "Team",
            sportName: tm?.sportName || "",
            tournamentName: tr?.name || "Tournament",
            tournamentYear: tr?.year || 2026,
            placement: tm?.placement || null,
            playerRole: r.playerRole,
          };
        });
    }

    const franchiseMap = new Map(
      auctionState.franchises.map((f) => [f.id, f.name])
    );
    const auctionEntries = auctionState.registrations
      .filter((r) => r.userId === userId)
      .map((r) => ({
        id: r.id,
        sport: r.sport,
        positions: r.positions,
        playerClass: r.playerClass,
        tier: r.tier,
        status: r.status,
        basePrice: r.basePrice,
        soldPrice: r.soldPrice,
        soldToFranchiseName: r.soldToFranchiseId
          ? franchiseMap.get(r.soldToFranchiseId) || null
          : null,
        statsSummary: r.statsSummary,
        photoUrl: r.photoUrl || null,
      }));

    res.json({
      profile,
      clubs,
      teamHistory,
      auctionEntries,
    });
  } catch (err) {
    sendServerError(res, "GET /api/players/:id", err);
  }
});

// =========================================================================
// CLUBS, SCHEDULED ACTIVITIES & FULL INDUCTION LIFECYCLE
// =========================================================================

app.get("/api/clubs/:slug", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const actor = req.authUser || null;

    if (useDb() && db) {
      const [club] = await db
        .select()
        .from(sportsClubs)
        .where(eq(sportsClubs.slug, slug));
      if (!club) return res.status(404).json({ error: "Club not found" });

      const [mems, allUsers, acts] = await Promise.all([
        db
          .select()
          .from(clubMemberships)
          .where(eq(clubMemberships.clubId, club.id)),
        db.select().from(users),
        db
          .select()
          .from(clubActivities)
          .where(eq(clubActivities.clubId, club.id))
          .orderBy(desc(clubActivities.id)),
      ]);

      const perm = actor
        ? await checkClubPermission(actor, club.id)
        : { allowed: false, scope: "NONE" };

      const userMap = new Map(allUsers.map((u) => [u.id, u]));
      const members = mems.map((m) => {
        const u = userMap.get(m.userId);
        return {
          id: m.id,
          clubId: m.clubId,
          userId: m.userId,
          memberRole: m.memberRole,
          batchScope: m.batchScope,
          status: m.status,
          userName: u?.name || "Unknown",
          userBatch: u?.batch || "",
          userBranch: u?.branch || "",
        };
      });

      const userNotifs = actor
        ? await db
            .select()
            .from(notifications)
            .where(
              and(
                eq(notifications.clubId, club.id),
                eq(notifications.userId, actor.id)
              )
            )
            .orderBy(desc(notifications.id))
        : [];

      return res.json({
        club,
        members,
        activities: acts.map((a) => ({
          ...a,
          scheduledAt: a.scheduledAt ? a.scheduledAt.toISOString() : a.scheduledLabel,
        })),
        notifications: userNotifs,
        canManageClub: perm.allowed,
        manageBatchScope: perm.scope,
      });
    }

    const club = demoStore.clubs.find((c) => c.slug === slug);
    if (!club) return res.status(404).json({ error: "Club not found" });

    const perm = actor
      ? await checkClubPermission(actor, club.id)
      : { allowed: false, scope: "NONE" };

    const userMap = new Map(demoStore.users.map((u) => [u.id, u]));
    const members = demoStore.memberships
      .filter((m) => m.clubId === club.id)
      .map((m) => {
        const u = userMap.get(m.userId);
        return {
          id: m.id,
          clubId: m.clubId,
          userId: m.userId,
          memberRole: m.memberRole,
          batchScope: m.batchScope,
          status: m.status,
          userName: u?.name || "Unknown",
          userBatch: u?.batch || "",
          userBranch: u?.branch || "",
        };
      });

    const activities = demoStore.activities
      .filter((a) => a.clubId === club.id)
      .sort((a, b) => b.id - a.id);

    const userNotifs = actor
      ? demoStore.notifications
          .filter((n) => n.clubId === club.id && n.userId === actor.id)
          .sort((a, b) => b.id - a.id)
      : [];

    res.json({
      club,
      members,
      activities,
      notifications: userNotifs,
      canManageClub: perm.allowed,
      manageBatchScope: perm.scope,
    });
  } catch (err) {
    sendServerError(res, "GET /api/clubs/:slug", err);
  }
});

// Toggle club inductionOpen (club Secretary / Sports Admin only)
app.patch("/api/clubs/:slug/induction-toggle", requireAuth, async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const actor = req.authUser!;
    const inductionOpen = Boolean(req.body?.inductionOpen);

    if (useDb() && db) {
      const [club] = await db
        .select()
        .from(sportsClubs)
        .where(eq(sportsClubs.slug, slug));
      if (!club) return res.status(404).json({ error: "Club not found" });
      const perm = await checkClubPermission(actor, club.id, "ALL");
      if (!perm.allowed) {
        return res.status(403).json({
          error: perm.reason || "Not authorized to toggle induction status",
        });
      }
      const [updated] = await db
        .update(sportsClubs)
        .set({ inductionOpen })
        .where(eq(sportsClubs.id, club.id))
        .returning();
      return res.json({ club: updated });
    }

    const club = demoStore.clubs.find((c) => c.slug === slug);
    if (!club) return res.status(404).json({ error: "Club not found" });
    const perm = await checkClubPermission(actor, club.id, "ALL");
    if (!perm.allowed) {
      return res.status(403).json({
        error: perm.reason || "Not authorized to toggle induction status",
      });
    }
    club.inductionOpen = inductionOpen;
    res.json({ club });
  } catch (err) {
    sendServerError(res, "PATCH /api/clubs/:slug/induction-toggle", err);
  }
});

// Schedule club practice / trial / induction (enforces per-club membership & batchScope!)
app.post("/api/clubs/:slug/activities", requireAuth, async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const actor = req.authUser!;
    const { activityType, targetBatch, categoryGender, scheduledLabel, scheduledAt, venue } =
      req.body || {};

    if (!activityType || !targetBatch || !categoryGender) {
      return res.status(400).json({ error: "Missing required activity fields" });
    }

    const normalizedBatch = normalizeBatchCode(String(targetBatch));
    const parsedTime = scheduledAt || scheduledLabel;
    const parsedDate = parsedTime ? new Date(String(parsedTime)) : null;
    const isoTimestamp =
      parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate.toISOString()
        : new Date(Date.now() + 3600_000).toISOString();

    if (useDb() && db) {
      const [club] = await db
        .select()
        .from(sportsClubs)
        .where(eq(sportsClubs.slug, slug));
      if (!club) return res.status(404).json({ error: "Club not found" });

      const perm = await checkClubPermission(actor, club.id, normalizedBatch);
      if (!perm.allowed) {
        return res.status(403).json({ error: perm.reason || "Forbidden" });
      }

      const [created] = await db
        .insert(clubActivities)
        .values({
          clubId: club.id,
          activityType: String(activityType).trim(),
          targetBatch: normalizedBatch,
          categoryGender: String(categoryGender).trim(),
          scheduledLabel: isoTimestamp,
          scheduledAt: new Date(isoTimestamp),
          venue: String(venue || club.venue).trim(),
          createdByUserId: actor.id,
        })
        .returning();

      const clubMems = await db
        .select()
        .from(clubMemberships)
        .where(
          and(
            eq(clubMemberships.clubId, club.id),
            eq(clubMemberships.status, "INDUCTED")
          )
        );
      for (const m of clubMems) {
        await db.insert(notifications).values({
          userId: m.userId,
          clubId: club.id,
          message: `${club.name}: ${activityType} · ${normalizedBatch} · ${categoryGender} at ${venue || club.venue}`,
          isRead: false,
        });
      }

      return res.status(201).json({
        activity: created,
        notifiedCount: clubMems.length,
      });
    }

    const club = demoStore.clubs.find((c) => c.slug === slug);
    if (!club) return res.status(404).json({ error: "Club not found" });

    const perm = await checkClubPermission(actor, club.id, normalizedBatch);
    if (!perm.allowed) {
      return res.status(403).json({ error: perm.reason || "Forbidden" });
    }

    const created = {
      id: Math.max(0, ...demoStore.activities.map((a) => a.id)) + 1,
      clubId: club.id,
      activityType: String(activityType).trim(),
      targetBatch: normalizedBatch,
      categoryGender: String(categoryGender).trim(),
      scheduledLabel: isoTimestamp,
      scheduledAt: isoTimestamp,
      venue: String(venue || club.venue).trim(),
      createdByUserId: actor.id,
      createdAt: new Date(),
    };
    demoStore.activities.push(created);

    const inducted = demoStore.memberships.filter(
      (m) => m.clubId === club.id && m.status === "INDUCTED"
    );
    for (const m of inducted) {
      demoStore.notifications.unshift({
        id: Math.max(0, ...demoStore.notifications.map((n) => n.id)) + 1,
        userId: m.userId,
        clubId: club.id,
        message: `${club.name}: ${activityType} · ${normalizedBatch} · ${categoryGender} at ${created.venue}`,
        isRead: false,
        createdAt: new Date(),
      });
    }

    res.status(201).json({
      activity: created,
      notifiedCount: inducted.length,
    });
  } catch (err) {
    sendServerError(res, "POST /api/clubs/:slug/activities", err);
  }
});

// Apply for club induction (enforces auth + club.inductionOpen === true)
app.post("/api/clubs/:slug/induction-apply", requireAuth, async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const actor = req.authUser!;

    if (useDb() && db) {
      const [club] = await db
        .select()
        .from(sportsClubs)
        .where(eq(sportsClubs.slug, slug));
      if (!club) return res.status(404).json({ error: "Club not found" });
      if (!club.inductionOpen) {
        return res
          .status(400)
          .json({ error: `Inductions are currently closed for ${club.name}` });
      }

      const [existing] = await db
        .select()
        .from(clubMemberships)
        .where(
          and(
            eq(clubMemberships.clubId, club.id),
            eq(clubMemberships.userId, actor.id)
          )
        );
      if (existing) {
        return res.json({
          membership: existing,
          message: `Existing status: ${existing.status}`,
        });
      }

      const [created] = await db
        .insert(clubMemberships)
        .values({
          clubId: club.id,
          userId: actor.id,
          memberRole: "MEMBER",
          batchScope: normalizeBatchCode(actor.batch),
          status: "APPLIED",
        })
        .returning();
      return res.status(201).json({ membership: created });
    }

    const club = demoStore.clubs.find((c) => c.slug === slug);
    if (!club) return res.status(404).json({ error: "Club not found" });
    if (!club.inductionOpen) {
      return res
        .status(400)
        .json({ error: `Inductions are currently closed for ${club.name}` });
    }

    const existing = demoStore.memberships.find(
      (m) => m.clubId === club.id && m.userId === actor.id
    );
    if (existing) {
      return res.json({
        membership: existing,
        message: `Existing status: ${existing.status}`,
      });
    }

    const created = {
      id: Math.max(0, ...demoStore.memberships.map((m) => m.id)) + 1,
      clubId: club.id,
      userId: actor.id,
      memberRole: "MEMBER",
      batchScope: normalizeBatchCode(actor.batch),
      status: "APPLIED",
      createdAt: new Date(),
    };
    demoStore.memberships.push(created);
    res.status(201).json({ membership: created });
  } catch (err) {
    sendServerError(res, "POST /api/clubs/:slug/induction-apply", err);
  }
});

// Update induction status: APPLIED -> TRIAL_ATTENDED -> INDUCTED | REJECTED (per-club + batchScope RBAC!)
app.patch("/api/memberships/:id/status", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const actor = req.authUser!;
    const nextStatus = String(req.body?.status || "").toUpperCase();
    if (
      !["APPLIED", "TRIAL_ATTENDED", "INDUCTED", "REJECTED"].includes(
        nextStatus
      )
    ) {
      return res.status(400).json({
        error: "Invalid status (expected APPLIED, TRIAL_ATTENDED, INDUCTED, or REJECTED)",
      });
    }

    if (useDb() && db) {
      const [existing] = await db
        .select()
        .from(clubMemberships)
        .where(eq(clubMemberships.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Membership record not found" });
      }
      const applicant = await getUserById(existing.userId);
      const perm = await checkClubPermission(
        actor,
        existing.clubId,
        applicant?.batch || existing.batchScope
      );
      if (!perm.allowed) {
        return res.status(403).json({ error: perm.reason || "Forbidden" });
      }

      const [updated] = await db
        .update(clubMemberships)
        .set({ status: nextStatus })
        .where(eq(clubMemberships.id, id))
        .returning();

      const [club] = await db
        .select()
        .from(sportsClubs)
        .where(eq(sportsClubs.id, existing.clubId));

      await db.insert(notifications).values({
        userId: existing.userId,
        clubId: existing.clubId,
        message: `${club?.name || "Club"} induction update: your status is now ${nextStatus}.`,
        isRead: false,
      });

      return res.json({ membership: updated });
    }

    const existing = demoStore.memberships.find((m) => m.id === id);
    if (!existing) {
      return res.status(404).json({ error: "Membership record not found" });
    }
    const applicant = demoStore.users.find((u) => u.id === existing.userId);
    const perm = await checkClubPermission(
      actor,
      existing.clubId,
      applicant?.batch || existing.batchScope
    );
    if (!perm.allowed) {
      return res.status(403).json({ error: perm.reason || "Forbidden" });
    }

    existing.status = nextStatus;
    const club = demoStore.clubs.find((c) => c.id === existing.clubId);
    demoStore.notifications.unshift({
      id: Math.max(0, ...demoStore.notifications.map((n) => n.id)) + 1,
      userId: existing.userId,
      clubId: existing.clubId,
      message: `${club?.name || "Club"} induction update: your status is now ${nextStatus}.`,
      isRead: false,
      createdAt: new Date(),
    });
    res.json({ membership: existing });
  } catch (err) {
    sendServerError(res, "PATCH /api/memberships/:id/status", err);
  }
});

// Mount modular auction & tournament routes
registerAuctionRoutes(app, {
  useDb,
  sseClients,
  persistPhotoFromDataUrl,
});
registerTournamentRoutes(app, { useDb });

// =========================================================================
// STARTUP (FAIL-FAST IN PRODUCTION) & GRACEFUL SHUTDOWN
// =========================================================================

async function startServer() {
  if (hasDatabase && pool) {
    try {
      await pool.query("SELECT 1");
      dbAvailable = true;
      console.log("Connected to PostgreSQL via DATABASE_URL.");
      await hydrateAuctionFromDb(useDb);
    } catch (err) {
      if (IS_PRODUCTION) {
        console.error(
          "FATAL: PostgreSQL is unreachable in production mode. Refusing to start with in-memory fallback.",
          err
        );
        process.exit(1);
      }
      dbAvailable = false;
      console.warn(
        "PostgreSQL connection failed in development; using in-memory demo fallback:",
        err instanceof Error ? err.message : "connection error"
      );
    }
  } else {
    if (IS_PRODUCTION) {
      console.error(
        "FATAL: DATABASE_URL is required when NODE_ENV=production. Refusing to start with in-memory fallback."
      );
      process.exit(1);
    }
    console.log(
      "DATABASE_URL not configured in development — running with in-memory demo store."
    );
  }

  // Mount Vite middleware in dev, or serve dist/client in production
  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distClientDir = path.resolve(process.cwd(), "dist/client");
    if (fs.existsSync(distClientDir)) {
      app.use(express.static(distClientDir, { maxAge: "7d" }));
      app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api")) return next();
        res.sendFile(path.join(distClientDir, "index.html"));
      });
    }
  }

  // Final safe error handler (never leaks stack traces or raw err strings)
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      sendServerError(res, "UnhandledExpressError", err);
    }
  );

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `IIITT Sports server listening on http://localhost:${PORT} (demoSwitcher=${isDemoSwitcherEnabled()})`
    );
  });

  // Track active sockets for clean shutdown
  const activeSockets = new Set<Socket>();
  server.on("connection", (socket) => {
    activeSockets.add(socket);
    socket.on("close", () => activeSockets.delete(socket));
  });

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; closing SSE streams, HTTP server, and DB pool...`);

    // 1. End all open SSE streams cleanly
    for (const client of sseClients) {
      try {
        client.write("event: shutdown\ndata: {}\n\n");
        client.end();
      } catch {
        // ignore
      }
    }
    sseClients.clear();

    // 2. Force-exit safety timeout
    const forceTimer = setTimeout(() => {
      console.error("Forced shutdown after timeout.");
      process.exit(1);
    }, 6_000);
    forceTimer.unref();

    // 3. Close HTTP server & idle sockets
    server.close(async () => {
      try {
        if (pool) await pool.end();
      } catch {
        // ignore
      }
      clearTimeout(forceTimer);
      process.exit(0);
    });

    for (const socket of activeSockets) {
      socket.end();
      setTimeout(() => {
        if (!socket.destroyed) socket.destroy();
      }, 1500).unref();
    }
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
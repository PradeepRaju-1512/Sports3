import "dotenv/config";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Socket } from "net";
import express, { type Response } from "express";
import compression from "compression";
import cors from "cors";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, hasDatabase, pool } from "../db/index.js";
import {
  auctionOperators,
  clubActivities,
  clubMemberships,
  notices,
  notifications,
  playerPhotos,
  siteSettings,
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
  clearOAuthStateCookie,
  clearSessionCookie,
  cookieCsrfGuard,
  isDemoSwitcherEnabled,
  isGoogleOAuthConfigured,
  OAUTH_STATE_COOKIE_NAME,
  parseCookies,
  requireAuth,
  setOAuthStateCookie,
  setSessionCookie,
  signSessionToken,
  toPublicUser,
  toSelfUser,
  validateProductionSessionSecret,
  verifyPassword,
  type AuthUserRecord,
} from "./auth.js";
import {
  buildCorsOptions,
  createRateLimiter,
  detectImageMimeFromBuffer,
  normalizeBatchCode,
  parseTrustProxySetting,
  securityHeadersMiddleware,
  sendServerError,
} from "./security.js";
import {
  hydrateAuctionFromDb,
  registerAuctionRoutes,
} from "./auctionRoutes.js";
import { registerTournamentRoutes } from "./tournamentRoutes.js";
import { registerRoleAndAdminRoutes } from "./roleRoutes.js";

// Fail fast in production if SESSION_SECRET is missing or weak
validateProductionSessionSecret();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

app.disable("x-powered-by");
app.set("trust proxy", parseTrustProxySetting());
app.use(securityHeadersMiddleware);
app.use(cors(buildCorsOptions()));

// Gzip compression for JSON/HTML/assets (never compress SSE event streams)
app.use(
  compression({
    filter(req, res) {
      if (
        req.path === "/api/auction/stream" ||
        req.path === "/api/matches/stream"
      ) {
        return false;
      }
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
  })
);

// Dedicated cap for authenticated player photo upload route (1.5 MB binary -> ~2.1 MB base64 JSON)
const photoUploadJson = express.json({ limit: "2.5mb" });
const standardJson = express.json({ limit: "1.5mb" });
app.use((req, res, next) => {
  if (req.path === "/api/uploads/player-photo") {
    return photoUploadJson(req, res, next);
  }
  return standardJson(req, res, next);
});

// Clean 400/413 JSON responses on malformed JSON or oversized payloads
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const e = err as { type?: string; status?: number };
    if (e && e.type === "entity.too.large") {
      return res.status(413).json({ error: "Request payload too large" });
    }
    if (err instanceof SyntaxError && e && e.status === 400) {
      return res.status(400).json({ error: "Malformed JSON request body" });
    }
    return next(err);
  }
);

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
const matchSseClients = new Set<Response>();

// Campus-NAT-safe rate limiters (keyed by userId when signed in, req.ip when anonymous; high bursts for live officials)
const authLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 30,
  keyPrefix: "auth",
});
const writeLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 180,
  exemptPrivileged: true,
  keyPrefix: "write",
});
const uploadLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 25,
  privilegedMaxRequests: 100,
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

// Attach verified req.authUser (from Bearer header or HttpOnly session cookie) on every request
app.use(attachOptionalAuth(getUserById));

// CSRF protection for cookie-authenticated mutations
app.use("/api", cookieCsrfGuard);

// Apply write rate limiting to mutating API methods
app.use("/api", (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return writeLimiter(req, res, next);
  }
  return next();
});

// =========================================================================
// SITE SETTINGS & LIVE NAV SNAPSHOT BROADCAST
// =========================================================================

async function readSiteSettings(): Promise<{
  showAuctionInNav: boolean;
  showLiveAuctionInNav: boolean;
}> {
  if (useDb() && db) {
    const [row] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.id, 1));
    if (row) {
      return {
        showAuctionInNav: row.showAuctionInNav,
        showLiveAuctionInNav: row.showLiveAuctionInNav,
      };
    }
    return {
      showAuctionInNav: true,
      showLiveAuctionInNav: false,
    };
  }
  return {
    showAuctionInNav: demoStore.siteSettings.showAuctionInNav,
    showLiveAuctionInNav: demoStore.siteSettings.showLiveAuctionInNav,
  };
}

async function getNavSnapshot(): Promise<{
  hasLiveMatches: boolean;
  showAuctionInNav: boolean;
  showLiveAuctionInNav: boolean;
  auctionStatus: string;
  alertBanner: string | null;
}> {
  const settings = await readSiteSettings();
  const auctionStatus = auctionState.auction.status;
  const auctionPlanned =
    settings.showAuctionInNav && auctionStatus !== "DRAFT";
  const liveAuctionActive =
    settings.showLiveAuctionInNav ||
    auctionStatus === "LIVE" ||
    auctionStatus === "COMPLETED" ||
    auctionStatus === "PUBLISHED";

  if (useDb() && db) {
    const [liveMatches, urgentRows] = await Promise.all([
      db
        .select({ id: tournamentMatches.id })
        .from(tournamentMatches)
        .where(eq(tournamentMatches.status, "LIVE")),
      db
        .select({ title: notices.title })
        .from(notices)
        .where(eq(notices.isUrgentBanner, true))
        .orderBy(desc(notices.id))
        .limit(1),
    ]);
    return {
      hasLiveMatches: liveMatches.length > 0,
      showAuctionInNav: auctionPlanned,
      showLiveAuctionInNav: liveAuctionActive,
      auctionStatus,
      alertBanner: urgentRows[0]?.title || null,
    };
  }

  const urgentNotice = demoStore.notices.find((n) => n.isUrgentBanner) || null;
  return {
    hasLiveMatches: demoStore.matches.some((m) => m.status === "LIVE"),
    showAuctionInNav: auctionPlanned,
    showLiveAuctionInNav: liveAuctionActive,
    auctionStatus,
    alertBanner: urgentNotice ? urgentNotice.title : null,
  };
}

async function broadcastNavUpdate(): Promise<void> {
  if (matchSseClients.size === 0) return;
  try {
    const nav = await getNavSnapshot();
    const payload = `event: nav_update\ndata: ${JSON.stringify(nav)}\n\n`;
    for (const client of Array.from(matchSseClients)) {
      try {
        client.write(payload);
      } catch {
        matchSseClients.delete(client);
      }
    }
  } catch (err) {
    console.error("[SSE] broadcastNavUpdate error:", err);
  }
}

// =========================================================================
// DURABLE PHOTO STORAGE WITH STRICT SIZE & PER-USER CAPS
// =========================================================================

const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024; // 1.5 MB decoded image max
const MAX_PHOTOS_PER_USER = 5;
const MAX_TOTAL_BYTES_PER_USER = 5 * 1024 * 1024; // 5 MB total per user

async function persistPhotoFromDataUrl(
  dataUrl: string,
  uploadedByUserId: number
): Promise<string | null> {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const declaredMime = match[1].toLowerCase();
  const base64Body = match[2];

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Body, "base64");
  } catch {
    return null;
  }
  if (buffer.length === 0 || buffer.length > MAX_PHOTO_BYTES) return null;

  const detectedMime = detectImageMimeFromBuffer(buffer);
  if (!detectedMime) return null;
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
    // Enforce per-user photo count & total byte cap by pruning oldest photos for that user
    const existingPhotos = await db
      .select({
        id: playerPhotos.id,
        sizeBytes: playerPhotos.sizeBytes,
      })
      .from(playerPhotos)
      .where(eq(playerPhotos.uploadedByUserId, uploadedByUserId))
      .orderBy(asc(playerPhotos.id));

    let totalBytes = existingPhotos.reduce((acc, p) => acc + p.sizeBytes, 0);
    const idsToDelete: number[] = [];
    let remainingCount = existingPhotos.length;
    for (const p of existingPhotos) {
      if (
        remainingCount >= MAX_PHOTOS_PER_USER ||
        totalBytes + buffer.length > MAX_TOTAL_BYTES_PER_USER
      ) {
        idsToDelete.push(p.id);
        totalBytes -= p.sizeBytes;
        remainingCount -= 1;
      }
    }
    if (idsToDelete.length > 0) {
      await db
        .delete(playerPhotos)
        .where(inArray(playerPhotos.id, idsToDelete));
    }

    await db.insert(playerPhotos).values({
      publicKey,
      uploadedByUserId,
      mimeType: detectedMime,
      dataBase64: buffer.toString("base64"),
      sizeBytes: buffer.length,
    });
    return `/api/media/players/${publicKey}`;
  }

  // Dev fallback: enforce per-user quota in demoStore
  const userEntries = Array.from(demoStore.playerPhotos.entries())
    .filter(([, v]) => v.uploadedByUserId === uploadedByUserId)
    .sort((a, b) => a[1].createdAt.localeCompare(b[1].createdAt));

  let totalBytes = userEntries.reduce((acc, [, v]) => acc + v.sizeBytes, 0);
  let remainingCount = userEntries.length;
  for (const [key, val] of userEntries) {
    if (
      remainingCount >= MAX_PHOTOS_PER_USER ||
      totalBytes + buffer.length > MAX_TOTAL_BYTES_PER_USER
    ) {
      demoStore.playerPhotos.delete(key);
      totalBytes -= val.sizeBytes;
      remainingCount -= 1;
    }
  }

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
    reason:
      "Only this club's Secretary, scoped Coordinator, or Sports Admin can perform this action",
  };
}

// =========================================================================
// HEALTH & AUTH ROUTES (COOKIE SESSIONS + ASYNC SCRYPT + GOOGLE OAUTH)
// =========================================================================

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    databaseConnected: useDb(),
    demoSwitcherEnabled: isDemoSwitcherEnabled(),
    googleOAuthEnabled: isGoogleOAuthConfigured(),
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
    setSessionCookie(res, token);
    res.json({
      token,
      user: toSelfUser(user),
    });
  } catch (err) {
    sendServerError(res, "POST /api/auth/demo-login", err);
  }
});

// Standard email + password sign-in (async scrypt + persistent HttpOnly cookie)
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required" });
    }

    let user: AuthUserRecord | null = null;
    if (useDb() && db) {
      const [u] = await db.select().from(users).where(eq(users.email, email));
      user = u || null;
    } else {
      user =
        demoStore.users.find((u) => u.email.toLowerCase() === email) || null;
    }

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    let passwordOk = false;
    if (user.passwordHash) {
      passwordOk = await verifyPassword(password, user.passwordHash);
    } else if (!IS_PRODUCTION && process.env.SEED_USER_PASSWORD) {
      // Development in-memory fallback when SEED_USER_PASSWORD is set in env
      const configured = Buffer.from(process.env.SEED_USER_PASSWORD);
      const supplied = Buffer.from(password);
      passwordOk =
        configured.length === supplied.length &&
        crypto.timingSafeEqual(configured, supplied);
    }

    if (!passwordOk) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signSessionToken({ id: user.id, role: user.role });
    setSessionCookie(res, token);
    res.json({ token, user: toSelfUser(user) });
  } catch (err) {
    sendServerError(res, "POST /api/auth/login", err);
  }
});

// Clean sign-out (clears HttpOnly session cookie)
app.post("/api/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

function getOAuthRedirectUri(req: express.Request): string {
  const configuredBase = process.env.APP_BASE_URL?.trim();
  if (configuredBase) {
    return `${configuredBase.replace(/\/+$/, "")}/api/auth/google/callback`;
  }
  const proto = String(
    req.headers["x-forwarded-proto"] || req.protocol || "http"
  )
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();
  return `${proto}://${host}/api/auth/google/callback`;
}

// Initiate @iiitt.ac.in Google OAuth 2.0 sign-in
app.get("/api/auth/google", authLimiter, (req, res) => {
  if (!isGoogleOAuthConfigured()) {
    return res.status(503).json({
      error: "Google Workspace sign-in is not configured on this server",
    });
  }
  const state = crypto.randomBytes(24).toString("hex");
  setOAuthStateCookie(res, state);

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: getOAuthRedirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    hd: "iiitt.ac.in",
    prompt: "select_account",
  });
  return res.redirect(
    302,
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
});

// Handle Google OAuth 2.0 callback & verify @iiitt.ac.in domain
app.get("/api/auth/google/callback", authLimiter, async (req, res) => {
  try {
    if (!isGoogleOAuthConfigured()) {
      return res.redirect(302, "/login?error=oauth_unconfigured");
    }

    const code = String(req.query.code || "").trim();
    const state = String(req.query.state || "").trim();
    const cookies = parseCookies(req.headers.cookie);
    const expectedState = cookies[OAUTH_STATE_COOKIE_NAME] || "";
    clearOAuthStateCookie(res);

    if (!code || !state || !expectedState) {
      return res.redirect(302, "/login?error=invalid_state");
    }
    const a = Buffer.from(state);
    const b = Buffer.from(expectedState);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.redirect(302, "/login?error=invalid_state");
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirect_uri: getOAuthRedirectUri(req),
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return res.redirect(302, "/login?error=token_exchange_failed");
    }
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      return res.redirect(302, "/login?error=token_exchange_failed");
    }

    const profileRes = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );
    if (!profileRes.ok) {
      return res.redirect(302, "/login?error=userinfo_failed");
    }

    const profile = (await profileRes.json()) as {
      email?: string;
      email_verified?: boolean;
      name?: string;
      hd?: string;
    };

    const email = String(profile.email || "")
      .trim()
      .toLowerCase();
    if (
      !profile.email_verified ||
      !email.endsWith("@iiitt.ac.in")
    ) {
      return res.redirect(302, "/login?error=domain_not_allowed");
    }

    const displayName = String(profile.name || email.split("@")[0]).trim();
    let user: AuthUserRecord | null = null;

    if (useDb() && db) {
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, email));
      if (existing) {
        user = existing;
      } else {
        const [created] = await db
          .insert(users)
          .values({
            name: displayName,
            email,
            rollNumber: null,
            batch: "1ST",
            branch: "CSE",
            role: "STUDENT",
          })
          .returning();
        user = created;
      }
    } else {
      const existing = demoStore.users.find(
        (u) => u.email.toLowerCase() === email
      );
      if (existing) {
        user = existing;
      } else {
        const created = {
          id: Math.max(0, ...demoStore.users.map((u) => u.id)) + 1,
          name: displayName,
          email,
          rollNumber: null as string | null,
          batch: "1ST",
          branch: "CSE",
          role: "STUDENT",
          createdAt: new Date(),
        };
        demoStore.users.push(created);
        user = created;
      }
    }

    if (!user) {
      return res.redirect(302, "/login?error=account_error");
    }

    const sessionToken = signSessionToken({ id: user.id, role: user.role });
    setSessionCookie(res, sessionToken);
    return res.redirect(302, "/");
  } catch (err) {
    console.error("[OAuth] Google callback error:", err);
    return res.redirect(302, "/login?error=oauth_failed");
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
    let auctionOperatorAuctionIds: number[] = [];

    if (useDb() && db) {
      const [mRows, cTeams, opRows] = await Promise.all([
        db
          .select({
            clubId: clubMemberships.clubId,
            memberRole: clubMemberships.memberRole,
            batchScope: clubMemberships.batchScope,
            status: clubMemberships.status,
          })
          .from(clubMemberships)
          .where(eq(clubMemberships.userId, actor.id)),
        db
          .select({ id: tournamentTeams.id })
          .from(tournamentTeams)
          .where(eq(tournamentTeams.captainUserId, actor.id)),
        db
          .select({ auctionId: auctionOperators.auctionId })
          .from(auctionOperators)
          .where(eq(auctionOperators.userId, actor.id)),
      ]);
      memberships = mRows;
      captainTeamIds = cTeams.map((t) => t.id);
      auctionOperatorAuctionIds = opRows.map((o) => o.auctionId);
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
      auctionOperatorAuctionIds = demoStore.auctionOperators
        .filter((o) => o.userId === actor.id)
        .map((o) => o.auctionId);
    }

    res.json({
      user: toSelfUser(actor),
      memberships,
      captainTeamIds,
      auctionOperatorAuctionIds,
    });
  } catch (err) {
    sendServerError(res, "GET /api/auth/me", err);
  }
});

// =========================================================================
// SANITIZED BOOTSTRAP ENDPOINT (ZERO PII & NO USER DIRECTORY TO ANON CALLERS)
// =========================================================================

app.get("/api/bootstrap", async (req, res) => {
  try {
    const demoEnabled = isDemoSwitcherEnabled();
    const googleOAuthEnabled = isGoogleOAuthConfigured();
    const settings = await readSiteSettings();
    const auctionStatus = auctionState.auction.status;
    const auctionPlanned =
      settings.showAuctionInNav && auctionStatus !== "DRAFT";
    const liveAuctionActive =
      settings.showLiveAuctionInNav ||
      auctionStatus === "LIVE" ||
      auctionStatus === "COMPLETED" ||
      auctionStatus === "PUBLISHED";

    if (useDb() && db) {
      const [noticeList, clubList, liveMatches, archivedTournaments] =
        await Promise.all([
          db.select().from(notices).orderBy(desc(notices.id)),
          db.select().from(sportsClubs).orderBy(asc(sportsClubs.sortOrder)),
          db
            .select({ id: tournamentMatches.id })
            .from(tournamentMatches)
            .where(eq(tournamentMatches.status, "LIVE")),
          db
            .select({ year: tournaments.year })
            .from(tournaments)
            .where(eq(tournaments.status, "ARCHIVED")),
        ]);

      // NEVER query users table unless ENABLE_DEMO_SWITCHER === "true"
      let demoPersonas: Array<{
        id: number;
        name: string;
        batch: string;
        branch: string;
        role: string;
      }> = [];
      if (demoEnabled) {
        demoPersonas = await db
          .select({
            id: users.id,
            name: users.name,
            batch: users.batch,
            branch: users.branch,
            role: users.role,
          })
          .from(users)
          .orderBy(asc(users.id));
      }

      const urgentNotice = noticeList.find((n) => n.isUrgentBanner) || null;
      const archiveYears = Array.from(
        new Set(archivedTournaments.map((t) => t.year))
      ).sort((a, b) => b - a);
      const selfUser = req.authUser ? toSelfUser(req.authUser) : null;

      return res.json({
        demoSwitcherEnabled: demoEnabled,
        googleOAuthEnabled,
        alertBanner: urgentNotice ? urgentNotice.title : null,
        notices: noticeList,
        clubs: clubList,
        users: demoPersonas,
        currentUser: selfUser,
        hasLiveMatches: liveMatches.length > 0,
        archiveYears,
        showAuctionInNav: settings.showAuctionInNav,
        showLiveAuctionInNav: settings.showLiveAuctionInNav,
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
      googleOAuthEnabled,
      alertBanner: urgentNotice ? urgentNotice.title : null,
      notices: demoStore.notices,
      clubs: demoStore.clubs,
      users: demoPersonas,
      currentUser: selfUser,
      hasLiveMatches,
      archiveYears,
      showAuctionInNav: settings.showAuctionInNav,
      showLiveAuctionInNav: settings.showLiveAuctionInNav,
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
      const photoUrl = await persistPhotoFromDataUrl(
        dataUrl,
        req.authUser!.id
      );
      if (!photoUrl) {
        return res.status(400).json({
          error:
            "Unsupported or oversized image. Upload JPEG, PNG, WebP, or GIF up to 1.5 MB.",
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
    if (
      !resolved.startsWith(playerUploadsDir + path.sep) ||
      !fs.existsSync(resolved)
    ) {
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
        photoUrl: r.photoUrl && !r.photoUrl.startsWith("data:") ? r.photoUrl : null,
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
// CLUBS, SCHEDULED ACTIVITIES & STRICT INDUCTION LIFECYCLE
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

      // Targeted inner join projecting ONLY public user columns (never fetches full users table or PII)
      const [joinedMembers, acts] = await Promise.all([
        db
          .select({
            id: clubMemberships.id,
            clubId: clubMemberships.clubId,
            userId: clubMemberships.userId,
            memberRole: clubMemberships.memberRole,
            batchScope: clubMemberships.batchScope,
            status: clubMemberships.status,
            userName: users.name,
            userBatch: users.batch,
            userBranch: users.branch,
          })
          .from(clubMemberships)
          .innerJoin(users, eq(clubMemberships.userId, users.id))
          .where(eq(clubMemberships.clubId, club.id)),
        db
          .select()
          .from(clubActivities)
          .where(eq(clubActivities.clubId, club.id))
          .orderBy(desc(clubActivities.id)),
      ]);

      const perm = actor
        ? await checkClubPermission(actor, club.id)
        : { allowed: false, scope: "NONE" };

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
        members: joinedMembers,
        activities: acts.map((a) => ({
          ...a,
          scheduledAt: a.scheduledAt
            ? a.scheduledAt.toISOString()
            : a.scheduledLabel,
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

// Schedule club practice / trial / induction (enforces per-club membership & batchScope + batched notification insert)
app.post("/api/clubs/:slug/activities", requireAuth, async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const actor = req.authUser!;
    const {
      activityType,
      targetBatch,
      categoryGender,
      scheduledLabel,
      scheduledAt,
      venue,
    } = req.body || {};

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
        .select({ userId: clubMemberships.userId })
        .from(clubMemberships)
        .where(
          and(
            eq(clubMemberships.clubId, club.id),
            eq(clubMemberships.status, "INDUCTED")
          )
        );

      // Single batched multi-row INSERT instead of N+1 per-member inserts
      if (clubMems.length > 0) {
        const message = `${club.name}: ${String(activityType).trim()} · ${normalizedBatch} · ${String(categoryGender).trim()} at ${String(venue || club.venue).trim()}`;
        await db.insert(notifications).values(
          clubMems.map((m) => ({
            userId: m.userId,
            clubId: club.id,
            message,
            isRead: false,
          }))
        );
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
    let nextNotifId = Math.max(0, ...demoStore.notifications.map((n) => n.id));
    for (const m of inducted) {
      nextNotifId += 1;
      demoStore.notifications.unshift({
        id: nextNotifId,
        userId: m.userId,
        clubId: club.id,
        message: `${club.name}: ${created.activityType} · ${normalizedBatch} · ${created.categoryGender} at ${created.venue}`,
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

// Strict induction transition table: APPLIED -> TRIAL_ATTENDED | REJECTED; TRIAL_ATTENDED -> INDUCTED | REJECTED
const ALLOWED_INDUCTION_TRANSITIONS: Record<string, Set<string>> = {
  APPLIED: new Set(["TRIAL_ATTENDED", "REJECTED"]),
  TRIAL_ATTENDED: new Set(["INDUCTED", "REJECTED"]),
  INDUCTED: new Set([]),
  REJECTED: new Set([]),
};

// Update induction status with strict state machine + per-club & batchScope RBAC
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
        error:
          "Invalid status (expected TRIAL_ATTENDED, INDUCTED, or REJECTED)",
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

      const allowedNext =
        ALLOWED_INDUCTION_TRANSITIONS[existing.status] || new Set<string>();
      if (existing.status !== nextStatus && !allowedNext.has(nextStatus)) {
        return res.status(400).json({
          error: `Invalid induction transition: ${existing.status} -> ${nextStatus}. Applicants must complete TRIAL_ATTENDED before INDUCTED.`,
        });
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

    const allowedNext =
      ALLOWED_INDUCTION_TRANSITIONS[existing.status] || new Set<string>();
    if (existing.status !== nextStatus && !allowedNext.has(nextStatus)) {
      return res.status(400).json({
        error: `Invalid induction transition: ${existing.status} -> ${nextStatus}. Applicants must complete TRIAL_ATTENDED before INDUCTED.`,
      });
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

// Mount modular auction, tournament, and role/admin routes
registerAuctionRoutes(app, {
  useDb,
  sseClients,
  persistPhotoFromDataUrl,
  broadcastNavUpdate,
});
registerTournamentRoutes(app, {
  useDb,
  matchSseClients,
  getNavSnapshot,
  broadcastNavUpdate,
});
registerRoleAndAdminRoutes(app, {
  useDb,
  broadcastNavUpdate,
});

// Clean JSON 404 for unknown /api/* routes (must be registered BEFORE Vite/SPA fallback)
app.all("/api/*", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

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
      `IIITT Sports server listening on http://localhost:${PORT} (demoSwitcher=${isDemoSwitcherEnabled()}, googleOAuth=${isGoogleOAuthConfigured()})`
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
    console.log(
      `Received ${signal}; closing SSE streams, HTTP server, and DB pool...`
    );

    // 1. End all open SSE streams cleanly (both auction and match streams)
    for (const client of [...sseClients, ...matchSseClients]) {
      try {
        client.write("event: shutdown\ndata: {}\n\n");
        client.end();
      } catch {
        // ignore
      }
    }
    sseClients.clear();
    matchSseClients.clear();

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
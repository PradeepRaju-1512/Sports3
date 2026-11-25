import "dotenv/config";
import express, { type Response } from "express";
import cors from "cors";
import fs from "fs/promises";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { asc, desc, eq, and, inArray, ne } from "drizzle-orm";
import { db, pool, hasDatabase } from "../db/index.js";
import {
  users,
  notices,
  sportsClubs,
  clubMemberships,
  clubActivities,
  notifications,
  tournaments,
  tournamentTeams,
  teamRosterMembers,
  tournamentMatches,
  auctions,
  auctionRounds,
  auctionFranchises,
  auctionRegistrations,
} from "../db/schema.js";
import {
  demoStore,
  auctionState,
  buildLiveAuctionSnapshot,
  computeFranchiseSummaries,
  getEffectiveBasePrice,
  DEFAULT_POSITIONS_BY_SPORT,
  type RawFranchise,
} from "./demoStore.js";
import type {
  AuctionConfig,
  AuctionPlayerStatus,
  AuctionRegistration,
  AuctionRound,
  AuctionStatus,
  PlayerClass,
  SportBasePriceOverride,
} from "../types/auction.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_ROOT = path.resolve(process.cwd(), "public/uploads");
const PLAYER_UPLOADS_DIR = path.join(UPLOADS_ROOT, "players");

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));
app.use("/uploads", express.static(UPLOADS_ROOT));

async function saveValidatedPlayerPhoto(
  rawPhoto?: unknown
): Promise<string | null> {
  if (typeof rawPhoto !== "string") return null;
  const trimmed = rawPhoto.trim();
  if (!trimmed) return null;

  // Allow safe relative asset paths or HTTPS URLs
  if (
    trimmed.startsWith("/uploads/") ||
    trimmed.startsWith("/images/") ||
    /^https:\/\/[^\s"'<>]+$/i.test(trimmed)
  ) {
    return trimmed.slice(0, 512);
  }

  // Validate and persist safe raster base64 image data URLs (PNG/JPEG/WebP/GIF only; no SVG)
  const match = trimmed.match(
    /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i
  );
  if (!match) {
    throw new Error(
      "Unsupported photo format. Please upload a PNG, JPG, WebP, or GIF image."
    );
  }

  const ext = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  const maxBytes = 5 * 1024 * 1024;
  if (buffer.length === 0 || buffer.length > maxBytes) {
    throw new Error("Photo must be under 5 MB.");
  }

  try {
    await fs.mkdir(PLAYER_UPLOADS_DIR, { recursive: true });
    const filename = `player-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
    await fs.writeFile(path.join(PLAYER_UPLOADS_DIR, filename), buffer);
    return `/uploads/players/${filename}`;
  } catch {
    // Fallback to validated data URL if filesystem is read-only
    return trimmed;
  }
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

async function persistAuctionConfigToDb() {
  if (!useDb || !db) return;
  try {
    const cfg = auctionState.auction;
    await db
      .update(auctions)
      .set({
        name: cfg.name,
        seasonYear: cfg.seasonYear,
        sportsJson: JSON.stringify(cfg.sports),
        status: cfg.status,
        registrationDeadline: cfg.registrationDeadline,
        clubBasePrice: cfg.clubBasePrice,
        nonClubBasePrice: cfg.nonClubBasePrice,
        sportBasePricesJson: JSON.stringify(cfg.sportBasePrices || {}),
        defaultIncrement: cfg.defaultIncrement,
        jumpIncrement: cfg.jumpIncrement,
        minSquadSize: cfg.minSquadSize,
        maxSquadSize: cfg.maxSquadSize,
        minClubPlayers: cfg.minClubPlayers,
        minNonClubPlayers: cfg.minNonClubPlayers,
        playerTiersJson: JSON.stringify(cfg.playerTiers || []),
        positionsBySportJson: JSON.stringify(
          cfg.positionsBySport || DEFAULT_POSITIONS_BY_SPORT
        ),
        activeRoundId: cfg.activeRoundId,
        activeSport: cfg.activeSport,
        currentPlayerId: cfg.currentPlayerId,
        projectorMode: cfg.projectorMode,
        updatedAt: new Date(),
      })
      .where(eq(auctions.id, cfg.id));
  } catch {
    // Table may not be pushed yet; keep in-memory state running smoothly
  }
}

async function hydrateAuctionFromDb() {
  if (!useDb || !db) return;
  try {
    const [dbAuction] = await db
      .select()
      .from(auctions)
      .orderBy(asc(auctions.id))
      .limit(1);
    if (dbAuction) {
      const parsedSports = safeParseJson<string[]>(
        dbAuction.sportsJson,
        auctionState.auction.sports
      );
      const parsedSportBasePrices = safeParseJson<
        Record<string, SportBasePriceOverride>
      >(dbAuction.sportBasePricesJson, auctionState.auction.sportBasePrices);
      const parsedTiers = safeParseJson<string[]>(
        dbAuction.playerTiersJson,
        auctionState.auction.playerTiers
      );
      const parsedPositions = safeParseJson<Record<string, string[]>>(
        dbAuction.positionsBySportJson,
        DEFAULT_POSITIONS_BY_SPORT
      );

      auctionState.auction = {
        id: dbAuction.id,
        name: dbAuction.name,
        seasonYear: dbAuction.seasonYear,
        sports:
          Array.isArray(parsedSports) && parsedSports.length > 0
            ? parsedSports
            : auctionState.auction.sports,
        status: (dbAuction.status as AuctionStatus) || "REGISTRATION_OPEN",
        registrationDeadline: dbAuction.registrationDeadline,
        clubBasePrice: dbAuction.clubBasePrice,
        nonClubBasePrice: dbAuction.nonClubBasePrice,
        sportBasePrices:
          parsedSportBasePrices && typeof parsedSportBasePrices === "object"
            ? parsedSportBasePrices
            : {},
        defaultIncrement: dbAuction.defaultIncrement,
        jumpIncrement: dbAuction.jumpIncrement,
        minSquadSize: dbAuction.minSquadSize,
        maxSquadSize: dbAuction.maxSquadSize,
        minClubPlayers: dbAuction.minClubPlayers,
        minNonClubPlayers: dbAuction.minNonClubPlayers,
        playerTiers:
          Array.isArray(parsedTiers) && parsedTiers.length > 0
            ? parsedTiers
            : ["MARQUEE", "TIER_1", "TIER_2", "UNCAPPED"],
        positionsBySport:
          parsedPositions && typeof parsedPositions === "object"
            ? { ...DEFAULT_POSITIONS_BY_SPORT, ...parsedPositions }
            : { ...DEFAULT_POSITIONS_BY_SPORT },
        activeRoundId: dbAuction.activeRoundId ?? 1,
        activeSport: dbAuction.activeSport || "Cricket",
        currentPlayerId: dbAuction.currentPlayerId ?? null,
        projectorMode:
          (dbAuction.projectorMode as AuctionConfig["projectorMode"]) ||
          "STAGE",
        lastUpdatedAt: new Date().toLocaleTimeString(),
      };
    }
  } catch {
    // auctions table may not be pushed yet
  }

  try {
    const dbRounds = await db
      .select()
      .from(auctionRounds)
      .orderBy(asc(auctionRounds.roundNumber), asc(auctionRounds.id));
    if (dbRounds.length > 0) {
      auctionState.rounds = dbRounds.map((r) => ({
        id: r.id,
        auctionId: r.auctionId,
        roundNumber: r.roundNumber,
        name: r.name,
        status: (r.status as AuctionRound["status"]) || "PENDING",
      }));
      const activeRound =
        auctionState.rounds.find((r) => r.status === "ACTIVE") ||
        auctionState.rounds[0];
      if (activeRound) auctionState.auction.activeRoundId = activeRound.id;
    }
  } catch {
    // auction_rounds table may not be pushed yet
  }

  try {
    const dbFranchises = await db
      .select()
      .from(auctionFranchises)
      .orderBy(
        asc(auctionFranchises.sport),
        asc(auctionFranchises.slotNumber),
        asc(auctionFranchises.id)
      );
    if (dbFranchises.length > 0) {
      auctionState.franchises = dbFranchises.map((f) => ({
        id: f.id,
        auctionId: f.auctionId,
        sport: f.sport,
        slotNumber: f.slotNumber,
        name: f.name,
        shortCode: f.shortCode,
        accentColor: f.accentColor,
        captainName: f.captainName,
        startingPurse: f.startingPurse,
        minSquadSize: f.minSquadSize,
        maxSquadSize: f.maxSquadSize,
        minClubPlayers: f.minClubPlayers,
        minNonClubPlayers: f.minNonClubPlayers,
      }));
    }
  } catch {
    // auction_franchises table may not be pushed yet
  }

  try {
    const rows = await db
      .select()
      .from(auctionRegistrations)
      .orderBy(asc(auctionRegistrations.id));
    if (rows.length > 0) {
      auctionState.registrations = rows.map((r) => {
        let positions: string[] = ["Player"];
        try {
          const parsed = JSON.parse(r.positionsJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            positions = parsed.map(String);
          }
        } catch {
          positions = ["Player"];
        }
        return {
          id: r.id,
          auctionId: r.auctionId,
          userId: r.userId,
          playerName: r.playerName,
          rollNumber: r.rollNumber,
          yearLabel: r.yearLabel,
          branch: r.branch,
          sport: r.sport,
          positions,
          playerClass: (r.playerClass === "CLUB"
            ? "CLUB"
            : "NON_CLUB") as PlayerClass,
          basePrice: r.basePrice,
          tier: r.tier || "UNCAPPED",
          roundId: r.roundId,
          status: (r.status as AuctionPlayerStatus) || "ELIGIBLE",
          soldToFranchiseId: r.soldToFranchiseId ?? null,
          soldPrice: r.soldPrice ?? null,
          statsSummary: r.statsSummary,
          photoUrl: r.photoUrl ?? null,
        };
      });
      const current = auctionState.registrations.find(
        (r) => r.status === "IN_AUCTION"
      );
      if (current) {
        auctionState.auction.currentPlayerId = current.id;
        auctionState.auction.activeSport = current.sport;
      }
    }
  } catch {
    // Table may not be pushed yet; continue smoothly with seeded auctionState
  }
}

// In hosted container environments with an upstream nginx proxy (NGINX_PORT === PORT),
// bind the app server to DEFAULT_APP_PORT (3000). Locally or on standalone hosts, honor PORT.
const resolvedPort =
  process.env.PORT && process.env.PORT !== process.env.NGINX_PORT
    ? process.env.PORT
    : process.env.DEFAULT_APP_PORT || "3000";
const PORT = Number(resolvedPort);
const DEMO_SWITCHER_ENABLED = process.env.ENABLE_DEMO_SWITCHER !== "false";

let useDb = hasDatabase && Boolean(db && pool);

function capToFiveWords(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 5).join(" ");
}

function canManageClub(role: string, membershipRole?: string): boolean {
  const elevated = ["SPORTS_SECRETARY", "FACULTY_ADVISOR"];
  if (elevated.includes(role)) return true;
  return (
    ["CLUB_SECRETARY", "CLUB_COORDINATOR"].includes(role) ||
    ["SECRETARY", "COORDINATOR"].includes(membershipRole || "")
  );
}

function isSportsAdmin(role: string): boolean {
  return ["SPORTS_SECRETARY", "FACULTY_ADVISOR"].includes(role);
}

function isMatchScorer(role: string): boolean {
  return ["MATCH_SCORER", "SPORTS_SECRETARY", "FACULTY_ADVISOR"].includes(role);
}

function canOperateAuction(role: string): boolean {
  return [
    "AUCTION_OPERATOR",
    "AUCTIONEER",
    "SPORTS_SECRETARY",
    "FACULTY_ADVISOR",
  ].includes(role);
}

async function getUserById(id: number) {
  if (!Number.isFinite(id) || id <= 0) return null;
  if (useDb && db) {
    const [u] = await db.select().from(users).where(eq(users.id, id));
    return u || null;
  }
  return demoStore.users.find((u) => u.id === id) || null;
}

async function notifyAllUsers(message: string): Promise<number> {
  if (useDb && db) {
    const allUsers = await db.select({ id: users.id }).from(users);
    if (allUsers.length > 0) {
      await db.insert(notifications).values(
        allUsers.map((u) => ({
          userId: u.id,
          clubId: null,
          message,
          isRead: false,
        }))
      );
    }
    return allUsers.length;
  }
  const nextBase =
    demoStore.notifications.reduce((max, n) => Math.max(max, n.id), 0) + 1;
  demoStore.users.forEach((u, idx) => {
    demoStore.notifications.push({
      id: nextBase + idx,
      userId: u.id,
      clubId: null,
      message,
      isRead: false,
      createdAt: new Date(),
    });
  });
  return demoStore.users.length;
}

// --- SSE BROADCAST FOR LIVE AUCTION ---
const sseClients = new Set<Response>();

function broadcastAuctionSnapshot() {
  auctionState.auction.lastUpdatedAt = new Date().toLocaleTimeString();
  const payload = `data: ${JSON.stringify(buildLiveAuctionSnapshot())}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// --- SLICE 1: HEALTH, BOOTSTRAP, CLUBS, NOTIFICATIONS ---

app.get("/api/health", async (_req, res) => {
  try {
    if (useDb && pool) {
      await pool.query("SELECT 1");
    }
    res.json({
      ok: true,
      mode: useDb ? "postgres" : "demo-fallback",
      demoSwitcherEnabled: DEMO_SWITCHER_ENABLED,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.get("/api/bootstrap", async (_req, res) => {
  try {
    if (useDb && db) {
      const allUsers = await db.select().from(users).orderBy(asc(users.id));
      const allNotices = await db
        .select()
        .from(notices)
        .orderBy(desc(notices.createdAt), desc(notices.id));
      const clubs = await db
        .select()
        .from(sportsClubs)
        .orderBy(asc(sportsClubs.sortOrder), asc(sportsClubs.id));

      const liveMatches = await db
        .select({ id: tournamentMatches.id })
        .from(tournamentMatches)
        .where(eq(tournamentMatches.status, "LIVE"));

      const archivedTourneys = await db
        .select({ year: tournaments.year })
        .from(tournaments)
        .where(eq(tournaments.status, "ARCHIVED"));

      const archiveYears = Array.from(
        new Set(archivedTourneys.map((t) => t.year))
      ).sort((a, b) => b - a);

      const urgentNotice = allNotices.find((n) => n.isUrgentBanner);
      const alertBanner = urgentNotice
        ? capToFiveWords(urgentNotice.title)
        : null;

      return res.json({
        demoSwitcherEnabled: DEMO_SWITCHER_ENABLED,
        alertBanner,
        notices: allNotices,
        clubs,
        users: allUsers,
        defaultUser: allUsers[0] || null,
        hasLiveMatches: liveMatches.length > 0,
        archiveYears: archiveYears.length > 0 ? archiveYears : [2025, 2024],
        auctionPlanned: true,
        liveAuctionActive: true,
      });
    }

    const urgentNotice = demoStore.notices.find((n) => n.isUrgentBanner);
    const alertBanner = urgentNotice
      ? capToFiveWords(urgentNotice.title)
      : null;
    const hasLiveMatches = demoStore.matches.some((m) => m.status === "LIVE");
    const archiveYears = Array.from(
      new Set(
        demoStore.tournaments
          .filter((t) => t.status === "ARCHIVED")
          .map((t) => t.year)
      )
    ).sort((a, b) => b - a);

    res.json({
      demoSwitcherEnabled: DEMO_SWITCHER_ENABLED,
      alertBanner,
      notices: demoStore.notices,
      clubs: demoStore.clubs,
      users: demoStore.users,
      defaultUser: demoStore.users[0] || null,
      hasLiveMatches,
      archiveYears: archiveYears.length > 0 ? archiveYears : [2025, 2024],
      auctionPlanned: true,
      liveAuctionActive: true,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/clubs/:slug", async (req, res) => {
  try {
    if (useDb && db) {
      const [club] = await db
        .select()
        .from(sportsClubs)
        .where(eq(sportsClubs.slug, req.params.slug));

      if (!club) {
        return res.status(404).json({ error: "Club not found" });
      }

      const activities = await db
        .select()
        .from(clubActivities)
        .where(eq(clubActivities.clubId, club.id))
        .orderBy(desc(clubActivities.id));

      const membershipsRaw = await db
        .select({
          id: clubMemberships.id,
          clubId: clubMemberships.clubId,
          userId: clubMemberships.userId,
          memberRole: clubMemberships.memberRole,
          batchScope: clubMemberships.batchScope,
          status: clubMemberships.status,
          userName: users.name,
          userEmail: users.email,
          userBatch: users.batch,
          userBranch: users.branch,
          userRoll: users.rollNumber,
        })
        .from(clubMemberships)
        .innerJoin(users, eq(clubMemberships.userId, users.id))
        .where(eq(clubMemberships.clubId, club.id))
        .orderBy(asc(clubMemberships.id));

      return res.json({
        club,
        activities,
        memberships: membershipsRaw,
      });
    }

    const club = demoStore.clubs.find((c) => c.slug === req.params.slug);
    if (!club) {
      return res.status(404).json({ error: "Club not found" });
    }
    const activities = demoStore.activities
      .filter((a) => a.clubId === club.id)
      .sort((a, b) => b.id - a.id);
    const membershipsRaw = demoStore.memberships
      .filter((m) => m.clubId === club.id)
      .map((m) => {
        const u = demoStore.users.find((usr) => usr.id === m.userId);
        return {
          id: m.id,
          clubId: m.clubId,
          userId: m.userId,
          memberRole: m.memberRole,
          batchScope: m.batchScope,
          status: m.status,
          userName: u?.name || "Student",
          userEmail: u?.email || "",
          userBatch: u?.batch || "1ST",
          userBranch: u?.branch || "CSE",
          userRoll: u?.rollNumber || null,
        };
      });

    res.json({ club, activities, memberships: membershipsRaw });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/clubs/:slug/activities", async (req, res) => {
  try {
    const {
      actorUserId,
      activityType,
      customActivityText,
      targetBatch,
      categoryGender,
      scheduledLabel,
      venue,
    } = req.body;

    const resolvedType =
      activityType === "Other" && customActivityText?.trim()
        ? customActivityText.trim()
        : (activityType || "Practice").trim();

    if (useDb && db) {
      const [club] = await db
        .select()
        .from(sportsClubs)
        .where(eq(sportsClubs.slug, req.params.slug));
      if (!club) return res.status(404).json({ error: "Club not found" });

      const actor = await getUserById(Number(actorUserId));
      if (!actor) return res.status(401).json({ error: "Active user required" });

      const [actorMembership] = await db
        .select()
        .from(clubMemberships)
        .where(
          and(
            eq(clubMemberships.clubId, club.id),
            eq(clubMemberships.userId, actor.id)
          )
        );

      if (!canManageClub(actor.role, actorMembership?.memberRole)) {
        return res.status(403).json({
          error: "Only Club Secretary or Club Coordinator can post activities",
        });
      }

      const [created] = await db
        .insert(clubActivities)
        .values({
          clubId: club.id,
          activityType: resolvedType,
          targetBatch: targetBatch || "All Batches",
          categoryGender: categoryGender || "Open",
          scheduledLabel: (scheduledLabel || "Today, 5:00 PM").trim(),
          venue: (venue || club.venue).trim(),
          createdByUserId: actor.id,
        })
        .returning();

      const clubRoster = await db
        .select()
        .from(clubMemberships)
        .where(eq(clubMemberships.clubId, club.id));

      const targets = clubRoster.filter((m) =>
        resolvedType.toLowerCase() === "induction"
          ? m.status === "INDUCTED" || m.status === "APPLIED"
          : m.status === "INDUCTED"
      );

      const notifText = `${club.name}: ${resolvedType} · ${created.targetBatch} · ${created.categoryGender} · ${created.scheduledLabel} (${created.venue})`;

      if (targets.length > 0) {
        await db.insert(notifications).values(
          targets.map((t) => ({
            userId: t.userId,
            clubId: club.id,
            message: notifText,
            isRead: false,
          }))
        );
      }

      return res
        .status(201)
        .json({ activity: created, notifiedCount: targets.length });
    }

    const club = demoStore.clubs.find((c) => c.slug === req.params.slug);
    if (!club) return res.status(404).json({ error: "Club not found" });
    const actor = await getUserById(Number(actorUserId));
    if (!actor) return res.status(401).json({ error: "Active user required" });

    const actorMembership = demoStore.memberships.find(
      (m) => m.clubId === club.id && m.userId === actor.id
    );
    if (!canManageClub(actor.role, actorMembership?.memberRole)) {
      return res.status(403).json({
        error: "Only Club Secretary or Club Coordinator can post activities",
      });
    }

    const nextId =
      demoStore.activities.reduce((max, a) => Math.max(max, a.id), 0) + 1;
    const created = {
      id: nextId,
      clubId: club.id,
      activityType: resolvedType,
      targetBatch: targetBatch || "All Batches",
      categoryGender: categoryGender || "Open",
      scheduledLabel: (scheduledLabel || "Today, 5:00 PM").trim(),
      venue: (venue || club.venue).trim(),
      createdByUserId: actor.id,
      createdAt: new Date(),
    };
    demoStore.activities.push(created);

    const targets = demoStore.memberships
      .filter((m) => m.clubId === club.id)
      .filter((m) =>
        resolvedType.toLowerCase() === "induction"
          ? m.status === "INDUCTED" || m.status === "APPLIED"
          : m.status === "INDUCTED"
      );

    const notifText = `${club.name}: ${resolvedType} · ${created.targetBatch} · ${created.categoryGender} · ${created.scheduledLabel} (${created.venue})`;
    let notifId =
      demoStore.notifications.reduce((max, n) => Math.max(max, n.id), 0) + 1;
    for (const t of targets) {
      demoStore.notifications.push({
        id: notifId++,
        userId: t.userId,
        clubId: club.id,
        message: notifText,
        isRead: false,
        createdAt: new Date(),
      });
    }

    res.status(201).json({ activity: created, notifiedCount: targets.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/clubs/:slug/induction-apply", async (req, res) => {
  try {
    const { userId } = req.body;

    if (useDb && db) {
      const [club] = await db
        .select()
        .from(sportsClubs)
        .where(eq(sportsClubs.slug, req.params.slug));
      if (!club) return res.status(404).json({ error: "Club not found" });

      const user = await getUserById(Number(userId));
      if (!user) return res.status(404).json({ error: "User not found" });

      const [existing] = await db
        .select()
        .from(clubMemberships)
        .where(
          and(
            eq(clubMemberships.clubId, club.id),
            eq(clubMemberships.userId, user.id)
          )
        );
      if (existing) return res.json({ membership: existing });

      const [created] = await db
        .insert(clubMemberships)
        .values({
          clubId: club.id,
          userId: user.id,
          memberRole: "MEMBER",
          batchScope: user.batch,
          status: "APPLIED",
        })
        .returning();

      return res.status(201).json({ membership: created });
    }

    const club = demoStore.clubs.find((c) => c.slug === req.params.slug);
    if (!club) return res.status(404).json({ error: "Club not found" });
    const user = await getUserById(Number(userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    const existing = demoStore.memberships.find(
      (m) => m.clubId === club.id && m.userId === user.id
    );
    if (existing) return res.json({ membership: existing });

    const nextId =
      demoStore.memberships.reduce((max, m) => Math.max(max, m.id), 0) + 1;
    const created = {
      id: nextId,
      clubId: club.id,
      userId: user.id,
      memberRole: "MEMBER",
      batchScope: user.batch,
      status: "APPLIED",
      createdAt: new Date(),
    };
    demoStore.memberships.push(created);
    res.status(201).json({ membership: created });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/memberships/:id/status", async (req, res) => {
  try {
    const { actorUserId, status } = req.body;
    const actor = await getUserById(Number(actorUserId));
    if (!actor || !canManageClub(actor.role)) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (useDb && db) {
      const [updated] = await db
        .update(clubMemberships)
        .set({ status })
        .where(eq(clubMemberships.id, Number(req.params.id)))
        .returning();
      return res.json({ membership: updated });
    }

    const target = demoStore.memberships.find(
      (m) => m.id === Number(req.params.id)
    );
    if (!target) return res.status(404).json({ error: "Membership not found" });
    target.status = status;
    res.json({ membership: target });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/notifications", async (req, res) => {
  try {
    const userId = Number(req.query.userId || 0);
    if (!userId) return res.json({ notifications: [] });

    if (useDb && db) {
      const list = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.id));
      return res.json({ notifications: list });
    }

    const list = demoStore.notifications
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.id - a.id);
    res.json({ notifications: list });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- SLICE 2: TOURNAMENTS OVERVIEW, CURRENT TOURNAMENT, ARCHIVE, LIVE STATUS ---

app.get("/api/tournaments/overview", async (_req, res) => {
  try {
    if (useDb && db) {
      const list = await db
        .select()
        .from(tournaments)
        .where(ne(tournaments.status, "ARCHIVED"))
        .orderBy(asc(tournaments.year), asc(tournaments.id));
      return res.json({ tournaments: list });
    }

    const list = demoStore.tournaments
      .filter((t) => t.status !== "ARCHIVED")
      .sort((a, b) => a.year - b.year || a.id - b.id);
    res.json({ tournaments: list });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/tournaments", async (req, res) => {
  try {
    const {
      actorUserId,
      name,
      year,
      semester,
      dateRange,
      sportsIncluded,
      structureNotes,
      notifyEveryone,
    } = req.body;

    const actor = await getUserById(Number(actorUserId));
    if (!actor || !isSportsAdmin(actor.role)) {
      return res.status(403).json({
        error: "Only Sports Secretary or Faculty Advisor can add tournaments",
      });
    }

    if (!name?.trim() || !dateRange?.trim()) {
      return res
        .status(400)
        .json({ error: "Tournament name and dates are required" });
    }

    let created;
    if (useDb && db) {
      [created] = await db
        .insert(tournaments)
        .values({
          name: name.trim(),
          year: Number(year) || new Date().getFullYear(),
          semester: semester || "ODD",
          tournamentType: name.toLowerCase().includes("prothymos")
            ? "PROTHYMOS"
            : "INTER_BATCH",
          competitionFormat: "LEAGUE_KNOCKOUT",
          dateRange: dateRange.trim(),
          structureNotes: (structureNotes || "").trim(),
          sportsIncluded: (
            sportsIncluded || "Cricket,Football,Volleyball,Badminton"
          ).trim(),
          status: "UPCOMING",
        })
        .returning();
    } else {
      const nextId =
        demoStore.tournaments.reduce((max, t) => Math.max(max, t.id), 0) + 1;
      created = {
        id: nextId,
        name: name.trim(),
        year: Number(year) || new Date().getFullYear(),
        semester: semester || "ODD",
        tournamentType: name.toLowerCase().includes("prothymos")
          ? "PROTHYMOS"
          : "INTER_BATCH",
        competitionFormat: "LEAGUE_KNOCKOUT",
        dateRange: dateRange.trim(),
        structureNotes: (structureNotes || "").trim(),
        sportsIncluded: (
          sportsIncluded || "Cricket,Football,Volleyball,Badminton"
        ).trim(),
        status: "UPCOMING",
        createdAt: new Date(),
      };
      demoStore.tournaments.push(created);
    }

    const notifiedCount = notifyEveryone
      ? await notifyAllUsers(
          `New Tournament Scheduled: ${created.name} (${created.dateRange})`
        )
      : 0;

    res.status(201).json({ tournament: created, notifiedCount });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/tournaments/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      actorUserId,
      name,
      dateRange,
      sportsIncluded,
      structureNotes,
      notifyEveryone,
    } = req.body;

    const actor = await getUserById(Number(actorUserId));
    if (!actor || !isSportsAdmin(actor.role)) {
      return res.status(403).json({
        error:
          "Only Sports Secretary or Faculty Advisor can update tournaments",
      });
    }

    let updated;
    if (useDb && db) {
      const [existing] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      [updated] = await db
        .update(tournaments)
        .set({
          name: name !== undefined ? String(name).trim() : existing.name,
          dateRange:
            dateRange !== undefined
              ? String(dateRange).trim()
              : existing.dateRange,
          sportsIncluded:
            sportsIncluded !== undefined
              ? String(sportsIncluded).trim()
              : existing.sportsIncluded,
          structureNotes:
            structureNotes !== undefined
              ? String(structureNotes).trim()
              : existing.structureNotes,
        })
        .where(eq(tournaments.id, id))
        .returning();
    } else {
      const existing = demoStore.tournaments.find((t) => t.id === id);
      if (!existing) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      if (name !== undefined) existing.name = String(name).trim();
      if (dateRange !== undefined)
        existing.dateRange = String(dateRange).trim();
      if (sportsIncluded !== undefined)
        existing.sportsIncluded = String(sportsIncluded).trim();
      if (structureNotes !== undefined)
        existing.structureNotes = String(structureNotes).trim();
      updated = existing;
    }

    const notifiedCount = notifyEveryone
      ? await notifyAllUsers(
          `Tournament Updated: ${updated.name} · ${updated.dateRange}`
        )
      : 0;

    res.json({ tournament: updated, notifiedCount });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/tournaments/current", async (_req, res) => {
  try {
    if (useDb && db) {
      const [current] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.status, "CURRENT"))
        .orderBy(desc(tournaments.id))
        .limit(1);

      if (!current) {
        return res.json({ tournament: null, teams: [], matches: [] });
      }

      const teams = await db
        .select()
        .from(tournamentTeams)
        .where(eq(tournamentTeams.tournamentId, current.id))
        .orderBy(desc(tournamentTeams.points), asc(tournamentTeams.id));

      const matches = await db
        .select()
        .from(tournamentMatches)
        .where(eq(tournamentMatches.tournamentId, current.id))
        .orderBy(desc(tournamentMatches.matchOrder), desc(tournamentMatches.id));

      return res.json({ tournament: current, teams, matches });
    }

    const current =
      demoStore.tournaments.find((t) => t.status === "CURRENT") || null;
    if (!current) {
      return res.json({ tournament: null, teams: [], matches: [] });
    }
    const teams = demoStore.tournamentTeams
      .filter((tm) => tm.tournamentId === current.id)
      .sort((a, b) => b.points - a.points || a.id - b.id);
    const matches = demoStore.matches
      .filter((m) => m.tournamentId === current.id)
      .sort((a, b) => b.matchOrder - a.matchOrder || b.id - a.id);

    res.json({ tournament: current, teams, matches });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/matches", async (req, res) => {
  try {
    const {
      actorUserId,
      tournamentId,
      sportName,
      stage,
      matchOrder,
      teamA,
      teamB,
      scheduledTime,
      venue,
      status,
      notifyEveryone,
    } = req.body;

    const actor = await getUserById(Number(actorUserId));
    if (!actor || !isSportsAdmin(actor.role)) {
      return res
        .status(403)
        .json({ error: "Only Sports Secretary can schedule fixtures" });
    }

    let created;
    if (useDb && db) {
      [created] = await db
        .insert(tournamentMatches)
        .values({
          tournamentId: Number(tournamentId),
          sportName: (sportName || "Cricket").trim(),
          stage: (stage || "Group Match").trim(),
          matchOrder: Number(matchOrder) || 1,
          teamA: String(teamA || "").trim(),
          teamB: String(teamB || "").trim(),
          scoreA: "0",
          scoreB: "0",
          status: status || "UPCOMING",
          scheduledTime: (scheduledTime || "TBD").trim(),
          venue: (venue || "IIITT Ground").trim(),
          resultSummary: "Scheduled",
          detailedBreakdown: "",
          scorerUserId: actor.id,
        })
        .returning();
    } else {
      const nextId =
        demoStore.matches.reduce((max, m) => Math.max(max, m.id), 0) + 1;
      created = {
        id: nextId,
        tournamentId: Number(tournamentId),
        sportName: (sportName || "Cricket").trim(),
        stage: (stage || "Group Match").trim(),
        matchOrder: Number(matchOrder) || 1,
        teamA: String(teamA || "").trim(),
        teamB: String(teamB || "").trim(),
        scoreA: "0",
        scoreB: "0",
        status: status || "UPCOMING",
        scheduledTime: (scheduledTime || "TBD").trim(),
        venue: (venue || "IIITT Ground").trim(),
        resultSummary: "Scheduled",
        detailedBreakdown: "",
        scorerUserId: actor.id,
      };
      demoStore.matches.push(created);
    }

    if (notifyEveryone) {
      await notifyAllUsers(
        `Fixture Scheduled: ${created.sportName} (${created.stage}) · ${created.teamA} vs ${created.teamB} · ${created.scheduledTime}`
      );
    }

    res.status(201).json({ match: created });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/matches/:id/score", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      actorUserId,
      scoreA,
      scoreB,
      status,
      resultSummary,
      detailedBreakdown,
    } = req.body;

    const actor = await getUserById(Number(actorUserId));
    if (!actor || !isMatchScorer(actor.role)) {
      return res
        .status(403)
        .json({ error: "Only Match Scorer or Sports Admin can update scores" });
    }

    if (useDb && db) {
      const [updated] = await db
        .update(tournamentMatches)
        .set({
          scoreA: String(scoreA ?? "0"),
          scoreB: String(scoreB ?? "0"),
          status: status || "LIVE",
          resultSummary: String(resultSummary ?? ""),
          detailedBreakdown: String(detailedBreakdown ?? ""),
          scorerUserId: actor.id,
        })
        .where(eq(tournamentMatches.id, id))
        .returning();

      if (!updated) return res.status(404).json({ error: "Match not found" });
      return res.json({ match: updated });
    }

    const match = demoStore.matches.find((m) => m.id === id);
    if (!match) return res.status(404).json({ error: "Match not found" });
    match.scoreA = String(scoreA ?? match.scoreA);
    match.scoreB = String(scoreB ?? match.scoreB);
    if (status) match.status = status;
    if (resultSummary !== undefined) match.resultSummary = String(resultSummary);
    if (detailedBreakdown !== undefined)
      match.detailedBreakdown = String(detailedBreakdown);
    match.scorerUserId = actor.id;

    res.json({ match });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/archive", async (req, res) => {
  try {
    const year = Number(req.query.year || 2025);

    if (useDb && db) {
      const archived = await db
        .select()
        .from(tournaments)
        .where(
          and(eq(tournaments.status, "ARCHIVED"), eq(tournaments.year, year))
        )
        .orderBy(asc(tournaments.id));

      const tIds = archived.map((t) => t.id);
      if (tIds.length === 0) {
        return res.json({ tournaments: [], teams: [], roster: [], matches: [] });
      }

      const teams = await db
        .select()
        .from(tournamentTeams)
        .where(inArray(tournamentTeams.tournamentId, tIds))
        .orderBy(desc(tournamentTeams.points), asc(tournamentTeams.id));

      const teamIds = teams.map((tm) => tm.id);
      const roster =
        teamIds.length > 0
          ? await db
              .select()
              .from(teamRosterMembers)
              .where(inArray(teamRosterMembers.teamId, teamIds))
          : [];

      const matches = await db
        .select()
        .from(tournamentMatches)
        .where(inArray(tournamentMatches.tournamentId, tIds))
        .orderBy(desc(tournamentMatches.matchOrder), desc(tournamentMatches.id));

      return res.json({ tournaments: archived, teams, roster, matches });
    }

    const archived = demoStore.tournaments.filter(
      (t) => t.status === "ARCHIVED" && t.year === year
    );
    const tIds = new Set(archived.map((t) => t.id));
    const teams = demoStore.tournamentTeams
      .filter((tm) => tIds.has(tm.tournamentId))
      .sort((a, b) => b.points - a.points || a.id - b.id);
    const teamIds = new Set(teams.map((tm) => tm.id));
    const roster = demoStore.rosterMembers.filter((r) => teamIds.has(r.teamId));
    const matches = demoStore.matches
      .filter((m) => tIds.has(m.tournamentId))
      .sort((a, b) => b.matchOrder - a.matchOrder || b.id - a.id);

    res.json({ tournaments: archived, teams, roster, matches });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/live-status", async (_req, res) => {
  try {
    if (useDb && db) {
      const all = await db
        .select()
        .from(tournamentMatches)
        .orderBy(desc(tournamentMatches.matchOrder), desc(tournamentMatches.id));

      return res.json({
        liveMatches: all.filter((m) => m.status === "LIVE"),
        upcomingMatches: all.filter((m) => m.status === "UPCOMING"),
        recentResults: all
          .filter((m) => m.status === "COMPLETED")
          .slice(0, 6),
      });
    }

    const all = [...demoStore.matches].sort(
      (a, b) => b.matchOrder - a.matchOrder || b.id - a.id
    );
    res.json({
      liveMatches: all.filter((m) => m.status === "LIVE"),
      upcomingMatches: all.filter((m) => m.status === "UPCOMING"),
      recentResults: all.filter((m) => m.status === "COMPLETED").slice(0, 6),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- SLICE 3: AUCTION REGISTRATION, SECRETARY REVIEW & LIVE CONSOLE ---

async function getInductedSportsForUser(userId: number): Promise<string[]> {
  if (!userId) return [];
  if (useDb && db) {
    const rows = await db
      .select({ name: sportsClubs.name })
      .from(clubMemberships)
      .innerJoin(sportsClubs, eq(clubMemberships.clubId, sportsClubs.id))
      .where(
        and(
          eq(clubMemberships.userId, userId),
          eq(clubMemberships.status, "INDUCTED")
        )
      );
    return rows.map((r) => r.name);
  }
  const clubIds = new Set(
    demoStore.memberships
      .filter((m) => m.userId === userId && m.status === "INDUCTED")
      .map((m) => m.clubId)
  );
  return demoStore.clubs.filter((c) => clubIds.has(c.id)).map((c) => c.name);
}

app.get("/api/auction", async (req, res) => {
  try {
    const userId = Number(req.query.userId || 0);
    const inductedSports = userId
      ? await getInductedSportsForUser(userId)
      : ["Cricket", "Football"];
    res.json({
      auction: auctionState.auction,
      rounds: [...auctionState.rounds].sort(
        (a, b) => a.roundNumber - b.roundNumber || a.id - b.id
      ),
      registrations: auctionState.registrations,
      franchises: computeFranchiseSummaries(),
      inductedSports,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/auction/config", async (req, res) => {
  try {
    const {
      actorUserId,
      name,
      seasonYear,
      sports,
      status,
      registrationDeadline,
      clubBasePrice,
      nonClubBasePrice,
      sportBasePrices,
      defaultIncrement,
      jumpIncrement,
      minSquadSize,
      maxSquadSize,
      minClubPlayers,
      minNonClubPlayers,
      playerTiers,
      positionsBySport,
    } = req.body;

    const actor = await getUserById(Number(actorUserId));
    if (!actor || !canOperateAuction(actor.role)) {
      return res.status(403).json({
        error:
          "Only Sports Secretary, Faculty Advisor, or Auction Operator can update auction settings.",
      });
    }

    const admin = isSportsAdmin(actor.role);
    const adminOnlyFieldsProvided =
      name !== undefined ||
      seasonYear !== undefined ||
      sports !== undefined ||
      status !== undefined ||
      registrationDeadline !== undefined ||
      clubBasePrice !== undefined ||
      nonClubBasePrice !== undefined ||
      sportBasePrices !== undefined ||
      minSquadSize !== undefined ||
      maxSquadSize !== undefined ||
      minClubPlayers !== undefined ||
      minNonClubPlayers !== undefined ||
      playerTiers !== undefined ||
      positionsBySport !== undefined;

    if (!admin && adminOnlyFieldsProvided) {
      return res.status(403).json({
        error:
          "Auction Operators may adjust bid increments live; global rules require Sports Secretary or Faculty Advisor access.",
      });
    }

    const cfg = auctionState.auction;

    const nextClubBase =
      clubBasePrice !== undefined ? Number(clubBasePrice) : cfg.clubBasePrice;
    const nextNonClubBase =
      nonClubBasePrice !== undefined
        ? Number(nonClubBasePrice)
        : cfg.nonClubBasePrice;
    const nextDefaultInc =
      defaultIncrement !== undefined
        ? Number(defaultIncrement)
        : cfg.defaultIncrement;
    const nextJumpInc =
      jumpIncrement !== undefined ? Number(jumpIncrement) : cfg.jumpIncrement;
    const nextMinSquad =
      minSquadSize !== undefined ? Number(minSquadSize) : cfg.minSquadSize;
    const nextMaxSquad =
      maxSquadSize !== undefined ? Number(maxSquadSize) : cfg.maxSquadSize;
    const nextMinClub =
      minClubPlayers !== undefined
        ? Number(minClubPlayers)
        : cfg.minClubPlayers;
    const nextMinNonClub =
      minNonClubPlayers !== undefined
        ? Number(minNonClubPlayers)
        : cfg.minNonClubPlayers;

    if (
      !Number.isFinite(nextClubBase) ||
      nextClubBase < 0 ||
      !Number.isFinite(nextNonClubBase) ||
      nextNonClubBase < 0
    ) {
      return res
        .status(400)
        .json({ error: "Base prices must be non-negative numbers." });
    }
    if (
      !Number.isFinite(nextDefaultInc) ||
      nextDefaultInc <= 0 ||
      !Number.isFinite(nextJumpInc) ||
      nextJumpInc < nextDefaultInc
    ) {
      return res.status(400).json({
        error:
          "Default increment must be > 0 and jump increment must be >= default increment.",
      });
    }
    if (
      !Number.isFinite(nextMinSquad) ||
      !Number.isFinite(nextMaxSquad) ||
      nextMinSquad < 1 ||
      nextMaxSquad < nextMinSquad
    ) {
      return res.status(400).json({
        error: "Min squad size must be >= 1 and <= max squad size.",
      });
    }
    if (
      !Number.isFinite(nextMinClub) ||
      !Number.isFinite(nextMinNonClub) ||
      nextMinClub < 0 ||
      nextMinNonClub < 0 ||
      nextMinClub + nextMinNonClub > nextMaxSquad
    ) {
      return res.status(400).json({
        error:
          "CLUB + NON_CLUB minimum quotas must be >= 0 and cannot exceed max squad size.",
      });
    }

    let nextSportBasePrices = cfg.sportBasePrices;
    if (sportBasePrices !== undefined) {
      if (
        typeof sportBasePrices !== "object" ||
        sportBasePrices === null ||
        Array.isArray(sportBasePrices)
      ) {
        return res
          .status(400)
          .json({ error: "sportBasePrices must be an object map." });
      }
      const cleaned: Record<string, SportBasePriceOverride> = {};
      for (const [sportKey, val] of Object.entries(sportBasePrices)) {
        if (!val || typeof val !== "object") continue;
        const v = val as Partial<SportBasePriceOverride>;
        const cb = Number(v.clubBasePrice);
        const ncb = Number(v.nonClubBasePrice);
        if (!Number.isFinite(cb) || cb < 0 || !Number.isFinite(ncb) || ncb < 0) {
          return res.status(400).json({
            error: `Invalid sport base prices for ${sportKey}.`,
          });
        }
        cleaned[sportKey.trim()] = {
          clubBasePrice: Math.round(cb),
          nonClubBasePrice: Math.round(ncb),
        };
      }
      nextSportBasePrices = cleaned;
    }

    const pricingChanged =
      nextClubBase !== cfg.clubBasePrice ||
      nextNonClubBase !== cfg.nonClubBasePrice ||
      sportBasePrices !== undefined;

    if (name !== undefined && String(name).trim()) {
      cfg.name = String(name).trim();
    }
    if (seasonYear !== undefined && Number.isFinite(Number(seasonYear))) {
      cfg.seasonYear = Number(seasonYear);
    }
    if (Array.isArray(sports) && sports.length > 0) {
      cfg.sports = sports.map((s) => String(s).trim()).filter(Boolean);
    }
    if (status !== undefined) {
      const allowedStatuses: AuctionStatus[] = [
        "DRAFT",
        "REGISTRATION_OPEN",
        "FROZEN",
        "LIVE",
        "COMPLETED",
        "PUBLISHED",
      ];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid auction status." });
      }
      cfg.status = status;
    }
    if (registrationDeadline !== undefined) {
      cfg.registrationDeadline = String(registrationDeadline).trim();
    }
    cfg.clubBasePrice = Math.round(nextClubBase);
    cfg.nonClubBasePrice = Math.round(nextNonClubBase);
    cfg.sportBasePrices = nextSportBasePrices;
    cfg.defaultIncrement = Math.round(nextDefaultInc);
    cfg.jumpIncrement = Math.round(nextJumpInc);
    cfg.minSquadSize = Math.round(nextMinSquad);
    cfg.maxSquadSize = Math.round(nextMaxSquad);
    cfg.minClubPlayers = Math.round(nextMinClub);
    cfg.minNonClubPlayers = Math.round(nextMinNonClub);

    if (Array.isArray(playerTiers) && playerTiers.length > 0) {
      cfg.playerTiers = playerTiers
        .map((t) => String(t).trim())
        .filter(Boolean);
    }
    if (
      positionsBySport &&
      typeof positionsBySport === "object" &&
      !Array.isArray(positionsBySport)
    ) {
      const cleanedPos: Record<string, string[]> = {};
      for (const [sp, list] of Object.entries(positionsBySport)) {
        if (Array.isArray(list)) {
          const valid = list.map((p) => String(p).trim()).filter(Boolean);
          if (valid.length > 0) cleanedPos[sp.trim()] = valid;
        }
      }
      if (Object.keys(cleanedPos).length > 0) {
        cfg.positionsBySport = cleanedPos;
      }
    }

    if (pricingChanged) {
      const mutableStatuses: AuctionPlayerStatus[] = [
        "REGISTERED",
        "ELIGIBLE",
        "UNSOLD",
        "RE_AUCTIONED",
      ];
      for (const reg of auctionState.registrations) {
        if (mutableStatuses.includes(reg.status)) {
          reg.basePrice = getEffectiveBasePrice(cfg, reg.sport, reg.playerClass);
          if (useDb && db) {
            try {
              await db
                .update(auctionRegistrations)
                .set({ basePrice: reg.basePrice })
                .where(eq(auctionRegistrations.id, reg.id));
            } catch {
              // Ignore if table not pushed
            }
          }
        }
      }
    }

    await persistAuctionConfigToDb();
    broadcastAuctionSnapshot();
    res.json({
      auction: cfg,
      registrations: auctionState.registrations,
      franchises: computeFranchiseSummaries(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/auction/rounds", async (req, res) => {
  try {
    const { actorUserId, name, roundNumber, status } = req.body;
    const actor = await getUserById(Number(actorUserId));
    if (!actor || !isSportsAdmin(actor.role)) {
      return res.status(403).json({
        error: "Only Sports Secretary or Faculty Advisor can add auction rounds.",
      });
    }

    const cleanName = String(name || "").trim();
    if (!cleanName) {
      return res.status(400).json({ error: "Round name is required." });
    }

    const nextNum =
      Number.isFinite(Number(roundNumber)) && Number(roundNumber) > 0
        ? Math.round(Number(roundNumber))
        : auctionState.rounds.reduce(
            (max, r) => Math.max(max, r.roundNumber),
            0
          ) + 1;

    const cleanStatus: AuctionRound["status"] =
      status === "ACTIVE" || status === "COMPLETED" ? status : "PENDING";

    if (cleanStatus === "ACTIVE") {
      auctionState.rounds.forEach((r) => {
        if (r.status === "ACTIVE") r.status = "COMPLETED";
      });
    }

    let nextId =
      auctionState.rounds.reduce((max, r) => Math.max(max, r.id), 0) + 1;

    if (useDb && db) {
      try {
        const [inserted] = await db
          .insert(auctionRounds)
          .values({
            auctionId: auctionState.auction.id,
            roundNumber: nextNum,
            name: cleanName,
            status: cleanStatus,
          })
          .returning();
        if (inserted) nextId = inserted.id;
      } catch {
        // Ignore if table not pushed
      }
    }

    const created: AuctionRound = {
      id: nextId,
      auctionId: auctionState.auction.id,
      roundNumber: nextNum,
      name: cleanName,
      status: cleanStatus,
    };
    auctionState.rounds.push(created);

    if (cleanStatus === "ACTIVE") {
      auctionState.auction.activeRoundId = created.id;
      await persistAuctionConfigToDb();
    }

    broadcastAuctionSnapshot();
    res.status(201).json({
      round: created,
      rounds: [...auctionState.rounds].sort(
        (a, b) => a.roundNumber - b.roundNumber || a.id - b.id
      ),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/auction/rounds/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { actorUserId, name, roundNumber, status, moveUnsoldHere, sport } =
      req.body;
    const actor = await getUserById(Number(actorUserId));
    if (!actor || !canOperateAuction(actor.role)) {
      return res.status(403).json({ error: "Not authorized to edit rounds." });
    }
    if (
      !isSportsAdmin(actor.role) &&
      (name !== undefined || roundNumber !== undefined)
    ) {
      return res.status(403).json({
        error: "Only Sports Secretary or Faculty Advisor can rename or reorder rounds.",
      });
    }

    const target = auctionState.rounds.find((r) => r.id === id);
    if (!target) return res.status(404).json({ error: "Round not found." });

    if (name !== undefined && String(name).trim()) {
      target.name = String(name).trim();
    }
    if (roundNumber !== undefined && Number(roundNumber) > 0) {
      target.roundNumber = Math.round(Number(roundNumber));
    }
    if (status === "PENDING" || status === "ACTIVE" || status === "COMPLETED") {
      if (status === "ACTIVE") {
        for (const r of auctionState.rounds) {
          if (r.id !== target.id && r.status === "ACTIVE") {
            r.status = "COMPLETED";
            if (useDb && db) {
              try {
                await db
                  .update(auctionRounds)
                  .set({ status: "COMPLETED" })
                  .where(eq(auctionRounds.id, r.id));
              } catch {
                // Ignore
              }
            }
          }
        }
        auctionState.auction.activeRoundId = target.id;
      }
      target.status = status;
    }

    let movedCount = 0;
    if (moveUnsoldHere) {
      const sportFilter = sport ? String(sport).toLowerCase() : null;
      for (const reg of auctionState.registrations) {
        if (
          reg.status === "UNSOLD" &&
          (!sportFilter || reg.sport.toLowerCase() === sportFilter)
        ) {
          reg.roundId = target.id;
          reg.status = "RE_AUCTIONED";
          movedCount += 1;
          if (useDb && db) {
            try {
              await db
                .update(auctionRegistrations)
                .set({ roundId: target.id, status: "RE_AUCTIONED" })
                .where(eq(auctionRegistrations.id, reg.id));
            } catch {
              // Ignore
            }
          }
        }
      }
    }

    if (useDb && db) {
      try {
        await db
          .update(auctionRounds)
          .set({
            name: target.name,
            roundNumber: target.roundNumber,
            status: target.status,
          })
          .where(eq(auctionRounds.id, target.id));
      } catch {
        // Ignore
      }
    }

    await persistAuctionConfigToDb();
    broadcastAuctionSnapshot();
    res.json({
      round: target,
      movedCount,
      rounds: [...auctionState.rounds].sort(
        (a, b) => a.roundNumber - b.roundNumber || a.id - b.id
      ),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete("/api/auction/rounds/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const actorUserId = Number(req.body?.actorUserId ?? req.query.actorUserId);
    const actor = await getUserById(actorUserId);
    if (!actor || !isSportsAdmin(actor.role)) {
      return res.status(403).json({
        error: "Only Sports Secretary or Faculty Advisor can delete rounds.",
      });
    }

    if (auctionState.rounds.length <= 1) {
      return res
        .status(400)
        .json({ error: "Cannot delete the last remaining auction round." });
    }

    const idx = auctionState.rounds.findIndex((r) => r.id === id);
    if (idx === -1) return res.status(404).json({ error: "Round not found." });

    const target = auctionState.rounds[idx];
    if (
      target.status === "ACTIVE" ||
      auctionState.auction.activeRoundId === target.id
    ) {
      return res.status(400).json({
        error: "Activate a different round before deleting the active round.",
      });
    }

    auctionState.rounds.splice(idx, 1);
    const fallbackRoundId =
      auctionState.auction.activeRoundId || auctionState.rounds[0].id;

    for (const reg of auctionState.registrations) {
      if (reg.roundId === id) {
        reg.roundId = fallbackRoundId;
        if (useDb && db) {
          try {
            await db
              .update(auctionRegistrations)
              .set({ roundId: fallbackRoundId })
              .where(eq(auctionRegistrations.id, reg.id));
          } catch {
            // Ignore
          }
        }
      }
    }

    if (useDb && db) {
      try {
        await db.delete(auctionRounds).where(eq(auctionRounds.id, id));
      } catch {
        // Ignore
      }
    }

    broadcastAuctionSnapshot();
    res.json({
      deletedId: id,
      rounds: [...auctionState.rounds].sort(
        (a, b) => a.roundNumber - b.roundNumber || a.id - b.id
      ),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/auction/franchises", async (req, res) => {
  try {
    const {
      actorUserId,
      sport,
      name,
      shortCode,
      accentColor,
      captainName,
      startingPurse,
      slotNumber,
      minSquadSize,
      maxSquadSize,
      minClubPlayers,
      minNonClubPlayers,
    } = req.body;

    const actor = await getUserById(Number(actorUserId));
    if (!actor || !isSportsAdmin(actor.role)) {
      return res.status(403).json({
        error: "Only Sports Secretary or Faculty Advisor can add franchises.",
      });
    }

    const cleanSport = String(sport || "").trim();
    const cleanName = String(name || "").trim();
    const parsedPurse = Number(startingPurse);

    if (!cleanSport || !cleanName) {
      return res
        .status(400)
        .json({ error: "Sport and franchise name are required." });
    }
    if (!Number.isFinite(parsedPurse) || parsedPurse < 0) {
      return res
        .status(400)
        .json({ error: "Starting purse must be a non-negative number." });
    }

    const sameSportFranchises = auctionState.franchises.filter(
      (f) => f.sport.toLowerCase() === cleanSport.toLowerCase()
    );
    const resolvedSlot =
      Number.isFinite(Number(slotNumber)) && Number(slotNumber) >= 1
        ? Math.round(Number(slotNumber))
        : sameSportFranchises.reduce(
            (max, f) => Math.max(max, f.slotNumber),
            0
          ) + 1;

    const resolvedShortCode =
      String(shortCode || "")
        .trim()
        .toUpperCase()
        .slice(0, 4) ||
      cleanName
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 3) ||
      "TM";

    const resolvedColor = /^#[0-9a-fA-F]{6}$/.test(String(accentColor || ""))
      ? String(accentColor)
      : "#d4a038";

    let nextId =
      auctionState.franchises.reduce((max, f) => Math.max(max, f.id), 0) + 1;

    const payload: Omit<RawFranchise, "id"> = {
      auctionId: auctionState.auction.id,
      sport: cleanSport,
      slotNumber: resolvedSlot,
      name: cleanName,
      shortCode: resolvedShortCode,
      accentColor: resolvedColor,
      captainName: String(captainName || "").trim(),
      startingPurse: Math.round(parsedPurse),
      minSquadSize:
        minSquadSize !== undefined && minSquadSize !== "" && minSquadSize !== null
          ? Number(minSquadSize)
          : null,
      maxSquadSize:
        maxSquadSize !== undefined && maxSquadSize !== "" && maxSquadSize !== null
          ? Number(maxSquadSize)
          : null,
      minClubPlayers:
        minClubPlayers !== undefined &&
        minClubPlayers !== "" &&
        minClubPlayers !== null
          ? Number(minClubPlayers)
          : null,
      minNonClubPlayers:
        minNonClubPlayers !== undefined &&
        minNonClubPlayers !== "" &&
        minNonClubPlayers !== null
          ? Number(minNonClubPlayers)
          : null,
    };

    if (useDb && db) {
      try {
        const [inserted] = await db
          .insert(auctionFranchises)
          .values(payload)
          .returning();
        if (inserted) nextId = inserted.id;
      } catch {
        // Ignore if table not pushed
      }
    }

    const created: RawFranchise = { id: nextId, ...payload };
    auctionState.franchises.push(created);

    if (
      !auctionState.auction.sports.some(
        (s) => s.toLowerCase() === cleanSport.toLowerCase()
      )
    ) {
      auctionState.auction.sports.push(cleanSport);
      await persistAuctionConfigToDb();
    }

    broadcastAuctionSnapshot();
    const summaries = computeFranchiseSummaries();
    res.status(201).json({
      franchise: summaries.find((f) => f.id === created.id) || created,
      franchises: summaries,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/auction/franchises/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      actorUserId,
      sport,
      name,
      shortCode,
      accentColor,
      captainName,
      startingPurse,
      slotNumber,
      minSquadSize,
      maxSquadSize,
      minClubPlayers,
      minNonClubPlayers,
    } = req.body;

    const actor = await getUserById(Number(actorUserId));
    if (!actor || !canOperateAuction(actor.role)) {
      return res
        .status(403)
        .json({ error: "Not authorized to edit franchise settings." });
    }

    const admin = isSportsAdmin(actor.role);
    const nonPurseFields =
      sport !== undefined ||
      name !== undefined ||
      shortCode !== undefined ||
      accentColor !== undefined ||
      captainName !== undefined ||
      slotNumber !== undefined ||
      minSquadSize !== undefined ||
      maxSquadSize !== undefined ||
      minClubPlayers !== undefined ||
      minNonClubPlayers !== undefined;

    if (!admin && nonPurseFields) {
      return res.status(403).json({
        error:
          "Auction Operators may adjust starting purse live; full franchise edits require Sports Secretary or Faculty Advisor access.",
      });
    }

    const target = auctionState.franchises.find((f) => f.id === id);
    if (!target) {
      return res.status(404).json({ error: "Franchise not found." });
    }

    const ownedPlayers = auctionState.registrations.filter(
      (r) => r.status === "SOLD" && r.soldToFranchiseId === target.id
    );
    const spentPurse = ownedPlayers.reduce(
      (acc, r) => acc + (r.soldPrice || 0),
      0
    );

    if (
      sport !== undefined &&
      String(sport).trim().toLowerCase() !== target.sport.toLowerCase()
    ) {
      if (ownedPlayers.length > 0) {
        return res.status(400).json({
          error:
            "Cannot change a franchise's sport after it has already purchased players.",
        });
      }
      target.sport = String(sport).trim();
    }

    if (startingPurse !== undefined) {
      const nextPurse = Number(startingPurse);
      if (!Number.isFinite(nextPurse) || nextPurse < 0) {
        return res
          .status(400)
          .json({ error: "Starting purse must be a non-negative number." });
      }
      if (nextPurse < spentPurse) {
        return res.status(400).json({
          error: `Starting purse (₹${nextPurse.toLocaleString()}) cannot be lower than already spent amount (₹${spentPurse.toLocaleString()}).`,
        });
      }
      target.startingPurse = Math.round(nextPurse);
    }

    if (name !== undefined && String(name).trim()) {
      target.name = String(name).trim();
    }
    if (shortCode !== undefined && String(shortCode).trim()) {
      target.shortCode = String(shortCode).trim().toUpperCase().slice(0, 4);
    }
    if (
      accentColor !== undefined &&
      /^#[0-9a-fA-F]{6}$/.test(String(accentColor))
    ) {
      target.accentColor = String(accentColor);
    }
    if (captainName !== undefined) {
      target.captainName = String(captainName).trim();
    }
    if (slotNumber !== undefined && Number(slotNumber) >= 1) {
      target.slotNumber = Math.round(Number(slotNumber));
    }
    if (minSquadSize !== undefined) {
      target.minSquadSize =
        minSquadSize === "" || minSquadSize === null
          ? null
          : Number(minSquadSize);
    }
    if (maxSquadSize !== undefined) {
      target.maxSquadSize =
        maxSquadSize === "" || maxSquadSize === null
          ? null
          : Number(maxSquadSize);
    }
    if (minClubPlayers !== undefined) {
      target.minClubPlayers =
        minClubPlayers === "" || minClubPlayers === null
          ? null
          : Number(minClubPlayers);
    }
    if (minNonClubPlayers !== undefined) {
      target.minNonClubPlayers =
        minNonClubPlayers === "" || minNonClubPlayers === null
          ? null
          : Number(minNonClubPlayers);
    }

    if (useDb && db) {
      try {
        await db
          .update(auctionFranchises)
          .set({
            sport: target.sport,
            slotNumber: target.slotNumber,
            name: target.name,
            shortCode: target.shortCode,
            accentColor: target.accentColor,
            captainName: target.captainName,
            startingPurse: target.startingPurse,
            minSquadSize: target.minSquadSize ?? null,
            maxSquadSize: target.maxSquadSize ?? null,
            minClubPlayers: target.minClubPlayers ?? null,
            minNonClubPlayers: target.minNonClubPlayers ?? null,
          })
          .where(eq(auctionFranchises.id, target.id));
      } catch {
        // Ignore if table not pushed
      }
    }

    broadcastAuctionSnapshot();
    const summaries = computeFranchiseSummaries();
    res.json({
      franchise: summaries.find((f) => f.id === target.id) || target,
      franchises: summaries,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete("/api/auction/franchises/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const actorUserId = Number(req.body?.actorUserId ?? req.query.actorUserId);
    const actor = await getUserById(actorUserId);
    if (!actor || !isSportsAdmin(actor.role)) {
      return res.status(403).json({
        error: "Only Sports Secretary or Faculty Advisor can delete franchises.",
      });
    }

    const idx = auctionState.franchises.findIndex((f) => f.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Franchise not found." });
    }

    const hasOwned = auctionState.registrations.some(
      (r) => r.status === "SOLD" && r.soldToFranchiseId === id
    );
    if (hasOwned) {
      return res.status(400).json({
        error:
          "Cannot delete a franchise that already owns SOLD players. Undo those sales first.",
      });
    }

    auctionState.franchises.splice(idx, 1);

    if (useDb && db) {
      try {
        await db
          .delete(auctionFranchises)
          .where(eq(auctionFranchises.id, id));
      } catch {
        // Ignore if table not pushed
      }
    }

    broadcastAuctionSnapshot();
    res.json({ deletedId: id, franchises: computeFranchiseSummaries() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/auction/registrations", async (req, res) => {
  try {
    const {
      userId,
      yearLabel,
      branch,
      sport,
      positions,
      statsSummary,
      photoUrl,
    } = req.body;

    if (
      ["FROZEN", "LIVE", "COMPLETED", "PUBLISHED"].includes(
        auctionState.auction.status
      )
    ) {
      return res
        .status(400)
        .json({ error: "Registration window is closed for this auction." });
    }

    const user = await getUserById(Number(userId));
    if (!user) return res.status(401).json({ error: "Valid user required" });

    const sportName = String(sport || "").trim();
    if (!sportName) {
      return res.status(400).json({ error: "Sport is required" });
    }

    const dup = auctionState.registrations.find(
      (r) =>
        r.userId === user.id &&
        r.sport.toLowerCase() === sportName.toLowerCase()
    );
    if (dup) {
      return res
        .status(409)
        .json({ error: `Already registered for ${sportName}` });
    }

    let savedPhotoUrl: string | null = null;
    try {
      savedPhotoUrl = await saveValidatedPlayerPhoto(photoUrl);
    } catch (photoErr) {
      return res.status(400).json({
        error:
          photoErr instanceof Error
            ? photoErr.message
            : "Invalid player photo",
      });
    }

    const inducted = await getInductedSportsForUser(user.id);
    const isClub = inducted.some(
      (s) => s.toLowerCase() === sportName.toLowerCase()
    );
    const playerClass: PlayerClass = isClub ? "CLUB" : "NON_CLUB";
    const basePrice = getEffectiveBasePrice(
      auctionState.auction,
      sportName,
      playerClass
    );

    const configuredPositions =
      auctionState.auction.positionsBySport?.[sportName] || [];
    const cleanPositions =
      Array.isArray(positions) && positions.length
        ? positions.map(String)
        : [configuredPositions[0] || "Player"];

    const tiers = auctionState.auction.playerTiers || [
      "MARQUEE",
      "TIER_1",
      "TIER_2",
      "UNCAPPED",
    ];
    const resolvedTier = isClub
      ? tiers.includes("TIER_1")
        ? "TIER_1"
        : tiers[0] || "TIER_1"
      : tiers[tiers.length - 1] || "UNCAPPED";

    let nextId =
      auctionState.registrations.reduce((max, r) => Math.max(max, r.id), 0) + 1;

    if (useDb && db) {
      try {
        const [inserted] = await db
          .insert(auctionRegistrations)
          .values({
            auctionId: auctionState.auction.id,
            userId: user.id,
            playerName: user.name,
            rollNumber: user.rollNumber || "IIITT",
            yearLabel: String(yearLabel || user.batch),
            branch: String(branch || user.branch),
            sport: sportName,
            positionsJson: JSON.stringify(cleanPositions),
            playerClass,
            basePrice,
            tier: resolvedTier,
            roundId: auctionState.auction.activeRoundId || 1,
            status: "ELIGIBLE",
            soldToFranchiseId: null,
            soldPrice: null,
            statsSummary: String(statsSummary || "").trim(),
            photoUrl: savedPhotoUrl,
          })
          .returning();
        if (inserted) nextId = inserted.id;
      } catch {
        // Keep in-memory state working even if auction_registrations table hasn't been pushed
      }
    }

    const registration: AuctionRegistration = {
      id: nextId,
      auctionId: auctionState.auction.id,
      userId: user.id,
      playerName: user.name,
      rollNumber: user.rollNumber || "IIITT",
      yearLabel: String(yearLabel || user.batch),
      branch: String(branch || user.branch),
      sport: sportName,
      positions: cleanPositions,
      playerClass,
      basePrice,
      tier: resolvedTier,
      roundId: auctionState.auction.activeRoundId || 1,
      status: "ELIGIBLE",
      soldToFranchiseId: null,
      soldPrice: null,
      statsSummary: String(statsSummary || "").trim(),
      photoUrl: savedPhotoUrl,
    };

    auctionState.registrations.push(registration);
    broadcastAuctionSnapshot();
    res.status(201).json({ registration });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/auction/registrations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      actorUserId,
      playerName,
      rollNumber,
      yearLabel,
      branch,
      positions,
      playerClass,
      basePrice,
      tier,
      roundId,
      status,
      statsSummary,
      photoUrl,
    } = req.body;

    const actor = await getUserById(Number(actorUserId));
    if (!actor || !canOperateAuction(actor.role)) {
      return res.status(403).json({
        error:
          "Only Sports Secretary, Faculty Advisor, or Auction Operator can edit auction entries.",
      });
    }

    const admin = isSportsAdmin(actor.role);
    const adminOnlyFields =
      playerName !== undefined ||
      rollNumber !== undefined ||
      yearLabel !== undefined ||
      branch !== undefined ||
      positions !== undefined ||
      playerClass !== undefined ||
      tier !== undefined ||
      statsSummary !== undefined ||
      photoUrl !== undefined;

    if (!admin && adminOnlyFields) {
      return res.status(403).json({
        error:
          "Auction Operators may adjust base price, round, or status live; full player profile edits require Sports Secretary access.",
      });
    }

    const reg = auctionState.registrations.find((r) => r.id === id);
    if (!reg) return res.status(404).json({ error: "Registration not found" });

    if (playerName !== undefined && String(playerName).trim()) {
      reg.playerName = String(playerName).trim();
    }
    if (rollNumber !== undefined && String(rollNumber).trim()) {
      reg.rollNumber = String(rollNumber).trim();
    }
    if (yearLabel !== undefined) reg.yearLabel = String(yearLabel).trim();
    if (branch !== undefined) reg.branch = String(branch).trim();
    if (Array.isArray(positions) && positions.length > 0) {
      reg.positions = positions.map(String);
    }

    let classChanged = false;
    if (playerClass === "CLUB" || playerClass === "NON_CLUB") {
      if (reg.playerClass !== playerClass) classChanged = true;
      reg.playerClass = playerClass;
    }

    if (basePrice !== undefined && basePrice !== "") {
      const parsedBase = Number(basePrice);
      if (!Number.isFinite(parsedBase) || parsedBase < 0) {
        return res
          .status(400)
          .json({ error: "Base price must be a non-negative number." });
      }
      reg.basePrice = Math.round(parsedBase);
    } else if (classChanged) {
      reg.basePrice = getEffectiveBasePrice(
        auctionState.auction,
        reg.sport,
        reg.playerClass
      );
    }

    if (tier !== undefined && String(tier).trim()) {
      reg.tier = String(tier).trim();
    }
    if (roundId !== undefined && Number(roundId) > 0) {
      const targetRound = auctionState.rounds.find(
        (r) => r.id === Number(roundId)
      );
      if (targetRound) reg.roundId = targetRound.id;
    }
    if (status) reg.status = status as AuctionPlayerStatus;
    if (statsSummary !== undefined) {
      reg.statsSummary = String(statsSummary).trim();
    }
    if (photoUrl !== undefined) {
      reg.photoUrl = await saveValidatedPlayerPhoto(photoUrl);
    }

    if (useDb && db) {
      try {
        await db
          .update(auctionRegistrations)
          .set({
            playerName: reg.playerName,
            rollNumber: reg.rollNumber,
            yearLabel: reg.yearLabel,
            branch: reg.branch,
            positionsJson: JSON.stringify(reg.positions),
            playerClass: reg.playerClass,
            basePrice: reg.basePrice,
            tier: reg.tier,
            roundId: reg.roundId,
            status: reg.status,
            statsSummary: reg.statsSummary,
            photoUrl: reg.photoUrl ?? null,
          })
          .where(eq(auctionRegistrations.id, id));
      } catch {
        // Ignore if table not pushed
      }
    }

    broadcastAuctionSnapshot();
    res.json({ registration: reg });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/auction/round", async (req, res) => {
  try {
    const { actorUserId, roundId } = req.body;
    const actor = await getUserById(Number(actorUserId));
    if (!actor || !canOperateAuction(actor.role)) {
      return res.status(403).json({ error: "Not authorized to switch round" });
    }
    const targetRound = auctionState.rounds.find(
      (r) => r.id === Number(roundId)
    );
    if (!targetRound) {
      return res.status(404).json({ error: "Round not found" });
    }
    auctionState.rounds.forEach((r) => {
      if (r.id === targetRound.id) r.status = "ACTIVE";
      else if (r.status === "ACTIVE") r.status = "COMPLETED";
    });
    auctionState.auction.activeRoundId = targetRound.id;
    if (useDb && db) {
      try {
        for (const r of auctionState.rounds) {
          await db
            .update(auctionRounds)
            .set({ status: r.status })
            .where(eq(auctionRounds.id, r.id));
        }
      } catch {
        // Ignore
      }
    }
    await persistAuctionConfigToDb();
    broadcastAuctionSnapshot();
    res.json({ auction: auctionState.auction });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/auction/status", async (req, res) => {
  try {
    const { actorUserId, status } = req.body;
    const actor = await getUserById(Number(actorUserId));
    if (!actor || !isSportsAdmin(actor.role)) {
      return res.status(403).json({
        error: "Only Sports Secretary can change auction status",
      });
    }
    auctionState.auction.status = status as AuctionStatus;
    await persistAuctionConfigToDb();
    broadcastAuctionSnapshot();
    res.json({ auction: auctionState.auction });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/auction/live-state", (_req, res) => {
  res.json(buildLiveAuctionSnapshot());
});

app.get("/api/auction/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify(buildLiveAuctionSnapshot())}\n\n`);
  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 20000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

app.post("/api/auction/context", async (req, res) => {
  try {
    const { actorUserId, activeSport, activeRoundId, currentPlayerId } =
      req.body;
    const actor = await getUserById(Number(actorUserId));
    if (!actor || !canOperateAuction(actor.role)) {
      return res.status(403).json({ error: "Operator access required" });
    }

    if (activeRoundId !== undefined && Number(activeRoundId) > 0) {
      const targetRound = auctionState.rounds.find(
        (r) => r.id === Number(activeRoundId)
      );
      if (targetRound) {
        auctionState.rounds.forEach((r) => {
          if (r.id === targetRound.id) r.status = "ACTIVE";
          else if (r.status === "ACTIVE") r.status = "COMPLETED";
        });
        auctionState.auction.activeRoundId = targetRound.id;
      }
    }

    if (currentPlayerId !== undefined && currentPlayerId !== null) {
      const targetPlayer = auctionState.registrations.find(
        (r) => r.id === Number(currentPlayerId)
      );
      if (!targetPlayer) {
        return res.status(404).json({ error: "Player not found." });
      }
      if (targetPlayer.status === "SOLD") {
        return res.status(400).json({
          error: `${targetPlayer.playerName} is already SOLD.`,
        });
      }
      const prevPlayer = auctionState.registrations.find(
        (r) => r.id === auctionState.auction.currentPlayerId
      );
      if (
        prevPlayer &&
        prevPlayer.id !== targetPlayer.id &&
        prevPlayer.status === "IN_AUCTION"
      ) {
        prevPlayer.status = "ELIGIBLE";
      }
      targetPlayer.status = "IN_AUCTION";
      auctionState.auction.currentPlayerId = targetPlayer.id;
      auctionState.auction.activeSport = targetPlayer.sport;
      auctionState.auction.activeRoundId = targetPlayer.roundId;
      auctionState.auction.projectorMode = "STAGE";
      await persistAuctionConfigToDb();
      broadcastAuctionSnapshot();
      return res.json({
        message: `Pulled ${targetPlayer.playerName} (${targetPlayer.sport}) onto the auction block.`,
        snapshot: buildLiveAuctionSnapshot(),
      });
    }

    if (activeSport) {
      const nextSport = String(activeSport);
      auctionState.auction.activeSport = nextSport;
      const curPlayer = auctionState.registrations.find(
        (r) => r.id === auctionState.auction.currentPlayerId
      );
      if (
        !curPlayer ||
        curPlayer.sport.toLowerCase() !== nextSport.toLowerCase()
      ) {
        if (curPlayer && curPlayer.status === "IN_AUCTION") {
          curPlayer.status = "ELIGIBLE";
        }
        const candidate = auctionState.registrations.find(
          (r) =>
            r.sport.toLowerCase() === nextSport.toLowerCase() &&
            (r.status === "ELIGIBLE" ||
              r.status === "REGISTERED" ||
              r.status === "RE_AUCTIONED")
        );
        if (candidate) {
          candidate.status = "IN_AUCTION";
          auctionState.auction.currentPlayerId = candidate.id;
        } else {
          auctionState.auction.currentPlayerId = null;
        }
        auctionState.auction.projectorMode = "STAGE";
      }
    }

    await persistAuctionConfigToDb();
    broadcastAuctionSnapshot();
    res.json({
      message: `Switched auction context to ${auctionState.auction.activeSport}`,
      snapshot: buildLiveAuctionSnapshot(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/auction/next-player", async (req, res) => {
  try {
    const { actorUserId, sport } = req.body;
    const actor = await getUserById(Number(actorUserId));
    if (!actor || !canOperateAuction(actor.role)) {
      return res.status(403).json({ error: "Operator access required" });
    }

    const prevId = auctionState.auction.currentPlayerId;
    const prevPlayer = auctionState.registrations.find((r) => r.id === prevId);
    if (prevPlayer && prevPlayer.status === "IN_AUCTION") {
      prevPlayer.status = "ELIGIBLE";
    }

    const activeSport = String(sport || auctionState.auction.activeSport);
    const activeRoundId = auctionState.auction.activeRoundId;
    const isPoolCandidate = (r: AuctionRegistration) =>
      r.status === "ELIGIBLE" ||
      r.status === "REGISTERED" ||
      r.status === "RE_AUCTIONED";

    const nextCandidate =
      auctionState.registrations.find(
        (r) =>
          r.id !== prevId &&
          r.sport.toLowerCase() === activeSport.toLowerCase() &&
          r.roundId === activeRoundId &&
          isPoolCandidate(r)
      ) ||
      auctionState.registrations.find(
        (r) =>
          r.id !== prevId &&
          r.sport.toLowerCase() === activeSport.toLowerCase() &&
          isPoolCandidate(r)
      ) ||
      auctionState.registrations.find(
        (r) => r.id !== prevId && isPoolCandidate(r)
      ) ||
      auctionState.registrations.find((r) => isPoolCandidate(r));

    if (!nextCandidate) {
      auctionState.auction.currentPlayerId = null;
      auctionState.auction.projectorMode = "STAGE";
      await persistAuctionConfigToDb();
      broadcastAuctionSnapshot();
      return res.json({
        message: "No remaining eligible players in the pool.",
        snapshot: buildLiveAuctionSnapshot(),
      });
    }

    nextCandidate.status = "IN_AUCTION";
    auctionState.auction.currentPlayerId = nextCandidate.id;
    auctionState.auction.activeSport = nextCandidate.sport;
    auctionState.auction.projectorMode = "STAGE";
    await persistAuctionConfigToDb();
    broadcastAuctionSnapshot();

    res.json({
      message: `${nextCandidate.playerName} (${nextCandidate.sport}) is now on the block.`,
      snapshot: buildLiveAuctionSnapshot(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/auction/bid", async (req, res) => {
  try {
    const { actorUserId, playerId, franchiseId, amount, kind } = req.body;
    const actor = await getUserById(Number(actorUserId));
    if (!actor || !canOperateAuction(actor.role)) {
      return res.status(403).json({ error: "Operator access required" });
    }

    const player = auctionState.registrations.find(
      (r) => r.id === Number(playerId)
    );
    if (!player) return res.status(404).json({ error: "Player not found" });

    const franchises = computeFranchiseSummaries();
    const franchise = franchises.find((f) => f.id === Number(franchiseId));
    if (!franchise) {
      return res.status(404).json({ error: "Franchise not found" });
    }

    if (franchise.sport.toLowerCase() !== player.sport.toLowerCase()) {
      return res.status(400).json({
        error: `Cross-sport bidding blocked: ${franchise.name} competes in ${franchise.sport}, not ${player.sport}.`,
      });
    }

    const bidAmount = Number(amount);
    if (!Number.isFinite(bidAmount) || bidAmount < player.basePrice) {
      return res.status(400).json({
        error: `Bid must be at least base price ₹${player.basePrice.toLocaleString()}`,
      });
    }
    if (!franchise.isEligibleToBid || bidAmount > franchise.maxAllowedBid) {
      return res.status(400).json({
        error:
          franchise.lockReason ||
          `${franchise.name} exceeds max allowed bid (₹${franchise.maxAllowedBid.toLocaleString()})`,
      });
    }

    auctionState.bidHistory.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      auctionId: auctionState.auction.id,
      roundId: auctionState.auction.activeRoundId || 1,
      playerId: player.id,
      playerName: player.playerName,
      franchiseId: franchise.id,
      franchiseName: franchise.name,
      amount: bidAmount,
      kind: kind === "JUMP_BID" ? "JUMP_BID" : "BID",
      timestamp: new Date().toLocaleTimeString(),
    });

    auctionState.auction.projectorMode = "STAGE";
    broadcastAuctionSnapshot();
    res.json({
      message: `${franchise.name} bid ₹${bidAmount.toLocaleString()} for ${player.playerName}`,
      snapshot: buildLiveAuctionSnapshot(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/auction/outcome", async (req, res) => {
  try {
    const { actorUserId, playerId, outcome, franchiseId, amount } = req.body;
    const actor = await getUserById(Number(actorUserId));
    if (!actor || !canOperateAuction(actor.role)) {
      return res.status(403).json({ error: "Operator access required" });
    }

    const player = auctionState.registrations.find(
      (r) => r.id === Number(playerId)
    );
    if (!player) return res.status(404).json({ error: "Player not found" });

    if (outcome === "SOLD") {
      const franchises = computeFranchiseSummaries();
      const franchise = franchises.find((f) => f.id === Number(franchiseId));
      if (!franchise) {
        return res
          .status(400)
          .json({ error: "Valid winning franchise required" });
      }
      if (franchise.sport.toLowerCase() !== player.sport.toLowerCase()) {
        return res.status(400).json({
          error: `Cross-sport sale blocked: ${franchise.name} is a ${franchise.sport} franchise, not ${player.sport}.`,
        });
      }
      const soldAmount = Number(amount || player.basePrice);
      if (!franchise.isEligibleToBid || soldAmount > franchise.maxAllowedBid) {
        return res.status(400).json({
          error:
            franchise.lockReason ||
            `${franchise.name} cannot complete purchase above max bid ₹${franchise.maxAllowedBid.toLocaleString()}.`,
        });
      }
      player.status = "SOLD";
      player.soldToFranchiseId = franchise.id;
      player.soldPrice = soldAmount;
      if (useDb && db) {
        try {
          await db
            .update(auctionRegistrations)
            .set({
              status: "SOLD",
              soldToFranchiseId: franchise.id,
              soldPrice: soldAmount,
            })
            .where(eq(auctionRegistrations.id, player.id));
        } catch {
          // Ignore if table not pushed
        }
      }
      auctionState.auction.projectorMode = "SOLD";
      auctionState.bidHistory.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        auctionId: auctionState.auction.id,
        roundId: auctionState.auction.activeRoundId || 1,
        playerId: player.id,
        playerName: player.playerName,
        franchiseId: franchise.id,
        franchiseName: franchise.name,
        amount: soldAmount,
        kind: "SOLD",
        timestamp: new Date().toLocaleTimeString(),
      });
      await persistAuctionConfigToDb();
      broadcastAuctionSnapshot();
      return res.json({
        message: `SOLD! ${player.playerName} to ${franchise.name} (${franchise.sport}) for ₹${soldAmount.toLocaleString()}`,
        snapshot: buildLiveAuctionSnapshot(),
      });
    }

    player.status = "UNSOLD";
    player.soldToFranchiseId = null;
    player.soldPrice = null;
    if (useDb && db) {
      try {
        await db
          .update(auctionRegistrations)
          .set({
            status: "UNSOLD",
            soldToFranchiseId: null,
            soldPrice: null,
          })
          .where(eq(auctionRegistrations.id, player.id));
      } catch {
        // Ignore if table not pushed
      }
    }
    auctionState.auction.projectorMode = "UNSOLD";
    auctionState.bidHistory.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      auctionId: auctionState.auction.id,
      roundId: auctionState.auction.activeRoundId || 1,
      playerId: player.id,
      playerName: player.playerName,
      franchiseId: 0,
      franchiseName: "Unsold Pool",
      amount: 0,
      kind: "UNSOLD",
      timestamp: new Date().toLocaleTimeString(),
    });
    await persistAuctionConfigToDb();
    broadcastAuctionSnapshot();
    res.json({
      message: `${player.playerName} marked UNSOLD.`,
      snapshot: buildLiveAuctionSnapshot(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/auction/undo", async (req, res) => {
  try {
    const { actorUserId } = req.body;
    const actor = await getUserById(Number(actorUserId));
    if (!actor || !canOperateAuction(actor.role)) {
      return res.status(403).json({ error: "Operator access required" });
    }

    const last = auctionState.bidHistory.pop();
    if (!last) {
      return res.status(400).json({ error: "Nothing to undo." });
    }

    if (last.kind === "SOLD" || last.kind === "UNSOLD") {
      const player = auctionState.registrations.find(
        (r) => r.id === last.playerId
      );
      if (player) {
        player.status = "IN_AUCTION";
        player.soldToFranchiseId = null;
        player.soldPrice = null;
        auctionState.auction.currentPlayerId = player.id;
        auctionState.auction.activeSport = player.sport;
        if (useDb && db) {
          try {
            await db
              .update(auctionRegistrations)
              .set({
                status: "IN_AUCTION",
                soldToFranchiseId: null,
                soldPrice: null,
              })
              .where(eq(auctionRegistrations.id, player.id));
          } catch {
            // Ignore if table not pushed
          }
        }
      }
      auctionState.auction.projectorMode = "STAGE";
      await persistAuctionConfigToDb();
    }

    broadcastAuctionSnapshot();
    res.json({
      message: `Undid ${last.kind} for ${last.playerName}.`,
      snapshot: buildLiveAuctionSnapshot(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/auction/rtm", async (req, res) => {
  try {
    const { actorUserId, playerId } = req.body;
    const actor = await getUserById(Number(actorUserId));
    if (!actor || !canOperateAuction(actor.role)) {
      return res.status(403).json({ error: "Operator access required" });
    }

    const player = auctionState.registrations.find(
      (r) => r.id === Number(playerId)
    );
    if (!player) return res.status(404).json({ error: "Player not found" });

    auctionState.bidHistory.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      auctionId: auctionState.auction.id,
      roundId: auctionState.auction.activeRoundId || 1,
      playerId: player.id,
      playerName: player.playerName,
      franchiseId: 0,
      franchiseName: "RTM Triggered",
      amount: player.soldPrice || player.basePrice,
      kind: "RTM",
      timestamp: new Date().toLocaleTimeString(),
    });
    broadcastAuctionSnapshot();
    res.json({
      message: `RTM card triggered for ${player.playerName}.`,
      snapshot: buildLiveAuctionSnapshot(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/auction/projector", async (req, res) => {
  try {
    const { actorUserId, mode } = req.body;
    const actor = await getUserById(Number(actorUserId));
    if (!actor || !canOperateAuction(actor.role)) {
      return res.status(403).json({ error: "Operator access required" });
    }
    const allowed: AuctionConfig["projectorMode"][] = [
      "STAGE",
      "SOLD",
      "UNSOLD",
      "STANDINGS",
      "PAUSED",
    ];
    if (allowed.includes(mode)) {
      auctionState.auction.projectorMode = mode;
    }
    await persistAuctionConfigToDb();
    broadcastAuctionSnapshot();
    res.json({
      message: `Projector set to ${auctionState.auction.projectorMode}`,
      snapshot: buildLiveAuctionSnapshot(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- SERVER STARTUP (VITE MIDDLEWARE IN DEV, STATIC DIST/CLIENT IN PROD) ---

async function startServer() {
  if (useDb && pool) {
    try {
      await pool.query("SELECT 1");
      console.log("Connected to PostgreSQL via DATABASE_URL.");
      await hydrateAuctionFromDb();
    } catch {
      console.log(
        "PostgreSQL host unavailable; running cleanly with in-memory demo store."
      );
      useDb = false;
      pool.end().catch(() => {});
    }
  } else {
    console.log(
      "Running with zero-crash in-memory demo store (DATABASE_URL not active)."
    );
  }

  if (process.env.NODE_ENV === "production") {
    const clientDist = path.resolve(__dirname, "../../client");
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  function shutdown() {
    server.close(async () => {
      if (pool) {
        await pool.end();
      }
      process.exit(0);
    });
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
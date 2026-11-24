import "dotenv/config";
import express, { type Response } from "express";
import cors from "cors";
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
} from "../db/schema.js";
import {
  demoStore,
  auctionState,
  buildLiveAuctionSnapshot,
  computeFranchiseSummaries,
} from "./demoStore.js";
import type {
  AuctionConfig,
  AuctionPlayerStatus,
  AuctionStatus,
} from "../types/auction.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

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
  return ["AUCTION_OPERATOR", "SPORTS_SECRETARY", "FACULTY_ADVISOR"].includes(
    role
  );
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
      rounds: auctionState.rounds,
      registrations: auctionState.registrations,
      inductedSports,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/auction/registrations", async (req, res) => {
  try {
    const { userId, yearLabel, branch, sport, positions, statsSummary } =
      req.body;

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

    const inducted = await getInductedSportsForUser(user.id);
    const isClub = inducted.some(
      (s) => s.toLowerCase() === sportName.toLowerCase()
    );
    const playerClass = isClub ? "CLUB" : "NON_CLUB";
    const basePrice = isClub
      ? auctionState.auction.clubBasePrice
      : auctionState.auction.nonClubBasePrice;

    const nextId =
      auctionState.registrations.reduce((max, r) => Math.max(max, r.id), 0) + 1;
    const registration = {
      id: nextId,
      auctionId: auctionState.auction.id,
      userId: user.id,
      playerName: user.name,
      rollNumber: user.rollNumber || "IIITT",
      yearLabel: String(yearLabel || user.batch),
      branch: String(branch || user.branch),
      sport: sportName,
      positions: Array.isArray(positions) && positions.length ? positions : ["Player"],
      playerClass: playerClass as "CLUB" | "NON_CLUB",
      basePrice,
      tier: (isClub ? "TIER_1" : "UNCAPPED") as "TIER_1" | "UNCAPPED",
      roundId: auctionState.auction.activeRoundId || 1,
      status: "ELIGIBLE" as AuctionPlayerStatus,
      soldToFranchiseId: null,
      soldPrice: null,
      statsSummary: String(statsSummary || "").trim(),
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
    const { actorUserId, yearLabel, branch, positions, status } = req.body;
    const actor = await getUserById(Number(actorUserId));
    if (!actor || !isSportsAdmin(actor.role)) {
      return res
        .status(403)
        .json({ error: "Only Sports Secretary can edit auction entries" });
    }

    const reg = auctionState.registrations.find((r) => r.id === id);
    if (!reg) return res.status(404).json({ error: "Registration not found" });

    if (yearLabel !== undefined) reg.yearLabel = String(yearLabel);
    if (branch !== undefined) reg.branch = String(branch);
    if (Array.isArray(positions) && positions.length > 0) {
      reg.positions = positions.map(String);
    }
    if (status) reg.status = status as AuctionPlayerStatus;

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
    const { actorUserId, activeSport, activeRoundId } = req.body;
    const actor = await getUserById(Number(actorUserId));
    if (!actor || !canOperateAuction(actor.role)) {
      return res.status(403).json({ error: "Operator access required" });
    }
    if (activeSport) auctionState.auction.activeSport = String(activeSport);
    if (activeRoundId) {
      auctionState.auction.activeRoundId = Number(activeRoundId);
    }
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

    const activeSport = String(sport || auctionState.auction.activeSport);
    const nextCandidate =
      auctionState.registrations.find(
        (r) =>
          r.sport.toLowerCase() === activeSport.toLowerCase() &&
          (r.status === "ELIGIBLE" ||
            r.status === "REGISTERED" ||
            r.status === "RE_AUCTIONED")
      ) ||
      auctionState.registrations.find(
        (r) =>
          r.status === "ELIGIBLE" ||
          r.status === "REGISTERED" ||
          r.status === "RE_AUCTIONED"
      );

    if (!nextCandidate) {
      auctionState.auction.currentPlayerId = null;
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

    const bidAmount = Number(amount);
    if (!Number.isFinite(bidAmount) || bidAmount < player.basePrice) {
      return res.status(400).json({
        error: `Bid must be at least base price ₹${player.basePrice.toLocaleString()}`,
      });
    }
    if (!franchise.isEligibleToBid || bidAmount > franchise.maxAllowedBid) {
      return res.status(400).json({
        error: `${franchise.name} exceeds max allowed bid (₹${franchise.maxAllowedBid.toLocaleString()})`,
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
      const soldAmount = Number(amount || player.basePrice);
      player.status = "SOLD";
      player.soldToFranchiseId = franchise.id;
      player.soldPrice = soldAmount;
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
      broadcastAuctionSnapshot();
      return res.json({
        message: `SOLD! ${player.playerName} to ${franchise.name} for ₹${soldAmount.toLocaleString()}`,
        snapshot: buildLiveAuctionSnapshot(),
      });
    }

    player.status = "UNSOLD";
    player.soldToFranchiseId = null;
    player.soldPrice = null;
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
      }
      auctionState.auction.projectorMode = "STAGE";
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
    } catch (err) {
      console.warn(
        "PostgreSQL connection failed; falling back to in-memory demo store:",
        err instanceof Error ? err.message : String(err)
      );
      useDb = false;
    }
  } else {
    console.log(
      "DATABASE_URL not set; running with zero-crash in-memory demo store."
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
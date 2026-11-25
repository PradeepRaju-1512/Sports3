import type { Express } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  auctionOperators,
  clubMemberships,
  notices,
  siteSettings,
  sportsClubs,
  tournamentMatches,
  tournamentTeams,
  users,
} from "../db/schema.js";
import { auctionState, demoStore } from "./demoStore.js";
import { requireAuth, toPublicUser, type AuthUserRecord } from "./auth.js";
import { normalizeBatchCode, sendServerError } from "./security.js";

export interface RoleRouteDeps {
  useDb: () => boolean;
  broadcastNavUpdate: () => Promise<void>;
}

const VALID_BATCH_SCOPES = new Set(["1ST", "2ND", "3RD", "4TH", "MTECH", "ALL"]);

function isPlatformAdmin(actor: AuthUserRecord | null | undefined): boolean {
  return Boolean(
    actor &&
      (actor.role === "SPORTS_SECRETARY" || actor.role === "FACULTY_ADVISOR")
  );
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function registerRoleAndAdminRoutes(app: Express, deps: RoleRouteDeps) {
  const { useDb, broadcastNavUpdate } = deps;

  async function isClubSecretaryFor(
    actor: AuthUserRecord,
    clubId: number
  ): Promise<boolean> {
    if (isPlatformAdmin(actor)) return true;
    if (useDb() && db) {
      const [m] = await db
        .select()
        .from(clubMemberships)
        .where(
          and(
            eq(clubMemberships.clubId, clubId),
            eq(clubMemberships.userId, actor.id),
            eq(clubMemberships.memberRole, "SECRETARY"),
            eq(clubMemberships.status, "INDUCTED")
          )
        );
      return Boolean(m);
    }
    return demoStore.memberships.some(
      (m) =>
        m.clubId === clubId &&
        m.userId === actor.id &&
        m.memberRole === "SECRETARY" &&
        m.status === "INDUCTED"
    );
  }

  async function syncDerivedUserRole(userId: number) {
    if (useDb() && db) {
      const [u] = await db.select().from(users).where(eq(users.id, userId));
      if (!u || u.role === "SPORTS_SECRETARY" || u.role === "FACULTY_ADVISOR") {
        return;
      }
      const [mems, ops, teams] = await Promise.all([
        db
          .select()
          .from(clubMemberships)
          .where(
            and(
              eq(clubMemberships.userId, userId),
              eq(clubMemberships.status, "INDUCTED")
            )
          ),
        db
          .select()
          .from(auctionOperators)
          .where(eq(auctionOperators.userId, userId)),
        db
          .select()
          .from(tournamentTeams)
          .where(eq(tournamentTeams.captainUserId, userId)),
      ]);

      let nextRole = u.role;
      if (mems.some((m) => m.memberRole === "SECRETARY")) {
        nextRole = "CLUB_SECRETARY";
      } else if (ops.length > 0) {
        nextRole = "AUCTION_OPERATOR";
      } else if (u.role === "MATCH_SCORER") {
        nextRole = "MATCH_SCORER";
      } else if (mems.some((m) => m.memberRole === "COORDINATOR")) {
        nextRole = "CLUB_COORDINATOR";
      } else if (teams.length > 0) {
        nextRole = "CAPTAIN";
      } else if (mems.length > 0) {
        nextRole = "CLUB_MEMBER";
      } else {
        nextRole = "STUDENT";
      }

      if (nextRole !== u.role) {
        await db.update(users).set({ role: nextRole }).where(eq(users.id, userId));
      }
      return;
    }

    const u = demoStore.users.find((x) => x.id === userId);
    if (!u || u.role === "SPORTS_SECRETARY" || u.role === "FACULTY_ADVISOR") {
      return;
    }
    const mems = demoStore.memberships.filter(
      (m) => m.userId === userId && m.status === "INDUCTED"
    );
    const ops = demoStore.auctionOperators.filter((o) => o.userId === userId);
    const teams = demoStore.tournamentTeams.filter(
      (t) => t.captainUserId === userId
    );

    if (mems.some((m) => m.memberRole === "SECRETARY")) {
      u.role = "CLUB_SECRETARY";
    } else if (ops.length > 0) {
      u.role = "AUCTION_OPERATOR";
    } else if (u.role === "MATCH_SCORER") {
      u.role = "MATCH_SCORER";
    } else if (mems.some((m) => m.memberRole === "COORDINATOR")) {
      u.role = "CLUB_COORDINATOR";
    } else if (teams.length > 0) {
      u.role = "CAPTAIN";
    } else if (mems.length > 0) {
      u.role = "CLUB_MEMBER";
    } else {
      u.role = "STUDENT";
    }
  }

  // GET /api/admin/roles — overview of appointments & site nav settings for admins & club secretaries
  app.get("/api/admin/roles", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser!;
      const isAdmin = isPlatformAdmin(actor);

      let secretaryClubIds: number[] = [];
      if (useDb() && db) {
        const mySecMems = await db
          .select({ clubId: clubMemberships.clubId })
          .from(clubMemberships)
          .where(
            and(
              eq(clubMemberships.userId, actor.id),
              eq(clubMemberships.memberRole, "SECRETARY"),
              eq(clubMemberships.status, "INDUCTED")
            )
          );
        secretaryClubIds = mySecMems.map((m) => m.clubId);
      } else {
        secretaryClubIds = demoStore.memberships
          .filter(
            (m) =>
              m.userId === actor.id &&
              m.memberRole === "SECRETARY" &&
              m.status === "INDUCTED"
          )
          .map((m) => m.clubId);
      }

      if (!isAdmin && secretaryClubIds.length === 0) {
        return res.status(403).json({
          error:
            "Only Sports Secretary, Faculty Advisor, or Club Secretary can view role appointments",
        });
      }

      if (useDb() && db) {
        const [userList, clubList, memList, teamList, opList, matchList, settingsRows] =
          await Promise.all([
            db
              .select({
                id: users.id,
                name: users.name,
                batch: users.batch,
                branch: users.branch,
                role: users.role,
              })
              .from(users)
              .orderBy(asc(users.name)),
            db.select().from(sportsClubs).orderBy(asc(sportsClubs.sortOrder)),
            db.select().from(clubMemberships),
            db.select().from(tournamentTeams).orderBy(asc(tournamentTeams.id)),
            db
              .select()
              .from(auctionOperators)
              .where(eq(auctionOperators.auctionId, auctionState.auction.id)),
            db
              .select({
                id: tournamentMatches.id,
                sportName: tournamentMatches.sportName,
                teamA: tournamentMatches.teamA,
                teamB: tournamentMatches.teamB,
                status: tournamentMatches.status,
                scorerUserId: tournamentMatches.scorerUserId,
              })
              .from(tournamentMatches)
              .orderBy(desc(tournamentMatches.id)),
            db.select().from(siteSettings).where(eq(siteSettings.id, 1)),
          ]);

        const settings = settingsRows[0] || {
          showAuctionInNav: true,
          showLiveAuctionInNav: true,
        };

        return res.json({
          isAdmin,
          secretaryClubIds,
          users: userList,
          clubs: clubList.map((c) => ({
            id: c.id,
            slug: c.slug,
            name: c.name,
            officials: memList
              .filter(
                (m) =>
                  m.clubId === c.id &&
                  m.status === "INDUCTED" &&
                  (m.memberRole === "SECRETARY" || m.memberRole === "COORDINATOR")
              )
              .map((m) => ({
                id: m.id,
                userId: m.userId,
                memberRole: m.memberRole,
                batchScope: m.batchScope,
              })),
          })),
          teams: teamList.map((t) => ({
            id: t.id,
            tournamentId: t.tournamentId,
            sportName: t.sportName,
            teamName: t.teamName,
            captainUserId: t.captainUserId,
          })),
          matches: matchList,
          auctionId: auctionState.auction.id,
          auctionOperators: opList.map((o) => ({
            id: o.id,
            auctionId: o.auctionId,
            userId: o.userId,
          })),
          siteSettings: {
            showAuctionInNav: settings.showAuctionInNav,
            showLiveAuctionInNav: settings.showLiveAuctionInNav,
          },
        });
      }

      res.json({
        isAdmin,
        secretaryClubIds,
        users: demoStore.users.map(toPublicUser),
        clubs: demoStore.clubs.map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          officials: demoStore.memberships
            .filter(
              (m) =>
                m.clubId === c.id &&
                m.status === "INDUCTED" &&
                (m.memberRole === "SECRETARY" || m.memberRole === "COORDINATOR")
            )
            .map((m) => ({
              id: m.id,
              userId: m.userId,
              memberRole: m.memberRole,
              batchScope: m.batchScope,
            })),
        })),
        teams: demoStore.tournamentTeams.map((t) => ({
          id: t.id,
          tournamentId: t.tournamentId,
          sportName: t.sportName,
          teamName: t.teamName,
          captainUserId: t.captainUserId,
        })),
        matches: demoStore.matches.map((m) => ({
          id: m.id,
          sportName: m.sportName,
          teamA: m.teamA,
          teamB: m.teamB,
          status: m.status,
          scorerUserId: m.scorerUserId,
        })),
        auctionId: auctionState.auction.id,
        auctionOperators: demoStore.auctionOperators.filter(
          (o) => o.auctionId === auctionState.auction.id
        ),
        siteSettings: {
          showAuctionInNav: demoStore.siteSettings.showAuctionInNav,
          showLiveAuctionInNav: demoStore.siteSettings.showLiveAuctionInNav,
        },
      });
    } catch (err) {
      sendServerError(res, "GET /api/admin/roles", err);
    }
  });

  function parseRoleAction(body: unknown): string {
    const obj = (body || {}) as Record<string, unknown>;
    if (obj.revoke === true || obj.revoke === "true") return "REVOKE";
    return String(obj.action || "APPOINT").toUpperCase();
  }

  // POST /api/roles/club-secretary (Sports Secretary / Faculty Advisor only)
  app.post("/api/roles/club-secretary", requireAuth, async (req, res) => {
    try {
      if (!isPlatformAdmin(req.authUser)) {
        return res.status(403).json({
          error: "Only Sports Secretary or Faculty Advisor can appoint or revoke Club Secretaries",
        });
      }
      const userId = Number(req.body?.userId);
      const clubId = Number(req.body?.clubId);
      const action = parseRoleAction(req.body);
      if (!Number.isInteger(userId) || !Number.isInteger(clubId)) {
        return res.status(400).json({ error: "Valid userId and clubId are required" });
      }
      if (action !== "APPOINT" && action !== "REVOKE") {
        return res.status(400).json({ error: "action must be APPOINT or REVOKE" });
      }

      if (useDb() && db) {
        const [targetUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId));
        const [club] = await db
          .select({ id: sportsClubs.id })
          .from(sportsClubs)
          .where(eq(sportsClubs.id, clubId));
        if (!targetUser || !club) {
          return res.status(404).json({ error: "User or club not found" });
        }

        const [existing] = await db
          .select()
          .from(clubMemberships)
          .where(
            and(
              eq(clubMemberships.clubId, clubId),
              eq(clubMemberships.userId, userId)
            )
          );

        if (action === "APPOINT") {
          if (existing) {
            await db
              .update(clubMemberships)
              .set({
                memberRole: "SECRETARY",
                batchScope: "ALL",
                status: "INDUCTED",
              })
              .where(eq(clubMemberships.id, existing.id));
          } else {
            await db.insert(clubMemberships).values({
              clubId,
              userId,
              memberRole: "SECRETARY",
              batchScope: "ALL",
              status: "INDUCTED",
            });
          }
        } else if (existing && existing.memberRole === "SECRETARY") {
          await db
            .update(clubMemberships)
            .set({ memberRole: "MEMBER" })
            .where(eq(clubMemberships.id, existing.id));
        }

        await syncDerivedUserRole(userId);
        return res.json({ ok: true, action, userId, clubId });
      }

      const targetUser = demoStore.users.find((u) => u.id === userId);
      const club = demoStore.clubs.find((c) => c.id === clubId);
      if (!targetUser || !club) {
        return res.status(404).json({ error: "User or club not found" });
      }
      const existing = demoStore.memberships.find(
        (m) => m.clubId === clubId && m.userId === userId
      );
      if (action === "APPOINT") {
        if (existing) {
          existing.memberRole = "SECRETARY";
          existing.batchScope = "ALL";
          existing.status = "INDUCTED";
        } else {
          demoStore.memberships.push({
            id: Math.max(0, ...demoStore.memberships.map((m) => m.id)) + 1,
            clubId,
            userId,
            memberRole: "SECRETARY",
            batchScope: "ALL",
            status: "INDUCTED",
            createdAt: new Date(),
          });
        }
      } else if (existing && existing.memberRole === "SECRETARY") {
        existing.memberRole = "MEMBER";
      }
      await syncDerivedUserRole(userId);
      res.json({ ok: true, action, userId, clubId });
    } catch (err) {
      sendServerError(res, "POST /api/roles/club-secretary", err);
    }
  });

  // POST /api/roles/club-coordinator (Club Secretary of THAT club, or Sports Admin)
  app.post("/api/roles/club-coordinator", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser!;
      const userId = Number(req.body?.userId);
      const clubId = Number(req.body?.clubId);
      const action = parseRoleAction(req.body);
      const batchScope = normalizeBatchCode(String(req.body?.batchScope || "ALL"));

      if (!Number.isInteger(userId) || !Number.isInteger(clubId)) {
        return res.status(400).json({ error: "Valid userId and clubId are required" });
      }
      if (action !== "APPOINT" && action !== "REVOKE") {
        return res.status(400).json({ error: "action must be APPOINT or REVOKE" });
      }
      if (action === "APPOINT" && !VALID_BATCH_SCOPES.has(batchScope)) {
        return res.status(400).json({
          error: "batchScope must be one of 1ST, 2ND, 3RD, 4TH, MTECH, or ALL",
        });
      }

      const canAppoint = await isClubSecretaryFor(actor, clubId);
      if (!canAppoint) {
        return res.status(403).json({
          error:
            "Only this club's Secretary, Sports Secretary, or Faculty Advisor can appoint or revoke Club Coordinators",
        });
      }

      if (useDb() && db) {
        const [targetUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId));
        if (!targetUser) {
          return res.status(404).json({ error: "User not found" });
        }
        const [existing] = await db
          .select()
          .from(clubMemberships)
          .where(
            and(
              eq(clubMemberships.clubId, clubId),
              eq(clubMemberships.userId, userId)
            )
          );

        if (action === "APPOINT") {
          if (existing) {
            await db
              .update(clubMemberships)
              .set({
                memberRole: "COORDINATOR",
                batchScope,
                status: "INDUCTED",
              })
              .where(eq(clubMemberships.id, existing.id));
          } else {
            await db.insert(clubMemberships).values({
              clubId,
              userId,
              memberRole: "COORDINATOR",
              batchScope,
              status: "INDUCTED",
            });
          }
        } else if (existing && existing.memberRole === "COORDINATOR") {
          await db
            .update(clubMemberships)
            .set({ memberRole: "MEMBER" })
            .where(eq(clubMemberships.id, existing.id));
        }

        await syncDerivedUserRole(userId);
        return res.json({ ok: true, action, userId, clubId, batchScope });
      }

      const targetUser = demoStore.users.find((u) => u.id === userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      const existing = demoStore.memberships.find(
        (m) => m.clubId === clubId && m.userId === userId
      );
      if (action === "APPOINT") {
        if (existing) {
          existing.memberRole = "COORDINATOR";
          existing.batchScope = batchScope;
          existing.status = "INDUCTED";
        } else {
          demoStore.memberships.push({
            id: Math.max(0, ...demoStore.memberships.map((m) => m.id)) + 1,
            clubId,
            userId,
            memberRole: "COORDINATOR",
            batchScope,
            status: "INDUCTED",
            createdAt: new Date(),
          });
        }
      } else if (existing && existing.memberRole === "COORDINATOR") {
        existing.memberRole = "MEMBER";
      }
      await syncDerivedUserRole(userId);
      res.json({ ok: true, action, userId, clubId, batchScope });
    } catch (err) {
      sendServerError(res, "POST /api/roles/club-coordinator", err);
    }
  });

  // POST /api/roles/captain (Sports Secretary / Faculty Advisor)
  app.post("/api/roles/captain", requireAuth, async (req, res) => {
    try {
      if (!isPlatformAdmin(req.authUser)) {
        return res.status(403).json({
          error: "Only Sports Secretary or Faculty Advisor can appoint or revoke Team Captains",
        });
      }
      const userId = Number(req.body?.userId);
      const teamId = Number(req.body?.teamId);
      const action = parseRoleAction(req.body);
      if (!Number.isInteger(userId) || !Number.isInteger(teamId)) {
        return res.status(400).json({ error: "Valid userId and teamId are required" });
      }
      if (action !== "APPOINT" && action !== "REVOKE") {
        return res.status(400).json({ error: "action must be APPOINT or REVOKE" });
      }

      if (useDb() && db) {
        const [team] = await db
          .select()
          .from(tournamentTeams)
          .where(eq(tournamentTeams.id, teamId));
        if (!team) return res.status(404).json({ error: "Tournament team not found" });
        const [u] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId));
        if (!u) return res.status(404).json({ error: "User not found" });

        const prevCaptainId = team.captainUserId;
        await db
          .update(tournamentTeams)
          .set({ captainUserId: action === "APPOINT" ? userId : null })
          .where(eq(tournamentTeams.id, teamId));

        await syncDerivedUserRole(userId);
        if (prevCaptainId && prevCaptainId !== userId) {
          await syncDerivedUserRole(prevCaptainId);
        }
        return res.json({ ok: true, action, userId, teamId });
      }

      const team = demoStore.tournamentTeams.find((t) => t.id === teamId);
      if (!team) return res.status(404).json({ error: "Tournament team not found" });
      const u = demoStore.users.find((x) => x.id === userId);
      if (!u) return res.status(404).json({ error: "User not found" });
      const prevCaptainId = team.captainUserId;
      team.captainUserId = action === "APPOINT" ? userId : null;
      await syncDerivedUserRole(userId);
      if (prevCaptainId && prevCaptainId !== userId) {
        await syncDerivedUserRole(prevCaptainId);
      }
      res.json({ ok: true, action, userId, teamId });
    } catch (err) {
      sendServerError(res, "POST /api/roles/captain", err);
    }
  });

  // POST /api/roles/match-scorer (Sports Secretary / Faculty Advisor)
  app.post("/api/roles/match-scorer", requireAuth, async (req, res) => {
    try {
      if (!isPlatformAdmin(req.authUser)) {
        return res.status(403).json({
          error: "Only Sports Secretary or Faculty Advisor can appoint or revoke Match Scorers",
        });
      }
      const userId = Number(req.body?.userId);
      const matchId = req.body?.matchId ? Number(req.body.matchId) : null;
      const action = parseRoleAction(req.body);
      if (!Number.isInteger(userId)) {
        return res.status(400).json({ error: "Valid userId is required" });
      }
      if (action !== "APPOINT" && action !== "REVOKE") {
        return res.status(400).json({ error: "action must be APPOINT or REVOKE" });
      }

      if (useDb() && db) {
        const [u] = await db.select().from(users).where(eq(users.id, userId));
        if (!u) return res.status(404).json({ error: "User not found" });

        if (
          action === "APPOINT" &&
          u.role !== "SPORTS_SECRETARY" &&
          u.role !== "FACULTY_ADVISOR"
        ) {
          await db
            .update(users)
            .set({ role: "MATCH_SCORER" })
            .where(eq(users.id, userId));
        } else if (action === "REVOKE" && u.role === "MATCH_SCORER") {
          await db
            .update(users)
            .set({ role: "STUDENT" })
            .where(eq(users.id, userId));
          await syncDerivedUserRole(userId);
        }

        if (matchId && Number.isInteger(matchId)) {
          await db
            .update(tournamentMatches)
            .set({ scorerUserId: action === "APPOINT" ? userId : null })
            .where(eq(tournamentMatches.id, matchId));
        }

        return res.json({ ok: true, action, userId, matchId });
      }

      const u = demoStore.users.find((x) => x.id === userId);
      if (!u) return res.status(404).json({ error: "User not found" });

      if (
        action === "APPOINT" &&
        u.role !== "SPORTS_SECRETARY" &&
        u.role !== "FACULTY_ADVISOR"
      ) {
        u.role = "MATCH_SCORER";
      } else if (action === "REVOKE" && u.role === "MATCH_SCORER") {
        u.role = "STUDENT";
        await syncDerivedUserRole(userId);
      }

      if (matchId && Number.isInteger(matchId)) {
        const m = demoStore.matches.find((x) => x.id === matchId);
        if (m) m.scorerUserId = action === "APPOINT" ? userId : null;
      }

      res.json({ ok: true, action, userId, matchId });
    } catch (err) {
      sendServerError(res, "POST /api/roles/match-scorer", err);
    }
  });

  // POST /api/roles/auction-operator (event-scoped AUCTION_OPERATOR assignment)
  app.post("/api/roles/auction-operator", requireAuth, async (req, res) => {
    try {
      if (!isPlatformAdmin(req.authUser)) {
        return res.status(403).json({
          error:
            "Only Sports Secretary or Faculty Advisor can appoint or revoke Auction Operators",
        });
      }
      const userId = Number(req.body?.userId);
      const auctionId = Number(req.body?.auctionId || auctionState.auction.id);
      const action = parseRoleAction(req.body);
      if (!Number.isInteger(userId) || !Number.isInteger(auctionId)) {
        return res.status(400).json({ error: "Valid userId and auctionId are required" });
      }
      if (action !== "APPOINT" && action !== "REVOKE") {
        return res.status(400).json({ error: "action must be APPOINT or REVOKE" });
      }

      if (useDb() && db) {
        const [u] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId));
        if (!u) return res.status(404).json({ error: "User not found" });

        if (action === "APPOINT") {
          await db
            .insert(auctionOperators)
            .values({
              auctionId,
              userId,
              assignedByUserId: req.authUser!.id,
            })
            .onConflictDoNothing();
        } else {
          await db
            .delete(auctionOperators)
            .where(
              and(
                eq(auctionOperators.auctionId, auctionId),
                eq(auctionOperators.userId, userId)
              )
            );
        }
        await syncDerivedUserRole(userId);
        return res.json({ ok: true, action, userId, auctionId });
      }

      const u = demoStore.users.find((x) => x.id === userId);
      if (!u) return res.status(404).json({ error: "User not found" });

      if (action === "APPOINT") {
        const exists = demoStore.auctionOperators.some(
          (o) => o.auctionId === auctionId && o.userId === userId
        );
        if (!exists) {
          demoStore.auctionOperators.push({
            id: Math.max(0, ...demoStore.auctionOperators.map((o) => o.id)) + 1,
            auctionId,
            userId,
            assignedByUserId: req.authUser!.id,
            createdAt: new Date(),
          });
        }
      } else {
        demoStore.auctionOperators = demoStore.auctionOperators.filter(
          (o) => !(o.auctionId === auctionId && o.userId === userId)
        );
      }
      await syncDerivedUserRole(userId);
      res.json({ ok: true, action, userId, auctionId });
    } catch (err) {
      sendServerError(res, "POST /api/roles/auction-operator", err);
    }
  });

  // =========================================================================
  // NOTICES & URGENT TOP BANNER CRUD (<= 5 WORDS ENFORCED SERVER-SIDE)
  // =========================================================================

  app.post("/api/notices", requireAuth, async (req, res) => {
    try {
      if (!isPlatformAdmin(req.authUser)) {
        return res.status(403).json({
          error: "Only Sports Secretary or Faculty Advisor can publish notices",
        });
      }
      const title = String(req.body?.title || "").trim();
      const summary = String(req.body?.summary || "").trim();
      const category = String(req.body?.category || "GENERAL").trim().toUpperCase();
      const isUrgentBanner = Boolean(req.body?.isUrgentBanner);

      if (!title || !summary) {
        return res.status(400).json({ error: "title and summary are required" });
      }
      if (isUrgentBanner && countWords(title) > 5) {
        return res.status(400).json({
          error: "Urgent top banner title must be 5 words or fewer",
        });
      }

      if (useDb() && db) {
        const created = await db.transaction(async (tx) => {
          if (isUrgentBanner) {
            await tx.update(notices).set({ isUrgentBanner: false });
          }
          const [row] = await tx
            .insert(notices)
            .values({
              title,
              summary,
              category,
              isUrgentBanner,
            })
            .returning();
          return row;
        });
        await broadcastNavUpdate();
        return res.status(201).json({ notice: created });
      }

      if (isUrgentBanner) {
        for (const n of demoStore.notices) n.isUrgentBanner = false;
      }
      const created = {
        id: Math.max(0, ...demoStore.notices.map((n) => n.id)) + 1,
        title,
        summary,
        category,
        isUrgentBanner,
        createdAt: new Date(),
      };
      demoStore.notices.unshift(created);
      await broadcastNavUpdate();
      res.status(201).json({ notice: created });
    } catch (err) {
      sendServerError(res, "POST /api/notices", err);
    }
  });

  app.patch("/api/notices/:id", requireAuth, async (req, res) => {
    try {
      if (!isPlatformAdmin(req.authUser)) {
        return res.status(403).json({
          error: "Only Sports Secretary or Faculty Advisor can update notices",
        });
      }
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "Invalid notice id" });
      }

      if (useDb() && db) {
        const [existing] = await db
          .select()
          .from(notices)
          .where(eq(notices.id, id));
        if (!existing) return res.status(404).json({ error: "Notice not found" });

        const nextTitle =
          typeof req.body?.title === "string" && req.body.title.trim()
            ? req.body.title.trim()
            : existing.title;
        const nextSummary =
          typeof req.body?.summary === "string" && req.body.summary.trim()
            ? req.body.summary.trim()
            : existing.summary;
        const nextCategory =
          typeof req.body?.category === "string" && req.body.category.trim()
            ? req.body.category.trim().toUpperCase()
            : existing.category;
        const nextUrgent =
          req.body?.isUrgentBanner !== undefined
            ? Boolean(req.body.isUrgentBanner)
            : existing.isUrgentBanner;

        if (nextUrgent && countWords(nextTitle) > 5) {
          return res.status(400).json({
            error: "Urgent top banner title must be 5 words or fewer",
          });
        }

        const updated = await db.transaction(async (tx) => {
          if (nextUrgent) {
            await tx.update(notices).set({ isUrgentBanner: false });
          }
          const [row] = await tx
            .update(notices)
            .set({
              title: nextTitle,
              summary: nextSummary,
              category: nextCategory,
              isUrgentBanner: nextUrgent,
            })
            .where(eq(notices.id, id))
            .returning();
          return row;
        });
        await broadcastNavUpdate();
        return res.json({ notice: updated });
      }

      const existing = demoStore.notices.find((n) => n.id === id);
      if (!existing) return res.status(404).json({ error: "Notice not found" });

      const nextTitle =
        typeof req.body?.title === "string" && req.body.title.trim()
          ? req.body.title.trim()
          : existing.title;
      const nextUrgent =
        req.body?.isUrgentBanner !== undefined
          ? Boolean(req.body.isUrgentBanner)
          : existing.isUrgentBanner;

      if (nextUrgent && countWords(nextTitle) > 5) {
        return res.status(400).json({
          error: "Urgent top banner title must be 5 words or fewer",
        });
      }

      if (nextUrgent) {
        for (const n of demoStore.notices) n.isUrgentBanner = false;
      }
      existing.title = nextTitle;
      if (typeof req.body?.summary === "string" && req.body.summary.trim()) {
        existing.summary = req.body.summary.trim();
      }
      if (typeof req.body?.category === "string" && req.body.category.trim()) {
        existing.category = req.body.category.trim().toUpperCase();
      }
      existing.isUrgentBanner = nextUrgent;
      await broadcastNavUpdate();
      res.json({ notice: existing });
    } catch (err) {
      sendServerError(res, "PATCH /api/notices/:id", err);
    }
  });

  app.delete("/api/notices/:id", requireAuth, async (req, res) => {
    try {
      if (!isPlatformAdmin(req.authUser)) {
        return res.status(403).json({
          error: "Only Sports Secretary or Faculty Advisor can delete notices",
        });
      }
      const id = Number(req.params.id);
      if (useDb() && db) {
        await db.delete(notices).where(eq(notices.id, id));
        await broadcastNavUpdate();
        return res.json({ deleted: true, id });
      }
      demoStore.notices = demoStore.notices.filter((n) => n.id !== id);
      await broadcastNavUpdate();
      res.json({ deleted: true, id });
    } catch (err) {
      sendServerError(res, "DELETE /api/notices/:id", err);
    }
  });

  // =========================================================================
  // PERSISTED NAV VISIBILITY TOGGLES (showAuctionInNav / showLiveAuctionInNav)
  // =========================================================================

  app.patch("/api/settings/nav", requireAuth, async (req, res) => {
    try {
      if (!isPlatformAdmin(req.authUser)) {
        return res.status(403).json({
          error:
            "Only Sports Secretary or Faculty Advisor can update navigation settings",
        });
      }

      const showAuctionInNav =
        req.body?.showAuctionInNav !== undefined
          ? Boolean(req.body.showAuctionInNav)
          : undefined;
      const showLiveAuctionInNav =
        req.body?.showLiveAuctionInNav !== undefined
          ? Boolean(req.body.showLiveAuctionInNav)
          : undefined;

      if (useDb() && db) {
        const [existing] = await db
          .select()
          .from(siteSettings)
          .where(eq(siteSettings.id, 1));
        const nextShowAuction =
          showAuctionInNav ?? existing?.showAuctionInNav ?? true;
        const nextShowLive =
          showLiveAuctionInNav ?? existing?.showLiveAuctionInNav ?? true;

        if (existing) {
          await db
            .update(siteSettings)
            .set({
              showAuctionInNav: nextShowAuction,
              showLiveAuctionInNav: nextShowLive,
              updatedAt: new Date(),
            })
            .where(eq(siteSettings.id, 1));
        } else {
          await db.insert(siteSettings).values({
            id: 1,
            showAuctionInNav: nextShowAuction,
            showLiveAuctionInNav: nextShowLive,
            updatedAt: new Date(),
          });
        }
        demoStore.siteSettings = {
          showAuctionInNav: nextShowAuction,
          showLiveAuctionInNav: nextShowLive,
          updatedAt: new Date().toISOString(),
        };
        await broadcastNavUpdate();
        return res.json({ siteSettings: demoStore.siteSettings });
      }

      if (showAuctionInNav !== undefined) {
        demoStore.siteSettings.showAuctionInNav = showAuctionInNav;
      }
      if (showLiveAuctionInNav !== undefined) {
        demoStore.siteSettings.showLiveAuctionInNav = showLiveAuctionInNav;
      }
      demoStore.siteSettings.updatedAt = new Date().toISOString();
      await broadcastNavUpdate();
      res.json({ siteSettings: demoStore.siteSettings });
    } catch (err) {
      sendServerError(res, "PATCH /api/settings/nav", err);
    }
  });
}

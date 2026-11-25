import type { Express } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  auctionRegistrations,
  notifications,
  teamRosterMembers,
  teamSubmissions,
  tournamentMatches,
  tournaments,
  tournamentTeams,
  users,
} from "../db/schema.js";
import {
  auctionState,
  demoStore,
  type TeamSubmissionPlayer,
  type TeamSubmissionRecord,
} from "./demoStore.js";
import { requireAuth, type AuthUserRecord } from "./auth.js";
import { sendServerError } from "./security.js";

export interface TournamentRouteDeps {
  useDb: () => boolean;
}

function isPlatformAdmin(actor: AuthUserRecord | null | undefined): boolean {
  return Boolean(
    actor &&
      (actor.role === "SPORTS_SECRETARY" || actor.role === "FACULTY_ADVISOR")
  );
}

function canScoreSpecificMatch(
  actor: AuthUserRecord | null | undefined,
  scorerUserId: number | null | undefined
): boolean {
  if (!actor) return false;
  if (isPlatformAdmin(actor)) return true;
  return Boolean(scorerUserId && actor.id === scorerUserId);
}

function parseNumericScore(raw: string): number {
  const m = String(raw || "").match(/^\s*(\d+)/);
  return m ? Number(m[1]) : 0;
}

function computePointsDelta(
  sportName: string,
  scoreA: string,
  scoreB: string
): {
  aWon: boolean;
  bWon: boolean;
  isDraw: boolean;
  ptsWin: number;
  ptsDraw: number;
} {
  const numA = parseNumericScore(scoreA);
  const numB = parseNumericScore(scoreB);
  const lower = sportName.toLowerCase();
  const isFootball = lower.includes("football");
  const ptsWin = isFootball ? 3 : 2;
  const ptsDraw = 1;
  if (numA > numB) return { aWon: true, bWon: false, isDraw: false, ptsWin, ptsDraw };
  if (numB > numA) return { aWon: false, bWon: true, isDraw: false, ptsWin, ptsDraw };
  return { aWon: false, bWon: false, isDraw: true, ptsWin, ptsDraw };
}

export function registerTournamentRoutes(
  app: Express,
  deps: TournamentRouteDeps
) {
  const { useDb } = deps;

  // Overview tournaments
  app.get("/api/tournaments/overview", async (_req, res) => {
    try {
      if (useDb() && db) {
        const all = await db
          .select()
          .from(tournaments)
          .orderBy(desc(tournaments.year), desc(tournaments.id));
        const current = all.filter((t) => t.status === "CURRENT");
        const upcoming = all.filter((t) => t.status === "UPCOMING");
        const archived = all.filter((t) => t.status === "ARCHIVED");
        return res.json({ current, upcoming, archived });
      }
      const all = [...demoStore.tournaments].sort(
        (a, b) => b.year - a.year || b.id - a.id
      );
      res.json({
        current: all.filter((t) => t.status === "CURRENT"),
        upcoming: all.filter((t) => t.status === "UPCOMING"),
        archived: all.filter((t) => t.status === "ARCHIVED"),
      });
    } catch (err) {
      sendServerError(res, "GET /api/tournaments/overview", err);
    }
  });

  // Create tournament (Sports Secretary / Faculty Advisor only)
  app.post("/api/tournaments", requireAuth, async (req, res) => {
    try {
      if (!isPlatformAdmin(req.authUser)) {
        return res.status(403).json({
          error: "Only Sports Secretary or Faculty Advisor can create tournaments",
        });
      }
      const {
        name,
        year,
        semester,
        tournamentType,
        competitionFormat,
        dateRange,
        structureNotes,
        sportsIncluded,
        status,
      } = req.body || {};

      if (!name || !year || !semester || !tournamentType || !competitionFormat) {
        return res.status(400).json({ error: "Missing required tournament fields" });
      }

      const safeStatus = ["UPCOMING", "CURRENT", "ARCHIVED"].includes(status)
        ? status
        : "UPCOMING";

      if (useDb() && db) {
        const [created] = await db
          .insert(tournaments)
          .values({
            name: String(name).trim(),
            year: Number(year),
            semester: String(semester),
            tournamentType: String(tournamentType),
            competitionFormat: String(competitionFormat),
            dateRange: String(dateRange || "TBD").trim(),
            structureNotes: String(structureNotes || "").trim(),
            sportsIncluded: String(sportsIncluded || "Cricket,Football").trim(),
            status: safeStatus,
          })
          .returning();
        return res.status(201).json({ tournament: created });
      }

      const created = {
        id: Math.max(0, ...demoStore.tournaments.map((t) => t.id)) + 1,
        name: String(name).trim(),
        year: Number(year),
        semester: String(semester),
        tournamentType: String(tournamentType),
        competitionFormat: String(competitionFormat),
        dateRange: String(dateRange || "TBD").trim(),
        structureNotes: String(structureNotes || "").trim(),
        sportsIncluded: String(sportsIncluded || "Cricket,Football").trim(),
        status: safeStatus,
        createdAt: new Date(),
      };
      demoStore.tournaments.push(created);
      res.status(201).json({ tournament: created });
    } catch (err) {
      sendServerError(res, "POST /api/tournaments", err);
    }
  });

  // Archive tournament (Sports Secretary / Faculty Advisor)
  app.post("/api/tournaments/:id/archive", requireAuth, async (req, res) => {
    try {
      if (!isPlatformAdmin(req.authUser)) {
        return res.status(403).json({
          error: "Only Sports Secretary or Faculty Advisor can archive tournaments",
        });
      }
      const id = Number(req.params.id);
      if (useDb() && db) {
        const [existing] = await db
          .select()
          .from(tournaments)
          .where(eq(tournaments.id, id));
        if (!existing) {
          return res.status(404).json({ error: "Tournament not found" });
        }
        const [updated] = await db
          .update(tournaments)
          .set({ status: "ARCHIVED" })
          .where(eq(tournaments.id, id))
          .returning();
        return res.json({ tournament: updated });
      }
      const existing = demoStore.tournaments.find((t) => t.id === id);
      if (!existing) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      existing.status = "ARCHIVED";
      res.json({ tournament: existing });
    } catch (err) {
      sendServerError(res, "POST /api/tournaments/:id/archive", err);
    }
  });

  // Archive by year
  app.get("/api/tournaments/archive/:year", async (req, res) => {
    try {
      const year = Number(req.params.year);
      if (!Number.isInteger(year)) {
        return res.status(400).json({ error: "Invalid archive year" });
      }

      if (useDb() && db) {
        const yearTournaments = await db
          .select()
          .from(tournaments)
          .where(and(eq(tournaments.year, year), eq(tournaments.status, "ARCHIVED")));
        const results = [];
        for (const t of yearTournaments) {
          const teams = await db
            .select()
            .from(tournamentTeams)
            .where(eq(tournamentTeams.tournamentId, t.id));
          const teamIds = teams.map((tm) => tm.id);
          const allRoster = await db.select().from(teamRosterMembers);
          const teamsWithRoster = teams.map((tm) => ({
            ...tm,
            roster: allRoster.filter(
              (r) => r.teamId === tm.id && teamIds.includes(r.teamId)
            ),
          }));
          const matches = await db
            .select()
            .from(tournamentMatches)
            .where(eq(tournamentMatches.tournamentId, t.id))
            .orderBy(desc(tournamentMatches.matchOrder), desc(tournamentMatches.id));
          results.push({ tournament: t, teams: teamsWithRoster, matches });
        }
        return res.json({ year, archives: results });
      }

      const yearTournaments = demoStore.tournaments.filter(
        (t) => t.year === year && t.status === "ARCHIVED"
      );
      const archives = yearTournaments.map((t) => {
        const teams = demoStore.tournamentTeams
          .filter((tm) => tm.tournamentId === t.id)
          .map((tm) => ({
            ...tm,
            roster: demoStore.rosterMembers.filter((r) => r.teamId === tm.id),
          }));
        const matches = demoStore.matches
          .filter((m) => m.tournamentId === t.id)
          .sort((a, b) => b.matchOrder - a.matchOrder || b.id - a.id);
        return { tournament: t, teams, matches };
      });
      res.json({ year, archives });
    } catch (err) {
      sendServerError(res, "GET /api/tournaments/archive/:year", err);
    }
  });

  // Flat archive endpoint used by ArchivePage.tsx
  app.get("/api/archive", async (req, res) => {
    try {
      const year = Number(req.query.year);
      if (!Number.isInteger(year)) {
        return res.status(400).json({ error: "Invalid archive year" });
      }
      if (useDb() && db) {
        const yearTournaments = await db
          .select()
          .from(tournaments)
          .where(and(eq(tournaments.year, year), eq(tournaments.status, "ARCHIVED")));
        const tIds = new Set(yearTournaments.map((t) => t.id));
        const allTeams = (await db.select().from(tournamentTeams)).filter((tm) =>
          tIds.has(tm.tournamentId)
        );
        const tmIds = new Set(allTeams.map((tm) => tm.id));
        const roster = (await db.select().from(teamRosterMembers)).filter((r) =>
          tmIds.has(r.teamId)
        );
        const matches = (
          await db
            .select()
            .from(tournamentMatches)
            .orderBy(desc(tournamentMatches.matchOrder), desc(tournamentMatches.id))
        ).filter((m) => tIds.has(m.tournamentId));
        return res.json({
          year,
          tournaments: yearTournaments,
          teams: allTeams,
          roster,
          matches,
        });
      }

      const yearTournaments = demoStore.tournaments.filter(
        (t) => t.year === year && t.status === "ARCHIVED"
      );
      const tIds = new Set(yearTournaments.map((t) => t.id));
      const teams = demoStore.tournamentTeams.filter((tm) =>
        tIds.has(tm.tournamentId)
      );
      const tmIds = new Set(teams.map((tm) => tm.id));
      const roster = demoStore.rosterMembers.filter((r) => tmIds.has(r.teamId));
      const matches = demoStore.matches
        .filter((m) => tIds.has(m.tournamentId))
        .sort((a, b) => b.matchOrder - a.matchOrder || b.id - a.id);
      res.json({ year, tournaments: yearTournaments, teams, roster, matches });
    } catch (err) {
      sendServerError(res, "GET /api/archive", err);
    }
  });

  // Current tournament with standings, rosters, matches, and team submissions
  app.get("/api/tournaments/current", async (_req, res) => {
    try {
      if (useDb() && db) {
        const [current] = await db
          .select()
          .from(tournaments)
          .where(eq(tournaments.status, "CURRENT"))
          .orderBy(desc(tournaments.id))
          .limit(1);
        if (!current) {
          return res.json({
            tournament: null,
            standings: [],
            matches: [],
            teamSubmissions: [],
          });
        }
        const teams = await db
          .select()
          .from(tournamentTeams)
          .where(eq(tournamentTeams.tournamentId, current.id))
          .orderBy(desc(tournamentTeams.points), desc(tournamentTeams.won));
        const allRoster = await db.select().from(teamRosterMembers);
        const standings = teams.map((tm) => ({
          ...tm,
          roster: allRoster.filter((r) => r.teamId === tm.id),
        }));
        const matches = await db
          .select()
          .from(tournamentMatches)
          .where(eq(tournamentMatches.tournamentId, current.id))
          .orderBy(desc(tournamentMatches.matchOrder), desc(tournamentMatches.id));

        const subRows = await db
          .select()
          .from(teamSubmissions)
          .where(eq(teamSubmissions.tournamentId, current.id))
          .orderBy(desc(teamSubmissions.id));
        const allUsers = await db.select().from(users);
        const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

        const submissionsFormatted = subRows.map((s) => ({
          id: s.id,
          tournamentId: s.tournamentId,
          teamId: s.teamId,
          sportName: s.sportName,
          teamName: s.teamName,
          captainUserId: s.captainUserId,
          captainName: userMap.get(s.captainUserId) || "Captain",
          status: s.status,
          players: (() => {
            try {
              return JSON.parse(s.playersJson);
            } catch {
              return [];
            }
          })(),
          reviewerNotes: s.reviewerNotes,
          updatedAt: s.updatedAt.toISOString(),
          createdAt: s.createdAt.toISOString(),
        }));

        return res.json({
          tournament: current,
          standings,
          matches,
          teamSubmissions: submissionsFormatted,
        });
      }

      const current =
        demoStore.tournaments.find((t) => t.status === "CURRENT") || null;
      if (!current) {
        return res.json({
          tournament: null,
          standings: [],
          matches: [],
          teamSubmissions: [],
        });
      }
      const standings = demoStore.tournamentTeams
        .filter((tm) => tm.tournamentId === current.id)
        .sort((a, b) => b.points - a.points || b.won - a.won)
        .map((tm) => ({
          ...tm,
          roster: demoStore.rosterMembers.filter((r) => r.teamId === tm.id),
        }));
      const matches = demoStore.matches
        .filter((m) => m.tournamentId === current.id)
        .sort((a, b) => b.matchOrder - a.matchOrder || b.id - a.id);

      const userMap = new Map(demoStore.users.map((u) => [u.id, u.name]));
      const submissions = demoStore.teamSubmissions
        .filter((s) => s.tournamentId === current.id)
        .map((s) => ({
          ...s,
          captainName: userMap.get(s.captainUserId) || "Captain",
        }));

      res.json({
        tournament: current,
        standings,
        matches,
        teamSubmissions: submissions,
      });
    } catch (err) {
      sendServerError(res, "GET /api/tournaments/current", err);
    }
  });

  // Live & upcoming matches (strictly separated)
  app.get("/api/matches/live-and-upcoming", async (_req, res) => {
    try {
      if (useDb() && db) {
        const all = await db
          .select()
          .from(tournamentMatches)
          .orderBy(desc(tournamentMatches.matchOrder), desc(tournamentMatches.id));
        const live = all.filter((m) => m.status === "LIVE");
        const upcoming = all.filter((m) => m.status === "UPCOMING");
        return res.json({ hasLive: live.length > 0, live, upcoming });
      }
      const all = [...demoStore.matches].sort(
        (a, b) => b.matchOrder - a.matchOrder || b.id - a.id
      );
      const live = all.filter((m) => m.status === "LIVE");
      const upcoming = all.filter((m) => m.status === "UPCOMING");
      res.json({ hasLive: live.length > 0, live, upcoming });
    } catch (err) {
      sendServerError(res, "GET /api/matches/live-and-upcoming", err);
    }
  });

  // Create fixture (Sports Secretary / Faculty Advisor only)
  app.post("/api/matches", requireAuth, async (req, res) => {
    try {
      if (!isPlatformAdmin(req.authUser)) {
        return res.status(403).json({
          error: "Only Sports Secretary or Faculty Advisor can schedule matches",
        });
      }
      const {
        tournamentId,
        sportName,
        stage,
        teamA,
        teamB,
        scheduledTime,
        venue,
        scorerUserId,
      } = req.body || {};

      if (!tournamentId || !sportName || !teamA || !teamB) {
        return res.status(400).json({ error: "Missing required match fields" });
      }

      const parsedDate = scheduledTime ? new Date(String(scheduledTime)) : null;
      const isoTime =
        parsedDate && !Number.isNaN(parsedDate.getTime())
          ? parsedDate.toISOString()
          : new Date(Date.now() + 3600_000).toISOString();

      const assignedScorerId = scorerUserId ? Number(scorerUserId) : 5;

      if (useDb() && db) {
        const [created] = await db
          .insert(tournamentMatches)
          .values({
            tournamentId: Number(tournamentId),
            sportName: String(sportName).trim(),
            stage: String(stage || "Group Match").trim(),
            matchOrder: 5,
            teamA: String(teamA).trim(),
            teamB: String(teamB).trim(),
            scoreA: "0",
            scoreB: "0",
            status: "UPCOMING",
            scheduledTime: isoTime,
            scheduledAt: new Date(isoTime),
            venue: String(venue || "Main Ground").trim(),
            resultSummary: "Scheduled",
            detailedBreakdown: "",
            scorerUserId: assignedScorerId,
          })
          .returning();
        return res.status(201).json({ match: created });
      }

      const created = {
        id: Math.max(0, ...demoStore.matches.map((m) => m.id)) + 1,
        tournamentId: Number(tournamentId),
        sportName: String(sportName).trim(),
        stage: String(stage || "Group Match").trim(),
        matchOrder: 5,
        teamA: String(teamA).trim(),
        teamB: String(teamB).trim(),
        scoreA: "0",
        scoreB: "0",
        status: "UPCOMING",
        scheduledTime: isoTime,
        scheduledAt: isoTime,
        venue: String(venue || "Main Ground").trim(),
        resultSummary: "Scheduled",
        detailedBreakdown: "",
        scoringEventsJson: null,
        scoringStateJson: null,
        lineupAJson: null,
        lineupBJson: null,
        scorerUserId: assignedScorerId,
      };
      demoStore.matches.push(created);
      res.status(201).json({ match: created });
    } catch (err) {
      sendServerError(res, "POST /api/matches", err);
    }
  });

  // Explicit Fixture Go-Live endpoint (UPCOMING -> LIVE)
  app.post("/api/matches/:id/go-live", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (useDb() && db) {
        const [match] = await db
          .select()
          .from(tournamentMatches)
          .where(eq(tournamentMatches.id, id));
        if (!match) return res.status(404).json({ error: "Match not found" });
        if (!canScoreSpecificMatch(req.authUser, match.scorerUserId)) {
          return res.status(403).json({
            error: "Only the assigned Match Scorer or Sports Admin can start this match",
          });
        }
        const [updated] = await db
          .update(tournamentMatches)
          .set({
            status: "LIVE",
            resultSummary:
              match.resultSummary === "Scheduled"
                ? "Live — Match Underway"
                : match.resultSummary,
          })
          .where(eq(tournamentMatches.id, id))
          .returning();
        return res.json({ match: updated });
      }

      const match = demoStore.matches.find((m) => m.id === id);
      if (!match) return res.status(404).json({ error: "Match not found" });
      if (!canScoreSpecificMatch(req.authUser, match.scorerUserId)) {
        return res.status(403).json({
          error: "Only the assigned Match Scorer or Sports Admin can start this match",
        });
      }
      match.status = "LIVE";
      if (match.resultSummary === "Scheduled") {
        match.resultSummary = "Live — Match Underway";
      }
      res.json({ match });
    } catch (err) {
      sendServerError(res, "POST /api/matches/:id/go-live", err);
    }
  });

  // Update match score (enforces match.scorerUserId assignment + updates standings on COMPLETED inside same transaction!)
  app.patch("/api/matches/:id/score", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { scoreA, scoreB, status, resultSummary, detailedBreakdown } =
        req.body || {};

      if (useDb() && db) {
        const [match] = await db
          .select()
          .from(tournamentMatches)
          .where(eq(tournamentMatches.id, id));
        if (!match) return res.status(404).json({ error: "Match not found" });
        if (!canScoreSpecificMatch(req.authUser, match.scorerUserId)) {
          return res.status(403).json({
            error:
              "Only the assigned Match Scorer (or Sports Secretary / Faculty Advisor) can score this match",
          });
        }

        const nextScoreA = scoreA !== undefined ? String(scoreA) : match.scoreA;
        const nextScoreB = scoreB !== undefined ? String(scoreB) : match.scoreB;
        const nextStatus =
          status && ["LIVE", "UPCOMING", "COMPLETED"].includes(status)
            ? String(status)
            : match.status;
        const transitionToCompleted =
          match.status !== "COMPLETED" && nextStatus === "COMPLETED";

        const updatedMatch = await db.transaction(async (tx) => {
          const [row] = await tx
            .update(tournamentMatches)
            .set({
              scoreA: nextScoreA,
              scoreB: nextScoreB,
              status: nextStatus,
              resultSummary:
                resultSummary !== undefined
                  ? String(resultSummary)
                  : match.resultSummary,
              detailedBreakdown:
                detailedBreakdown !== undefined
                  ? String(detailedBreakdown)
                  : match.detailedBreakdown,
            })
            .where(eq(tournamentMatches.id, id))
            .returning();

          if (transitionToCompleted) {
            const delta = computePointsDelta(
              match.sportName,
              nextScoreA,
              nextScoreB
            );
            const teams = await tx
              .select()
              .from(tournamentTeams)
              .where(
                and(
                  eq(tournamentTeams.tournamentId, match.tournamentId),
                  eq(tournamentTeams.sportName, match.sportName)
                )
              );
            const teamARow = teams.find(
              (t) => t.teamName.toLowerCase() === match.teamA.toLowerCase()
            );
            const teamBRow = teams.find(
              (t) => t.teamName.toLowerCase() === match.teamB.toLowerCase()
            );
            if (teamARow) {
              await tx
                .update(tournamentTeams)
                .set({
                  played: teamARow.played + 1,
                  won: teamARow.won + (delta.aWon ? 1 : 0),
                  lost: teamARow.lost + (delta.bWon ? 1 : 0),
                  drawn: teamARow.drawn + (delta.isDraw ? 1 : 0),
                  points:
                    teamARow.points +
                    (delta.aWon ? delta.ptsWin : delta.isDraw ? delta.ptsDraw : 0),
                })
                .where(eq(tournamentTeams.id, teamARow.id));
            }
            if (teamBRow) {
              await tx
                .update(tournamentTeams)
                .set({
                  played: teamBRow.played + 1,
                  won: teamBRow.won + (delta.bWon ? 1 : 0),
                  lost: teamBRow.lost + (delta.aWon ? 1 : 0),
                  drawn: teamBRow.drawn + (delta.isDraw ? 1 : 0),
                  points:
                    teamBRow.points +
                    (delta.bWon ? delta.ptsWin : delta.isDraw ? delta.ptsDraw : 0),
                })
                .where(eq(tournamentTeams.id, teamBRow.id));
            }
          }
          return row;
        });

        return res.json({ match: updatedMatch });
      }

      const match = demoStore.matches.find((m) => m.id === id);
      if (!match) return res.status(404).json({ error: "Match not found" });
      if (!canScoreSpecificMatch(req.authUser, match.scorerUserId)) {
        return res.status(403).json({
          error:
            "Only the assigned Match Scorer (or Sports Secretary / Faculty Advisor) can score this match",
        });
      }

      const prevStatus = match.status;
      if (scoreA !== undefined) match.scoreA = String(scoreA);
      if (scoreB !== undefined) match.scoreB = String(scoreB);
      if (status && ["LIVE", "UPCOMING", "COMPLETED"].includes(status)) {
        match.status = String(status);
      }
      if (resultSummary !== undefined) match.resultSummary = String(resultSummary);
      if (detailedBreakdown !== undefined) {
        match.detailedBreakdown = String(detailedBreakdown);
      }

      if (prevStatus !== "COMPLETED" && match.status === "COMPLETED") {
        const delta = computePointsDelta(
          match.sportName,
          match.scoreA,
          match.scoreB
        );
        const teamA = demoStore.tournamentTeams.find(
          (t) =>
            t.tournamentId === match.tournamentId &&
            t.sportName.toLowerCase() === match.sportName.toLowerCase() &&
            t.teamName.toLowerCase() === match.teamA.toLowerCase()
        );
        const teamB = demoStore.tournamentTeams.find(
          (t) =>
            t.tournamentId === match.tournamentId &&
            t.sportName.toLowerCase() === match.sportName.toLowerCase() &&
            t.teamName.toLowerCase() === match.teamB.toLowerCase()
        );
        if (teamA) {
          teamA.played += 1;
          teamA.won += delta.aWon ? 1 : 0;
          teamA.lost += delta.bWon ? 1 : 0;
          teamA.drawn += delta.isDraw ? 1 : 0;
          teamA.points += delta.aWon
            ? delta.ptsWin
            : delta.isDraw
              ? delta.ptsDraw
              : 0;
        }
        if (teamB) {
          teamB.played += 1;
          teamB.won += delta.bWon ? 1 : 0;
          teamB.lost += delta.aWon ? 1 : 0;
          teamB.drawn += delta.isDraw ? 1 : 0;
          teamB.points += delta.bWon
            ? delta.ptsWin
            : delta.isDraw
              ? delta.ptsDraw
              : 0;
        }
      }

      res.json({ match });
    } catch (err) {
      sendServerError(res, "PATCH /api/matches/:id/score", err);
    }
  });

  // Helper to resolve real match rosters from approved team submissions, teamRosterMembers, or auction sold squads
  async function resolveRealRosterForMatch(match: {
    tournamentId: number;
    sportName: string;
    teamA: string;
    teamB: string;
  }) {
    const buildTeamPlayers = async (teamName: string, side: "A" | "B") => {
      const players: Array<{
        id: string;
        userId?: number | null;
        name: string;
        number?: string;
        role?: string;
        side: "A" | "B";
      }> = [];

      if (useDb() && db) {
        const subs = await db
          .select()
          .from(teamSubmissions)
          .where(
            and(
              eq(teamSubmissions.tournamentId, match.tournamentId),
              eq(teamSubmissions.sportName, match.sportName)
            )
          );
        const approvedSub = subs.find(
          (s) =>
            s.teamName.toLowerCase() === teamName.toLowerCase() &&
            (s.status === "APPROVED" || s.status === "LOCKED")
        );
        if (approvedSub) {
          try {
            const list = JSON.parse(
              approvedSub.playersJson
            ) as TeamSubmissionPlayer[];
            list.forEach((p, idx) => {
              players.push({
                id: p.userId ? `u-${p.userId}` : `${side.toLowerCase()}-sub-${idx + 1}`,
                userId: p.userId ?? null,
                name: p.name,
                number: p.jersey || String(idx + 1),
                role: p.role,
                side,
              });
            });
          } catch {
            // fallback below
          }
        }
        if (players.length === 0) {
          const teams = await db
            .select()
            .from(tournamentTeams)
            .where(eq(tournamentTeams.tournamentId, match.tournamentId));
          const team = teams.find(
            (t) => t.teamName.toLowerCase() === teamName.toLowerCase()
          );
          if (team) {
            const members = await db
              .select()
              .from(teamRosterMembers)
              .where(eq(teamRosterMembers.teamId, team.id));
            members.forEach((m, idx) => {
              players.push({
                id: m.userId ? `u-${m.userId}` : `${side.toLowerCase()}-rm-${m.id}`,
                userId: m.userId ?? null,
                name: m.playerName,
                number: String(idx + 1),
                role: m.playerRole,
                side,
              });
            });
          }
        }
      } else {
        const approvedSub = demoStore.teamSubmissions.find(
          (s) =>
            s.tournamentId === match.tournamentId &&
            s.sportName.toLowerCase() === match.sportName.toLowerCase() &&
            s.teamName.toLowerCase() === teamName.toLowerCase() &&
            (s.status === "APPROVED" || s.status === "LOCKED")
        );
        if (approvedSub && approvedSub.players.length > 0) {
          approvedSub.players.forEach((p, idx) => {
            players.push({
              id: p.userId ? `u-${p.userId}` : `${side.toLowerCase()}-sub-${idx + 1}`,
              userId: p.userId ?? null,
              name: p.name,
              number: p.jersey || String(idx + 1),
              role: p.role,
              side,
            });
          });
        } else {
          const team = demoStore.tournamentTeams.find(
            (t) =>
              t.tournamentId === match.tournamentId &&
              t.teamName.toLowerCase() === teamName.toLowerCase()
          );
          if (team) {
            const members = demoStore.rosterMembers.filter(
              (r) => r.teamId === team.id
            );
            members.forEach((m, idx) => {
              players.push({
                id: m.userId ? `u-${m.userId}` : `${side.toLowerCase()}-rm-${m.id}`,
                userId: m.userId ?? null,
                name: m.playerName,
                number: String(idx + 1),
                role: m.playerRole,
                side,
              });
            });
          }
        }
      }

      // Also enrich with SOLD auction players if franchise name matches
      const matchedFranchise = auctionState.franchises.find(
        (f) =>
          f.name.toLowerCase() === teamName.toLowerCase() &&
          f.sport.toLowerCase() === match.sportName.toLowerCase()
      );
      if (matchedFranchise) {
        const soldPlayers = auctionState.registrations.filter(
          (r) => r.status === "SOLD" && r.soldToFranchiseId === matchedFranchise.id
        );
        for (const sp of soldPlayers) {
          if (!players.some((p) => p.userId === sp.userId || p.name === sp.playerName)) {
            players.push({
              id: `u-${sp.userId}`,
              userId: sp.userId,
              name: sp.playerName,
              number: String(players.length + 1),
              role: sp.positions[0] || "Player",
              side,
            });
          }
        }
      }

      return players;
    };

    const playersA = await buildTeamPlayers(match.teamA, "A");
    const playersB = await buildTeamPlayers(match.teamB, "B");
    return { playersA, playersB };
  }

  // GET /api/matches/:id/events (event-sourced scoring log + real team rosters + canEdit flag)
  app.get("/api/matches/:id/events", async (req, res) => {
    try {
      const id = Number(req.params.id);
      let match:
        | {
            id: number;
            tournamentId: number;
            sportName: string;
            stage: string;
            teamA: string;
            teamB: string;
            scoreA: string;
            scoreB: string;
            status: string;
            venue: string;
            scorerUserId: number | null;
            scoringEventsJson?: string | null;
            scoringStateJson?: string | null;
          }
        | undefined;

      if (useDb() && db) {
        const [row] = await db
          .select()
          .from(tournamentMatches)
          .where(eq(tournamentMatches.id, id));
        match = row;
      } else {
        match = demoStore.matches.find((m) => m.id === id);
      }

      if (!match) return res.status(404).json({ error: "Match not found" });

      const events = match.scoringEventsJson
        ? (() => {
            try {
              return JSON.parse(match.scoringEventsJson);
            } catch {
              return [];
            }
          })()
        : [];
      const derivedState = match.scoringStateJson
        ? (() => {
            try {
              return JSON.parse(match.scoringStateJson);
            } catch {
              return null;
            }
          })()
        : null;

      const roster = await resolveRealRosterForMatch(match);
      const canEdit = canScoreSpecificMatch(req.authUser, match.scorerUserId);

      res.json({
        matchId: match.id,
        sportName: match.sportName,
        teamA: match.teamA,
        teamB: match.teamB,
        venue: match.venue,
        stage: match.stage,
        status: match.status,
        scorerUserId: match.scorerUserId,
        canEdit,
        events,
        derivedState,
        roster,
      });
    } catch (err) {
      sendServerError(res, "GET /api/matches/:id/events", err);
    }
  });

  // PUT /api/matches/:id/events (persist full event log + derived structured state + live summary)
  app.put("/api/matches/:id/events", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const {
        events,
        derivedState,
        scoreA,
        scoreB,
        status,
        resultSummary,
        detailedBreakdown,
      } = req.body || {};

      if (!Array.isArray(events)) {
        return res.status(400).json({ error: "events array is required" });
      }
      if (events.length > 5000) {
        return res.status(400).json({ error: "Event log exceeds maximum limit" });
      }

      const eventsJson = JSON.stringify(events);
      const stateJson = derivedState ? JSON.stringify(derivedState) : null;

      if (useDb() && db) {
        const [match] = await db
          .select()
          .from(tournamentMatches)
          .where(eq(tournamentMatches.id, id));
        if (!match) return res.status(404).json({ error: "Match not found" });
        if (!canScoreSpecificMatch(req.authUser, match.scorerUserId)) {
          return res.status(403).json({
            error: "Only the assigned Match Scorer or Sports Admin can persist match events",
          });
        }

        const nextStatus =
          status && ["LIVE", "UPCOMING", "COMPLETED"].includes(status)
            ? String(status)
            : match.status;
        const transitionToCompleted =
          match.status !== "COMPLETED" && nextStatus === "COMPLETED";
        const nextScoreA = scoreA !== undefined ? String(scoreA) : match.scoreA;
        const nextScoreB = scoreB !== undefined ? String(scoreB) : match.scoreB;

        const updated = await db.transaction(async (tx) => {
          const [row] = await tx
            .update(tournamentMatches)
            .set({
              scoringEventsJson: eventsJson,
              scoringStateJson: stateJson,
              scoreA: nextScoreA,
              scoreB: nextScoreB,
              status: nextStatus,
              resultSummary:
                resultSummary !== undefined
                  ? String(resultSummary)
                  : match.resultSummary,
              detailedBreakdown:
                detailedBreakdown !== undefined
                  ? String(detailedBreakdown)
                  : match.detailedBreakdown,
            })
            .where(eq(tournamentMatches.id, id))
            .returning();

          if (transitionToCompleted) {
            const delta = computePointsDelta(
              match.sportName,
              nextScoreA,
              nextScoreB
            );
            const teams = await tx
              .select()
              .from(tournamentTeams)
              .where(
                and(
                  eq(tournamentTeams.tournamentId, match.tournamentId),
                  eq(tournamentTeams.sportName, match.sportName)
                )
              );
            const tA = teams.find(
              (t) => t.teamName.toLowerCase() === match.teamA.toLowerCase()
            );
            const tB = teams.find(
              (t) => t.teamName.toLowerCase() === match.teamB.toLowerCase()
            );
            if (tA) {
              await tx
                .update(tournamentTeams)
                .set({
                  played: tA.played + 1,
                  won: tA.won + (delta.aWon ? 1 : 0),
                  lost: tA.lost + (delta.bWon ? 1 : 0),
                  drawn: tA.drawn + (delta.isDraw ? 1 : 0),
                  points:
                    tA.points +
                    (delta.aWon ? delta.ptsWin : delta.isDraw ? delta.ptsDraw : 0),
                })
                .where(eq(tournamentTeams.id, tA.id));
            }
            if (tB) {
              await tx
                .update(tournamentTeams)
                .set({
                  played: tB.played + 1,
                  won: tB.won + (delta.bWon ? 1 : 0),
                  lost: tB.lost + (delta.aWon ? 1 : 0),
                  drawn: tB.drawn + (delta.isDraw ? 1 : 0),
                  points:
                    tB.points +
                    (delta.bWon ? delta.ptsWin : delta.isDraw ? delta.ptsDraw : 0),
                })
                .where(eq(tournamentTeams.id, tB.id));
            }
          }
          return row;
        });

        return res.json({
          saved: true,
          eventCount: events.length,
          match: updated,
        });
      }

      const match = demoStore.matches.find((m) => m.id === id);
      if (!match) return res.status(404).json({ error: "Match not found" });
      if (!canScoreSpecificMatch(req.authUser, match.scorerUserId)) {
        return res.status(403).json({
          error: "Only the assigned Match Scorer or Sports Admin can persist match events",
        });
      }

      const prevStatus = match.status;
      match.scoringEventsJson = eventsJson;
      match.scoringStateJson = stateJson;
      if (scoreA !== undefined) match.scoreA = String(scoreA);
      if (scoreB !== undefined) match.scoreB = String(scoreB);
      if (status && ["LIVE", "UPCOMING", "COMPLETED"].includes(status)) {
        match.status = String(status);
      }
      if (resultSummary !== undefined) match.resultSummary = String(resultSummary);
      if (detailedBreakdown !== undefined) {
        match.detailedBreakdown = String(detailedBreakdown);
      }

      if (prevStatus !== "COMPLETED" && match.status === "COMPLETED") {
        const delta = computePointsDelta(
          match.sportName,
          match.scoreA,
          match.scoreB
        );
        const tA = demoStore.tournamentTeams.find(
          (t) =>
            t.tournamentId === match.tournamentId &&
            t.sportName.toLowerCase() === match.sportName.toLowerCase() &&
            t.teamName.toLowerCase() === match.teamA.toLowerCase()
        );
        const tB = demoStore.tournamentTeams.find(
          (t) =>
            t.tournamentId === match.tournamentId &&
            t.sportName.toLowerCase() === match.sportName.toLowerCase() &&
            t.teamName.toLowerCase() === match.teamB.toLowerCase()
        );
        if (tA) {
          tA.played += 1;
          tA.won += delta.aWon ? 1 : 0;
          tA.lost += delta.bWon ? 1 : 0;
          tA.drawn += delta.isDraw ? 1 : 0;
          tA.points += delta.aWon ? delta.ptsWin : delta.isDraw ? delta.ptsDraw : 0;
        }
        if (tB) {
          tB.played += 1;
          tB.won += delta.bWon ? 1 : 0;
          tB.lost += delta.aWon ? 1 : 0;
          tB.drawn += delta.isDraw ? 1 : 0;
          tB.points += delta.bWon ? delta.ptsWin : delta.isDraw ? delta.ptsDraw : 0;
        }
      }

      res.json({ saved: true, eventCount: events.length, match });
    } catch (err) {
      sendServerError(res, "PUT /api/matches/:id/events", err);
    }
  });

  // =========================================================================
  // CAPTAIN TEAM-LIST SUBMISSION WORKFLOW (NON-AUCTION & PLAYING XI)
  // =========================================================================

  app.get("/api/team-submissions", async (req, res) => {
    try {
      const tournamentId = req.query.tournamentId
        ? Number(req.query.tournamentId)
        : null;

      if (useDb() && db) {
        const rows = tournamentId
          ? await db
              .select()
              .from(teamSubmissions)
              .where(eq(teamSubmissions.tournamentId, tournamentId))
              .orderBy(desc(teamSubmissions.id))
          : await db
              .select()
              .from(teamSubmissions)
              .orderBy(desc(teamSubmissions.id));
        const allUsers = await db.select().from(users);
        const userMap = new Map(allUsers.map((u) => [u.id, u.name]));
        return res.json({
          submissions: rows.map((s) => ({
            id: s.id,
            tournamentId: s.tournamentId,
            teamId: s.teamId,
            sportName: s.sportName,
            teamName: s.teamName,
            captainUserId: s.captainUserId,
            captainName: userMap.get(s.captainUserId) || "Captain",
            status: s.status,
            players: (() => {
              try {
                return JSON.parse(s.playersJson);
              } catch {
                return [];
              }
            })(),
            reviewerNotes: s.reviewerNotes,
            updatedAt: s.updatedAt.toISOString(),
            createdAt: s.createdAt.toISOString(),
          })),
        });
      }

      const userMap = new Map(demoStore.users.map((u) => [u.id, u.name]));
      const filtered = demoStore.teamSubmissions
        .filter((s) => !tournamentId || s.tournamentId === tournamentId)
        .map((s) => ({
          ...s,
          captainName: userMap.get(s.captainUserId) || "Captain",
        }));
      res.json({ submissions: filtered });
    } catch (err) {
      sendServerError(res, "GET /api/team-submissions", err);
    }
  });

  app.post("/api/team-submissions", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser!;
      if (actor.role !== "CAPTAIN" && !isPlatformAdmin(actor)) {
        return res.status(403).json({
          error:
            "Only a designated Team Captain or Sports Admin can create team submissions",
        });
      }

      const { tournamentId, teamId, sportName, teamName, players, submitNow } =
        req.body || {};
      if (!tournamentId || !sportName || !teamName || !Array.isArray(players)) {
        return res
          .status(400)
          .json({ error: "tournamentId, sportName, teamName, and players are required" });
      }

      const cleanPlayers: TeamSubmissionPlayer[] = players
        .map((p: Record<string, unknown>) => ({
          userId: p.userId ? Number(p.userId) : null,
          name: String(p.name || "").trim(),
          role: String(p.role || "Player").trim(),
          jersey: p.jersey ? String(p.jersey).trim() : "",
        }))
        .filter((p) => p.name.length > 0);

      if (cleanPlayers.length === 0) {
        return res
          .status(400)
          .json({ error: "Add at least one player to the squad list" });
      }

      const status = submitNow ? "SUBMITTED" : "DRAFT";
      const nowIso = new Date().toISOString();

      if (useDb() && db) {
        const [created] = await db
          .insert(teamSubmissions)
          .values({
            tournamentId: Number(tournamentId),
            teamId: teamId ? Number(teamId) : null,
            sportName: String(sportName).trim(),
            teamName: String(teamName).trim(),
            captainUserId: actor.id,
            status,
            playersJson: JSON.stringify(cleanPlayers),
            reviewerNotes: "",
            updatedAt: new Date(nowIso),
          })
          .returning();

        if (status === "SUBMITTED") {
          const admins = await db.select().from(users);
          for (const admin of admins.filter(
            (u) => u.role === "SPORTS_SECRETARY" || u.role === "FACULTY_ADVISOR"
          )) {
            await db.insert(notifications).values({
              userId: admin.id,
              clubId: null,
              message: `Captain ${actor.name} submitted ${teamName} (${sportName}) squad for approval.`,
              isRead: false,
            });
          }
        }
        return res.status(201).json({
          submission: {
            ...created,
            players: cleanPlayers,
            captainName: actor.name,
          },
        });
      }

      const created: TeamSubmissionRecord = {
        id: Math.max(0, ...demoStore.teamSubmissions.map((s) => s.id)) + 1,
        tournamentId: Number(tournamentId),
        teamId: teamId ? Number(teamId) : null,
        sportName: String(sportName).trim(),
        teamName: String(teamName).trim(),
        captainUserId: actor.id,
        status,
        players: cleanPlayers,
        reviewerNotes: "",
        updatedAt: nowIso,
        createdAt: nowIso,
      };
      demoStore.teamSubmissions.unshift(created);
      if (status === "SUBMITTED") {
        for (const admin of demoStore.users.filter(
          (u) => u.role === "SPORTS_SECRETARY" || u.role === "FACULTY_ADVISOR"
        )) {
          demoStore.notifications.unshift({
            id: Math.max(0, ...demoStore.notifications.map((n) => n.id)) + 1,
            userId: admin.id,
            clubId: null,
            message: `Captain ${actor.name} submitted ${teamName} (${sportName}) squad for approval.`,
            isRead: false,
            createdAt: new Date(),
          });
        }
      }
      res
        .status(201)
        .json({ submission: { ...created, captainName: actor.name } });
    } catch (err) {
      sendServerError(res, "POST /api/team-submissions", err);
    }
  });

  app.patch("/api/team-submissions/:id", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser!;
      const id = Number(req.params.id);
      const { players, status, reviewerNotes } = req.body || {};

      const isAdmin = isPlatformAdmin(actor);
      const nowIso = new Date().toISOString();

      if (useDb() && db) {
        const [existing] = await db
          .select()
          .from(teamSubmissions)
          .where(eq(teamSubmissions.id, id));
        if (!existing) {
          return res.status(404).json({ error: "Team submission not found" });
        }
        const isOwnCaptain = existing.captainUserId === actor.id;
        if (!isAdmin && !isOwnCaptain) {
          return res.status(403).json({
            error: "Only the assigned Team Captain or Sports Admin can edit this submission",
          });
        }
        if (!isAdmin && existing.status === "LOCKED") {
          return res
            .status(400)
            .json({ error: "Submission is LOCKED and cannot be modified by captain" });
        }
        if (
          !isAdmin &&
          status &&
          !["DRAFT", "SUBMITTED"].includes(String(status))
        ) {
          return res.status(403).json({
            error: "Only Sports Secretary or Faculty Advisor can approve, lock, or request changes",
          });
        }

        const nextStatus =
          status &&
          ["DRAFT", "SUBMITTED", "APPROVED", "LOCKED", "CHANGES_REQUESTED"].includes(
            String(status)
          )
            ? String(status)
            : existing.status;

        const nextPlayersJson = Array.isArray(players)
          ? JSON.stringify(players)
          : existing.playersJson;

        const [updated] = await db
          .update(teamSubmissions)
          .set({
            status: nextStatus,
            playersJson: nextPlayersJson,
            reviewerNotes:
              isAdmin && reviewerNotes !== undefined
                ? String(reviewerNotes)
                : existing.reviewerNotes,
            updatedAt: new Date(nowIso),
          })
          .where(eq(teamSubmissions.id, id))
          .returning();

        // Notify captain when admin reviews
        if (isAdmin && status && status !== existing.status) {
          await db.insert(notifications).values({
            userId: existing.captainUserId,
            clubId: null,
            message: `Your squad submission for ${existing.teamName} (${existing.sportName}) is now ${nextStatus}.`,
            isRead: false,
          });
        }

        return res.json({
          submission: {
            ...updated,
            players: JSON.parse(nextPlayersJson),
          },
        });
      }

      const existing = demoStore.teamSubmissions.find((s) => s.id === id);
      if (!existing) {
        return res.status(404).json({ error: "Team submission not found" });
      }
      const isOwnCaptain = existing.captainUserId === actor.id;
      if (!isAdmin && !isOwnCaptain) {
        return res.status(403).json({
          error: "Only the assigned Team Captain or Sports Admin can edit this submission",
        });
      }
      if (!isAdmin && existing.status === "LOCKED") {
        return res
          .status(400)
          .json({ error: "Submission is LOCKED and cannot be modified by captain" });
      }
      if (
        !isAdmin &&
        status &&
        !["DRAFT", "SUBMITTED"].includes(String(status))
      ) {
        return res.status(403).json({
          error: "Only Sports Secretary or Faculty Advisor can approve, lock, or request changes",
        });
      }

      const prevStatus = existing.status;
      if (Array.isArray(players)) {
        existing.players = players;
      }
      if (
        status &&
        ["DRAFT", "SUBMITTED", "APPROVED", "LOCKED", "CHANGES_REQUESTED"].includes(
          String(status)
        )
      ) {
        existing.status = status;
      }
      if (isAdmin && reviewerNotes !== undefined) {
        existing.reviewerNotes = String(reviewerNotes);
      }
      existing.updatedAt = nowIso;

      if (isAdmin && existing.status !== prevStatus) {
        demoStore.notifications.unshift({
          id: Math.max(0, ...demoStore.notifications.map((n) => n.id)) + 1,
          userId: existing.captainUserId,
          clubId: null,
          message: `Your squad submission for ${existing.teamName} (${existing.sportName}) is now ${existing.status}.`,
          isRead: false,
          createdAt: new Date(),
        });
      }

      res.json({ submission: existing });
    } catch (err) {
      sendServerError(res, "PATCH /api/team-submissions/:id", err);
    }
  });
}

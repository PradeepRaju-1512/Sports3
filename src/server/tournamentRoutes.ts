import type { Express, Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
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
  type MatchRecord,
  type TeamSubmissionPlayer,
  type TeamSubmissionRecord,
} from "./demoStore.js";
import { requireAuth, type AuthUserRecord } from "./auth.js";
import { sendServerError } from "./security.js";
import { foldEvents } from "../scoring/engine.js";
import {
  ALL_SPORT_IDS,
  SPORT_REGISTRY,
  type AnySportState,
  type CricketState,
  type FootballState,
} from "../scoring/reducers.js";
import type { MatchRoster, SportEvent, SportId } from "../scoring/types.js";

export interface TournamentRouteDeps {
  useDb: () => boolean;
  matchSseClients: Set<Response>;
  getNavSnapshot: () => Promise<{
    hasLiveMatches: boolean;
    showAuctionInNav: boolean;
    showLiveAuctionInNav: boolean;
    auctionStatus: string;
    alertBanner: string | null;
  }>;
  broadcastNavUpdate: () => Promise<void>;
}

const STAGE_ORDER_BASE: Record<string, number> = {
  "group match": 100,
  "league match": 100,
  "round robin": 100,
  "quarter-final": 200,
  "quarter final": 200,
  "semi-final": 300,
  "semi final": 300,
  "third place": 350,
  final: 400,
};

function computeStageMatchOrder(stage: string, existingCount: number): number {
  const base = STAGE_ORDER_BASE[stage.trim().toLowerCase()] ?? 150;
  return base + existingCount + 1;
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

function normalizeSportId(sportName: string): SportId {
  const cleaned = sportName.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((ALL_SPORT_IDS as string[]).includes(cleaned)) {
    return cleaned as SportId;
  }
  return "cricket";
}

// Slim public match summary — strips raw scoringEventsJson, scoringStateJson, and lineups
export function toPublicMatchSummary(m: {
  id: number;
  tournamentId: number;
  sportName: string;
  stage: string;
  matchOrder: number;
  teamA: string;
  teamB: string;
  scoreA: string;
  scoreB: string;
  status: string;
  scheduledTime: string;
  scheduledAt?: Date | string | null;
  venue: string;
  resultSummary: string;
  detailedBreakdown: string;
  scorerUserId: number | null;
  version?: number;
  updatedAt?: Date | string | null;
}) {
  return {
    id: m.id,
    tournamentId: m.tournamentId,
    sportName: m.sportName,
    stage: m.stage,
    matchOrder: m.matchOrder,
    teamA: m.teamA,
    teamB: m.teamB,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    status: m.status,
    scheduledTime: m.scheduledTime,
    scheduledAt:
      m.scheduledAt instanceof Date
        ? m.scheduledAt.toISOString()
        : m.scheduledAt ?? null,
    venue: m.venue,
    resultSummary: m.resultSummary,
    detailedBreakdown: m.detailedBreakdown,
    scorerUserId: m.scorerUserId,
    version: m.version ?? 1,
    updatedAt:
      m.updatedAt instanceof Date
        ? m.updatedAt.toISOString()
        : m.updatedAt ?? null,
  };
}

function parseNumericScore(raw: string): number {
  const m = String(raw || "").match(/^\s*(\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * Parse cricket score string like "148/5 (15 ov)" or "142/10 (14.2 ov)" into runs, wickets, overs.
 */
function parseCricketScoreString(
  raw: string,
  defaultOvers = 15
): { runs: number; wickets: number; overs: number } {
  const str = String(raw || "").trim();
  const scoreMatch = str.match(/(\d+)(?:\s*\/\s*(\d+))?/);
  const runs = scoreMatch ? Number(scoreMatch[1]) : 0;
  const wickets = scoreMatch && scoreMatch[2] ? Number(scoreMatch[2]) : 0;
  const ovMatch = str.match(/\(\s*(\d+(?:\.\d+)?)\s*ov/i);
  let overs = defaultOvers;
  if (ovMatch) {
    const [wholeStr, ballsStr] = ovMatch[1].split(".");
    const whole = Number(wholeStr || 0);
    const balls = Number(ballsStr || 0);
    overs = whole + balls / 6;
  }
  // ICC NRR rule: all-out team (10 wickets) counts full allotted overs
  if (wickets >= 10) {
    overs = Math.max(overs, defaultOvers);
  }
  return { runs, wickets, overs: overs > 0 ? overs : defaultOvers };
}

function extractCricketInningsData(match: {
  scoreA: string;
  scoreB: string;
  scoringStateJson?: string | null;
}): {
  runsA: number;
  oversA: number;
  runsB: number;
  oversB: number;
} {
  if (match.scoringStateJson) {
    try {
      const st = JSON.parse(match.scoringStateJson) as Partial<CricketState>;
      if (
        typeof st.runs === "number" &&
        typeof st.oversLimit === "number" &&
        st.battingSide
      ) {
        const limit = st.oversLimit > 0 ? st.oversLimit : 15;
        const currOvers =
          (st.wickets ?? 0) >= 10
            ? limit
            : (st.legalBalls ?? 0) > 0
              ? (st.legalBalls ?? 0) / 6
              : limit;
        if (st.firstInnings) {
          const firstOvers =
            st.firstInnings.wickets >= 10
              ? limit
              : st.firstInnings.legalBalls > 0
                ? st.firstInnings.legalBalls / 6
                : limit;
          if (st.firstInnings.battingSide === "A") {
            return {
              runsA: st.firstInnings.runs,
              oversA: firstOvers,
              runsB: st.runs,
              oversB: currOvers,
            };
          }
          return {
            runsA: st.runs,
            oversA: currOvers,
            runsB: st.firstInnings.runs,
            oversB: firstOvers,
          };
        }
      }
    } catch {
      // fall through to score string parser
    }
  }
  const a = parseCricketScoreString(match.scoreA, 15);
  const b = parseCricketScoreString(match.scoreB, 15);
  return { runsA: a.runs, oversA: a.overs, runsB: b.runs, oversB: b.overs };
}

function extractFootballGoals(match: {
  scoreA: string;
  scoreB: string;
  scoringStateJson?: string | null;
}): { goalsA: number; goalsB: number } {
  if (match.scoringStateJson) {
    try {
      const st = JSON.parse(match.scoringStateJson) as Partial<FootballState>;
      if (typeof st.scoreA === "number" && typeof st.scoreB === "number") {
        return { goalsA: st.scoreA, goalsB: st.scoreB };
      }
    } catch {
      // fallback
    }
  }
  return {
    goalsA: parseNumericScore(match.scoreA),
    goalsB: parseNumericScore(match.scoreB),
  };
}

interface ComputedStanding {
  played: number;
  won: number;
  lost: number;
  drawn: number;
  points: number;
  nrrOrDiff: string;
}

/**
 * Full deterministic standings recomputation from ALL COMPLETED matches for (tournamentId, sportName).
 * Replaces fragile read-modify-write increments and computes real Cricket NRR and Football GD.
 */
function calculateStandingsFromMatches(
  sportName: string,
  teamNames: string[],
  completedMatches: Array<{
    teamA: string;
    teamB: string;
    scoreA: string;
    scoreB: string;
    scoringStateJson?: string | null;
  }>
): Map<string, ComputedStanding> {
  const lowerSport = sportName.trim().toLowerCase();
  const isCricket = lowerSport.includes("cricket");
  const isFootball = lowerSport.includes("football");
  const ptsWin = isFootball ? 3 : 2;
  const ptsDraw = 1;

  interface Acc {
    played: number;
    won: number;
    lost: number;
    drawn: number;
    points: number;
    runsFor: number;
    oversFaced: number;
    runsAgainst: number;
    oversBowled: number;
    diff: number;
  }

  const accMap = new Map<string, Acc>();
  for (const name of teamNames) {
    accMap.set(name.toLowerCase(), {
      played: 0,
      won: 0,
      lost: 0,
      drawn: 0,
      points: 0,
      runsFor: 0,
      oversFaced: 0,
      runsAgainst: 0,
      oversBowled: 0,
      diff: 0,
    });
  }

  for (const m of completedMatches) {
    const keyA = m.teamA.toLowerCase();
    const keyB = m.teamB.toLowerCase();
    const a = accMap.get(keyA);
    const b = accMap.get(keyB);

    let valA = 0;
    let valB = 0;

    if (isCricket) {
      const c = extractCricketInningsData(m);
      valA = c.runsA;
      valB = c.runsB;
      if (a) {
        a.runsFor += c.runsA;
        a.oversFaced += c.oversA;
        a.runsAgainst += c.runsB;
        a.oversBowled += c.oversB;
      }
      if (b) {
        b.runsFor += c.runsB;
        b.oversFaced += c.oversB;
        b.runsAgainst += c.runsA;
        b.oversBowled += c.oversA;
      }
    } else if (isFootball) {
      const f = extractFootballGoals(m);
      valA = f.goalsA;
      valB = f.goalsB;
      if (a) a.diff += f.goalsA - f.goalsB;
      if (b) b.diff += f.goalsB - f.goalsA;
    } else {
      valA = parseNumericScore(m.scoreA);
      valB = parseNumericScore(m.scoreB);
      if (a) a.diff += valA - valB;
      if (b) b.diff += valB - valA;
    }

    const aWon = valA > valB;
    const bWon = valB > valA;
    const isDraw = valA === valB;

    if (a) {
      a.played += 1;
      if (aWon) {
        a.won += 1;
        a.points += ptsWin;
      } else if (bWon) {
        a.lost += 1;
      } else if (isDraw) {
        a.drawn += 1;
        a.points += ptsDraw;
      }
    }
    if (b) {
      b.played += 1;
      if (bWon) {
        b.won += 1;
        b.points += ptsWin;
      } else if (aWon) {
        b.lost += 1;
      } else if (isDraw) {
        b.drawn += 1;
        b.points += ptsDraw;
      }
    }
  }

  const result = new Map<string, ComputedStanding>();
  for (const [key, acc] of accMap.entries()) {
    let nrrOrDiff = "0.00";
    if (isCricket) {
      const rrFor = acc.oversFaced > 0 ? acc.runsFor / acc.oversFaced : 0;
      const rrAgainst =
        acc.oversBowled > 0 ? acc.runsAgainst / acc.oversBowled : 0;
      const nrr = rrFor - rrAgainst;
      nrrOrDiff = `${nrr >= 0 ? "+" : ""}${nrr.toFixed(2)}`;
    } else {
      nrrOrDiff = acc.diff > 0 ? `+${acc.diff}` : String(acc.diff);
    }
    result.set(key, {
      played: acc.played,
      won: acc.won,
      lost: acc.lost,
      drawn: acc.drawn,
      points: acc.points,
      nrrOrDiff,
    });
  }
  return result;
}

export function registerTournamentRoutes(
  app: Express,
  deps: TournamentRouteDeps
) {
  const { useDb, matchSseClients, getNavSnapshot, broadcastNavUpdate } = deps;

  async function buildLiveAndUpcomingPayload() {
    if (useDb() && db) {
      const all = await db
        .select()
        .from(tournamentMatches)
        .orderBy(desc(tournamentMatches.matchOrder), desc(tournamentMatches.id));
      const live = all
        .filter((m) => m.status === "LIVE")
        .map(toPublicMatchSummary);
      const upcoming = all
        .filter((m) => m.status === "UPCOMING")
        .map(toPublicMatchSummary);
      return { hasLive: live.length > 0, live, upcoming };
    }
    const all = [...demoStore.matches].sort(
      (a, b) => b.matchOrder - a.matchOrder || b.id - a.id
    );
    const live = all
      .filter((m) => m.status === "LIVE")
      .map(toPublicMatchSummary);
    const upcoming = all
      .filter((m) => m.status === "UPCOMING")
      .map(toPublicMatchSummary);
    return { hasLive: live.length > 0, live, upcoming };
  }

  async function broadcastMatchUpdate(updatedMatch?: ReturnType<typeof toPublicMatchSummary>) {
    if (matchSseClients.size === 0) return;
    try {
      const [livePayload, nav] = await Promise.all([
        buildLiveAndUpcomingPayload(),
        getNavSnapshot(),
      ]);
      const data = JSON.stringify({
        type: "MATCH_UPDATE",
        ...livePayload,
        updatedMatch: updatedMatch || null,
        nav,
        serverTime: new Date().toISOString(),
      });
      const frame = `event: match_update\ndata: ${data}\n\n`;
      for (const client of matchSseClients) {
        try {
          client.write(frame);
        } catch {
          matchSseClients.delete(client);
        }
      }
    } catch {
      // ignore broadcast errors
    }
  }

  async function recomputeStandingsTx(
    tx: NonNullable<typeof db>,
    tournamentId: number,
    sportName: string
  ) {
    const teams = await tx
      .select()
      .from(tournamentTeams)
      .where(
        and(
          eq(tournamentTeams.tournamentId, tournamentId),
          eq(tournamentTeams.sportName, sportName)
        )
      );
    if (teams.length === 0) return;

    const completedMatches = await tx
      .select()
      .from(tournamentMatches)
      .where(
        and(
          eq(tournamentMatches.tournamentId, tournamentId),
          eq(tournamentMatches.sportName, sportName),
          eq(tournamentMatches.status, "COMPLETED")
        )
      );

    const standingsMap = calculateStandingsFromMatches(
      sportName,
      teams.map((t) => t.teamName),
      completedMatches
    );

    for (const team of teams) {
      const calc = standingsMap.get(team.teamName.toLowerCase());
      if (!calc) continue;
      await tx
        .update(tournamentTeams)
        .set({
          played: calc.played,
          won: calc.won,
          lost: calc.lost,
          drawn: calc.drawn,
          points: calc.points,
          nrrOrDiff: calc.nrrOrDiff,
        })
        .where(eq(tournamentTeams.id, team.id));
    }
  }

  function recomputeStandingsDemo(tournamentId: number, sportName: string) {
    const teams = demoStore.tournamentTeams.filter(
      (t) =>
        t.tournamentId === tournamentId &&
        t.sportName.toLowerCase() === sportName.toLowerCase()
    );
    if (teams.length === 0) return;
    const completedMatches = demoStore.matches.filter(
      (m) =>
        m.tournamentId === tournamentId &&
        m.sportName.toLowerCase() === sportName.toLowerCase() &&
        m.status === "COMPLETED"
    );
    const standingsMap = calculateStandingsFromMatches(
      sportName,
      teams.map((t) => t.teamName),
      completedMatches
    );
    for (const team of teams) {
      const calc = standingsMap.get(team.teamName.toLowerCase());
      if (!calc) continue;
      team.played = calc.played;
      team.won = calc.won;
      team.lost = calc.lost;
      team.drawn = calc.drawn;
      team.points = calc.points;
      team.nrrOrDiff = calc.nrrOrDiff;
    }
  }

  // Overview tournaments
  app.get("/api/tournaments/overview", async (_req, res) => {
    try {
      if (useDb() && db) {
        const all = await db
          .select()
          .from(tournaments)
          .orderBy(desc(tournaments.year), desc(tournaments.id));
        return res.json({
          current: all.filter((t) => t.status === "CURRENT"),
          upcoming: all.filter((t) => t.status === "UPCOMING"),
          archived: all.filter((t) => t.status === "ARCHIVED"),
        });
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
        await broadcastNavUpdate();
        return res.json({ tournament: updated });
      }
      const existing = demoStore.tournaments.find((t) => t.id === id);
      if (!existing) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      existing.status = "ARCHIVED";
      await broadcastNavUpdate();
      res.json({ tournament: existing });
    } catch (err) {
      sendServerError(res, "POST /api/tournaments/:id/archive", err);
    }
  });

  // Archive by year (slim match summaries)
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
          const rosterRows =
            teamIds.length > 0
              ? await db
                  .select()
                  .from(teamRosterMembers)
                  .where(inArray(teamRosterMembers.teamId, teamIds))
              : [];
          const teamsWithRoster = teams.map((tm) => ({
            ...tm,
            roster: rosterRows.filter((r) => r.teamId === tm.id),
          }));
          const matches = (
            await db
              .select()
              .from(tournamentMatches)
              .where(eq(tournamentMatches.tournamentId, t.id))
              .orderBy(desc(tournamentMatches.matchOrder), desc(tournamentMatches.id))
          ).map(toPublicMatchSummary);
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
          .sort((a, b) => b.matchOrder - a.matchOrder || b.id - a.id)
          .map(toPublicMatchSummary);
        return { tournament: t, teams, matches };
      });
      res.json({ year, archives });
    } catch (err) {
      sendServerError(res, "GET /api/tournaments/archive/:year", err);
    }
  });

  // Flat archive endpoint used by ArchivePage.tsx (slim match summaries)
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
        const tIds = yearTournaments.map((t) => t.id);
        const allTeams =
          tIds.length > 0
            ? await db
                .select()
                .from(tournamentTeams)
                .where(inArray(tournamentTeams.tournamentId, tIds))
            : [];
        const tmIds = allTeams.map((tm) => tm.id);
        const roster =
          tmIds.length > 0
            ? await db
                .select()
                .from(teamRosterMembers)
                .where(inArray(teamRosterMembers.teamId, tmIds))
            : [];
        const matches =
          tIds.length > 0
            ? (
                await db
                  .select()
                  .from(tournamentMatches)
                  .where(inArray(tournamentMatches.tournamentId, tIds))
                  .orderBy(desc(tournamentMatches.matchOrder), desc(tournamentMatches.id))
              ).map(toPublicMatchSummary)
            : [];
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
        .sort((a, b) => b.matchOrder - a.matchOrder || b.id - a.id)
        .map(toPublicMatchSummary);
      res.json({ year, tournaments: yearTournaments, teams, roster, matches });
    } catch (err) {
      sendServerError(res, "GET /api/archive", err);
    }
  });

  // Current tournament — slim match summaries + scoped teamSubmissions (never raw scoring JSON or private drafts to guests)
  app.get("/api/tournaments/current", async (req, res) => {
    try {
      const actor = req.authUser || null;
      const isAdmin = isPlatformAdmin(actor);

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
        const teamIds = teams.map((tm) => tm.id);
        const rosterRows =
          teamIds.length > 0
            ? await db
                .select()
                .from(teamRosterMembers)
                .where(inArray(teamRosterMembers.teamId, teamIds))
            : [];
        const standings = teams.map((tm) => ({
          ...tm,
          roster: rosterRows.filter((r) => r.teamId === tm.id),
        }));
        const rawMatches = await db
          .select()
          .from(tournamentMatches)
          .where(eq(tournamentMatches.tournamentId, current.id))
          .orderBy(desc(tournamentMatches.matchOrder), desc(tournamentMatches.id));
        const matches = rawMatches.map(toPublicMatchSummary);

        // Scope teamSubmissions strictly to admins or the captain's own submissions
        let submissionsFormatted: Array<Record<string, unknown>> = [];
        if (actor && (isAdmin || actor.role === "CAPTAIN")) {
          const subRows = isAdmin
            ? await db
                .select()
                .from(teamSubmissions)
                .where(eq(teamSubmissions.tournamentId, current.id))
                .orderBy(desc(teamSubmissions.id))
            : await db
                .select()
                .from(teamSubmissions)
                .where(
                  and(
                    eq(teamSubmissions.tournamentId, current.id),
                    eq(teamSubmissions.captainUserId, actor.id)
                  )
                )
                .orderBy(desc(teamSubmissions.id));

          const captainIds = Array.from(
            new Set(subRows.map((s) => s.captainUserId))
          );
          const capUsers =
            captainIds.length > 0
              ? await db
                  .select({ id: users.id, name: users.name })
                  .from(users)
                  .where(inArray(users.id, captainIds))
              : [];
          const userMap = new Map(capUsers.map((u) => [u.id, u.name]));

          submissionsFormatted = subRows.map((s) => ({
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
        }

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
        .sort((a, b) => b.matchOrder - a.matchOrder || b.id - a.id)
        .map(toPublicMatchSummary);

      const userMap = new Map(demoStore.users.map((u) => [u.id, u.name]));
      const submissions =
        actor && (isAdmin || actor.role === "CAPTAIN")
          ? demoStore.teamSubmissions
              .filter(
                (s) =>
                  s.tournamentId === current.id &&
                  (isAdmin || s.captainUserId === actor.id)
              )
              .map((s) => ({
                ...s,
                captainName: userMap.get(s.captainUserId) || "Captain",
              }))
          : [];

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

  // Live & upcoming matches (slim summaries, strictly separated)
  app.get("/api/matches/live-and-upcoming", async (_req, res) => {
    try {
      res.json(await buildLiveAndUpcomingPayload());
    } catch (err) {
      sendServerError(res, "GET /api/matches/live-and-upcoming", err);
    }
  });

  // Live Match & Nav SSE stream (replaces 15-second full polling)
  app.get("/api/matches/stream", async (req, res) => {
    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      const [livePayload, nav] = await Promise.all([
        buildLiveAndUpcomingPayload(),
        getNavSnapshot(),
      ]);
      res.write(
        `event: snapshot\ndata: ${JSON.stringify({
          ...livePayload,
          nav,
          serverTime: new Date().toISOString(),
        })}\n\n`
      );
      matchSseClients.add(res);

      const heartbeat = setInterval(() => {
        try {
          res.write(": ping\n\n");
        } catch {
          clearInterval(heartbeat);
          matchSseClients.delete(res);
        }
      }, 20_000);

      req.on("close", () => {
        clearInterval(heartbeat);
        matchSseClients.delete(res);
      });
    } catch (err) {
      sendServerError(res, "GET /api/matches/stream", err);
    }
  });

  // Create fixture (Sports Secretary / Faculty Advisor only)
  // Validates scorerUserId (no hardcoded `|| 5` fallback) and assigns stage-aware matchOrder!
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
        matchOrder: explicitOrder,
      } = req.body || {};

      if (!tournamentId || !sportName || !teamA || !teamB) {
        return res.status(400).json({ error: "Missing required match fields" });
      }

      // Validate scorerUserId if provided; never default to hardcoded user 5
      let assignedScorerId: number | null = null;
      if (
        scorerUserId !== undefined &&
        scorerUserId !== null &&
        scorerUserId !== ""
      ) {
        const parsedId = Number(scorerUserId);
        if (!Number.isInteger(parsedId) || parsedId <= 0) {
          return res.status(400).json({ error: "Invalid scorerUserId" });
        }
        let targetScorer: { id: number; role: string } | null = null;
        if (useDb() && db) {
          const [u] = await db
            .select({ id: users.id, role: users.role })
            .from(users)
            .where(eq(users.id, parsedId));
          targetScorer = u || null;
        } else {
          const u = demoStore.users.find((x) => x.id === parsedId);
          targetScorer = u ? { id: u.id, role: u.role } : null;
        }
        if (!targetScorer) {
          return res.status(400).json({ error: "Assigned match scorer does not exist" });
        }
        if (
          !["MATCH_SCORER", "SPORTS_SECRETARY", "FACULTY_ADVISOR"].includes(
            targetScorer.role
          )
        ) {
          return res.status(400).json({
            error:
              "Assigned user must hold the MATCH_SCORER, SPORTS_SECRETARY, or FACULTY_ADVISOR role",
          });
        }
        assignedScorerId = targetScorer.id;
      }

      const parsedDate = scheduledTime ? new Date(String(scheduledTime)) : null;
      const isoTime =
        parsedDate && !Number.isNaN(parsedDate.getTime())
          ? parsedDate.toISOString()
          : new Date(Date.now() + 3600_000).toISOString();
      const stageLabel = String(stage || "Group Match").trim();

      if (useDb() && db) {
        const existingMatches = await db
          .select({ id: tournamentMatches.id })
          .from(tournamentMatches)
          .where(eq(tournamentMatches.tournamentId, Number(tournamentId)));
        const computedOrder =
          explicitOrder !== undefined && Number.isInteger(Number(explicitOrder))
            ? Number(explicitOrder)
            : computeStageMatchOrder(stageLabel, existingMatches.length);

        const [created] = await db
          .insert(tournamentMatches)
          .values({
            tournamentId: Number(tournamentId),
            sportName: String(sportName).trim(),
            stage: stageLabel,
            matchOrder: computedOrder,
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
            version: 1,
            clockAnchorMs: null,
            clockAccumulatedMs: 0,
            clockRunning: false,
            updatedAt: new Date(),
            scorerUserId: assignedScorerId,
          })
          .returning();
        const slim = toPublicMatchSummary(created);
        await broadcastMatchUpdate(slim);
        return res.status(201).json({ match: slim });
      }

      const existingCount = demoStore.matches.filter(
        (m) => m.tournamentId === Number(tournamentId)
      ).length;
      const computedOrder =
        explicitOrder !== undefined && Number.isInteger(Number(explicitOrder))
          ? Number(explicitOrder)
          : computeStageMatchOrder(stageLabel, existingCount);

      const created: MatchRecord = {
        id: Math.max(0, ...demoStore.matches.map((m) => m.id)) + 1,
        tournamentId: Number(tournamentId),
        sportName: String(sportName).trim(),
        stage: stageLabel,
        matchOrder: computedOrder,
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
        version: 1,
        clockAnchorMs: null,
        clockAccumulatedMs: 0,
        clockRunning: false,
        updatedAt: new Date().toISOString(),
        scorerUserId: assignedScorerId,
      };
      demoStore.matches.push(created);
      const slim = toPublicMatchSummary(created);
      await broadcastMatchUpdate(slim);
      res.status(201).json({ match: slim });
    } catch (err) {
      sendServerError(res, "POST /api/matches", err);
    }
  });

  // Explicit Fixture Go-Live endpoint (STRICT UPCOMING -> LIVE transition only)
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
        if (match.status !== "UPCOMING") {
          return res.status(400).json({
            error:
              match.status === "COMPLETED"
                ? "Completed matches cannot be started directly. An admin must reopen the match first."
                : "Match is already LIVE.",
          });
        }
        const [updated] = await db
          .update(tournamentMatches)
          .set({
            status: "LIVE",
            version: (match.version || 1) + 1,
            updatedAt: new Date(),
            resultSummary:
              match.resultSummary === "Scheduled"
                ? "Live — Match Underway"
                : match.resultSummary,
          })
          .where(eq(tournamentMatches.id, id))
          .returning();
        const slim = toPublicMatchSummary(updated);
        await broadcastMatchUpdate(slim);
        return res.json({ match: slim });
      }

      const match = demoStore.matches.find((m) => m.id === id);
      if (!match) return res.status(404).json({ error: "Match not found" });
      if (!canScoreSpecificMatch(req.authUser, match.scorerUserId)) {
        return res.status(403).json({
          error: "Only the assigned Match Scorer or Sports Admin can start this match",
        });
      }
      if (match.status !== "UPCOMING") {
        return res.status(400).json({
          error:
            match.status === "COMPLETED"
              ? "Completed matches cannot be started directly. An admin must reopen the match first."
              : "Match is already LIVE.",
        });
      }
      match.status = "LIVE";
      match.version = (match.version || 1) + 1;
      match.updatedAt = new Date().toISOString();
      if (match.resultSummary === "Scheduled") {
        match.resultSummary = "Live — Match Underway";
      }
      const slim = toPublicMatchSummary(match);
      await broadcastMatchUpdate(slim);
      res.json({ match: slim });
    } catch (err) {
      sendServerError(res, "POST /api/matches/:id/go-live", err);
    }
  });

  // Explicit Admin Reopen endpoint (COMPLETED -> LIVE + full standings rebuild)
  app.post("/api/matches/:id/reopen", requireAuth, async (req, res) => {
    try {
      if (!isPlatformAdmin(req.authUser)) {
        return res.status(403).json({
          error: "Only Sports Secretary or Faculty Advisor can reopen a completed match",
        });
      }
      const id = Number(req.params.id);
      if (useDb() && db) {
        const [match] = await db
          .select()
          .from(tournamentMatches)
          .where(eq(tournamentMatches.id, id));
        if (!match) return res.status(404).json({ error: "Match not found" });
        if (match.status !== "COMPLETED") {
          return res.status(400).json({ error: "Only COMPLETED matches can be reopened" });
        }
        const updated = await db.transaction(async (tx) => {
          const [row] = await tx
            .update(tournamentMatches)
            .set({
              status: "LIVE",
              version: (match.version || 1) + 1,
              updatedAt: new Date(),
              resultSummary: "Reopened — Live Match Underway",
            })
            .where(eq(tournamentMatches.id, id))
            .returning();
          await recomputeStandingsTx(tx, match.tournamentId, match.sportName);
          return row;
        });
        const slim = toPublicMatchSummary(updated);
        await broadcastMatchUpdate(slim);
        return res.json({ match: slim });
      }

      const match = demoStore.matches.find((m) => m.id === id);
      if (!match) return res.status(404).json({ error: "Match not found" });
      if (match.status !== "COMPLETED") {
        return res.status(400).json({ error: "Only COMPLETED matches can be reopened" });
      }
      match.status = "LIVE";
      match.version = (match.version || 1) + 1;
      match.updatedAt = new Date().toISOString();
      match.resultSummary = "Reopened — Live Match Underway";
      recomputeStandingsDemo(match.tournamentId, match.sportName);
      const slim = toPublicMatchSummary(match);
      await broadcastMatchUpdate(slim);
      res.json({ match: slim });
    } catch (err) {
      sendServerError(res, "POST /api/matches/:id/reopen", err);
    }
  });

  // Update match score (enforces lifecycle transitions + full transactional standings recomputation on COMPLETED)
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

        const requestedStatus = status ? String(status).toUpperCase() : match.status;
        if (!["LIVE", "UPCOMING", "COMPLETED"].includes(requestedStatus)) {
          return res.status(400).json({ error: "Invalid match status" });
        }
        if (match.status === "COMPLETED" && requestedStatus !== "COMPLETED") {
          return res.status(400).json({
            error:
              "Cannot move a COMPLETED match back to LIVE/UPCOMING here. Use the admin Reopen action.",
          });
        }
        if (match.status === "UPCOMING" && requestedStatus !== "UPCOMING") {
          return res.status(400).json({
            error: "Use Go Live to transition an UPCOMING match to LIVE first.",
          });
        }

        const nextScoreA = scoreA !== undefined ? String(scoreA) : match.scoreA;
        const nextScoreB = scoreB !== undefined ? String(scoreB) : match.scoreB;

        const updatedMatch = await db.transaction(async (tx) => {
          const [row] = await tx
            .update(tournamentMatches)
            .set({
              scoreA: nextScoreA,
              scoreB: nextScoreB,
              status: requestedStatus,
              version: (match.version || 1) + 1,
              updatedAt: new Date(),
              clockRunning:
                requestedStatus === "COMPLETED" ? false : match.clockRunning,
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

          if (requestedStatus === "COMPLETED") {
            await recomputeStandingsTx(tx, match.tournamentId, match.sportName);
          }
          return row;
        });

        const slim = toPublicMatchSummary(updatedMatch);
        await broadcastMatchUpdate(slim);
        return res.json({ match: slim });
      }

      const match = demoStore.matches.find((m) => m.id === id);
      if (!match) return res.status(404).json({ error: "Match not found" });
      if (!canScoreSpecificMatch(req.authUser, match.scorerUserId)) {
        return res.status(403).json({
          error:
            "Only the assigned Match Scorer (or Sports Secretary / Faculty Advisor) can score this match",
        });
      }

      const requestedStatus = status ? String(status).toUpperCase() : match.status;
      if (!["LIVE", "UPCOMING", "COMPLETED"].includes(requestedStatus)) {
        return res.status(400).json({ error: "Invalid match status" });
      }
      if (match.status === "COMPLETED" && requestedStatus !== "COMPLETED") {
        return res.status(400).json({
          error:
            "Cannot move a COMPLETED match back to LIVE/UPCOMING here. Use the admin Reopen action.",
        });
      }
      if (match.status === "UPCOMING" && requestedStatus !== "UPCOMING") {
        return res.status(400).json({
          error: "Use Go Live to transition an UPCOMING match to LIVE first.",
        });
      }

      if (scoreA !== undefined) match.scoreA = String(scoreA);
      if (scoreB !== undefined) match.scoreB = String(scoreB);
      match.status = requestedStatus;
      match.version = (match.version || 1) + 1;
      match.updatedAt = new Date().toISOString();
      if (requestedStatus === "COMPLETED") {
        match.clockRunning = false;
      }
      if (resultSummary !== undefined) match.resultSummary = String(resultSummary);
      if (detailedBreakdown !== undefined) {
        match.detailedBreakdown = String(detailedBreakdown);
      }

      if (requestedStatus === "COMPLETED") {
        recomputeStandingsDemo(match.tournamentId, match.sportName);
      }

      const slim = toPublicMatchSummary(match);
      await broadcastMatchUpdate(slim);
      res.json({ match: slim });
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

      // Enrich with SOLD auction players if franchise name matches
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

  // Server-side deterministic score & derived state recomputation from sport reducers
  async function computeServerDerivedScoring(
    match: {
      tournamentId: number;
      sportName: string;
      teamA: string;
      teamB: string;
      venue: string;
      stage: string;
    },
    events: SportEvent[]
  ) {
    const sportId = normalizeSportId(match.sportName);
    const def = SPORT_REGISTRY[sportId];
    const resolved = await resolveRealRosterForMatch(match);
    const roster: MatchRoster = {
      ...def.defaultRoster,
      teamAName: match.teamA,
      teamBName: match.teamB,
      venue: match.venue,
      stage: match.stage,
      playersA:
        resolved.playersA.length > 0
          ? resolved.playersA
          : def.defaultRoster.playersA,
      playersB:
        resolved.playersB.length > 0
          ? resolved.playersB
          : def.defaultRoster.playersB,
    };
    const initialState = def.createInitialState(roster);
    const derivedState: AnySportState = foldEvents(
      initialState,
      events,
      (st, ev) => def.reduce(st, ev, roster)
    );
    const summary = def.formatScoreSummary(derivedState, roster);
    return { derivedState, summary, roster };
  }

  // GET /api/matches/:id/events (event log, server-persisted clock, version, rosters & canEdit)
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
            version?: number;
            clockAnchorMs?: number | null;
            clockAccumulatedMs?: number;
            clockRunning?: boolean;
            updatedAt?: Date | string | null;
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
        version: match.version ?? 1,
        updatedAt:
          match.updatedAt instanceof Date
            ? match.updatedAt.toISOString()
            : match.updatedAt ?? new Date().toISOString(),
        clock: {
          clockAnchorMs: match.clockAnchorMs ?? null,
          clockAccumulatedMs: match.clockAccumulatedMs ?? 0,
          clockRunning: Boolean(match.clockRunning),
        },
        canEdit,
        events,
        derivedState,
        roster,
      });
    } catch (err) {
      sendServerError(res, "GET /api/matches/:id/events", err);
    }
  });

  // PUT /api/matches/:id/events
  // - Optimistic concurrency (`expectedVersion` -> 409 Conflict)
  // - Strict lifecycle (only LIVE matches can be scored; never accepts status:"LIVE" to force-start or reopen)
  // - Server-side score/stats recomputation via sport reducers
  // - Clock state persistence (`clockAnchorMs`, `clockAccumulatedMs`, `clockRunning`)
  app.put("/api/matches/:id/events", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { events, expectedVersion, completeMatch, clock } = req.body || {};

      if (!Array.isArray(events)) {
        return res.status(400).json({ error: "events array is required" });
      }
      if (events.length > 5000) {
        return res.status(400).json({ error: "Event log exceeds maximum limit" });
      }

      const wantsComplete = Boolean(completeMatch);
      const clockPatch =
        clock && typeof clock === "object"
          ? {
              clockAnchorMs:
                clock.clockAnchorMs === null || clock.clockAnchorMs === undefined
                  ? null
                  : Number(clock.clockAnchorMs),
              clockAccumulatedMs: Math.max(
                0,
                Math.round(Number(clock.clockAccumulatedMs || 0))
              ),
              clockRunning: wantsComplete ? false : Boolean(clock.clockRunning),
            }
          : null;

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
        if (match.status === "UPCOMING") {
          return res.status(400).json({
            error:
              "Match has not started yet. Use Go Live to start the match before recording events.",
          });
        }
        if (match.status === "COMPLETED") {
          return res.status(400).json({
            error:
              "Match is already COMPLETED. An admin must reopen the match before editing events.",
          });
        }

        const currentVersion = match.version ?? 1;
        if (
          expectedVersion !== undefined &&
          expectedVersion !== null &&
          Number(expectedVersion) !== currentVersion
        ) {
          return res.status(409).json({
            error:
              "Match events were updated elsewhere. Refreshing latest server version.",
            currentVersion,
            updatedAt: match.updatedAt?.toISOString() ?? new Date().toISOString(),
          });
        }

        const computed = await computeServerDerivedScoring(
          match,
          events as SportEvent[]
        );
        const eventsJson = JSON.stringify(events);
        const stateJson = JSON.stringify(computed.derivedState);
        const nextStatus = wantsComplete ? "COMPLETED" : "LIVE";
        const nextVersion = currentVersion + 1;
        const nowDate = new Date();

        const updated = await db.transaction(async (tx) => {
          const [row] = await tx
            .update(tournamentMatches)
            .set({
              scoringEventsJson: eventsJson,
              scoringStateJson: stateJson,
              scoreA: computed.summary.scoreA,
              scoreB: computed.summary.scoreB,
              status: nextStatus,
              resultSummary: computed.summary.statusLine,
              detailedBreakdown: computed.summary.breakdown,
              version: nextVersion,
              updatedAt: nowDate,
              ...(clockPatch
                ? {
                    clockAnchorMs: clockPatch.clockAnchorMs,
                    clockAccumulatedMs: clockPatch.clockAccumulatedMs,
                    clockRunning: clockPatch.clockRunning,
                  }
                : wantsComplete
                  ? { clockRunning: false }
                  : {}),
            })
            .where(
              and(
                eq(tournamentMatches.id, id),
                eq(tournamentMatches.version, currentVersion)
              )
            )
            .returning();

          if (!row) {
            return null;
          }

          if (wantsComplete) {
            await recomputeStandingsTx(tx, match.tournamentId, match.sportName);
          }
          return row;
        });

        if (!updated) {
          return res.status(409).json({
            error: "Concurrent update detected. Please reload latest match events.",
          });
        }

        const slim = toPublicMatchSummary(updated);
        await broadcastMatchUpdate(slim);
        return res.json({
          saved: true,
          eventCount: events.length,
          version: updated.version,
          updatedAt: updated.updatedAt.toISOString(),
          clock: {
            clockAnchorMs: updated.clockAnchorMs ?? null,
            clockAccumulatedMs: updated.clockAccumulatedMs ?? 0,
            clockRunning: Boolean(updated.clockRunning),
          },
          derivedSummary: computed.summary,
          match: slim,
        });
      }

      const match = demoStore.matches.find((m) => m.id === id);
      if (!match) return res.status(404).json({ error: "Match not found" });
      if (!canScoreSpecificMatch(req.authUser, match.scorerUserId)) {
        return res.status(403).json({
          error: "Only the assigned Match Scorer or Sports Admin can persist match events",
        });
      }
      if (match.status === "UPCOMING") {
        return res.status(400).json({
          error:
            "Match has not started yet. Use Go Live to start the match before recording events.",
        });
      }
      if (match.status === "COMPLETED") {
        return res.status(400).json({
          error:
            "Match is already COMPLETED. An admin must reopen the match before editing events.",
        });
      }

      const currentVersion = match.version ?? 1;
      if (
        expectedVersion !== undefined &&
        expectedVersion !== null &&
        Number(expectedVersion) !== currentVersion
      ) {
        return res.status(409).json({
          error:
            "Match events were updated elsewhere. Refreshing latest server version.",
          currentVersion,
          updatedAt: match.updatedAt ?? new Date().toISOString(),
        });
      }

      const computed = await computeServerDerivedScoring(
        match,
        events as SportEvent[]
      );
      const nextVersion = currentVersion + 1;
      const nowIso = new Date().toISOString();

      match.scoringEventsJson = JSON.stringify(events);
      match.scoringStateJson = JSON.stringify(computed.derivedState);
      match.scoreA = computed.summary.scoreA;
      match.scoreB = computed.summary.scoreB;
      match.resultSummary = computed.summary.statusLine;
      match.detailedBreakdown = computed.summary.breakdown;
      match.status = wantsComplete ? "COMPLETED" : "LIVE";
      match.version = nextVersion;
      match.updatedAt = nowIso;
      if (clockPatch) {
        match.clockAnchorMs = clockPatch.clockAnchorMs;
        match.clockAccumulatedMs = clockPatch.clockAccumulatedMs;
        match.clockRunning = clockPatch.clockRunning;
      } else if (wantsComplete) {
        match.clockRunning = false;
      }

      if (wantsComplete) {
        recomputeStandingsDemo(match.tournamentId, match.sportName);
      }

      const slim = toPublicMatchSummary(match);
      await broadcastMatchUpdate(slim);
      res.json({
        saved: true,
        eventCount: events.length,
        version: match.version,
        updatedAt: match.updatedAt,
        clock: {
          clockAnchorMs: match.clockAnchorMs ?? null,
          clockAccumulatedMs: match.clockAccumulatedMs ?? 0,
          clockRunning: Boolean(match.clockRunning),
        },
        derivedSummary: computed.summary,
        match: slim,
      });
    } catch (err) {
      sendServerError(res, "PUT /api/matches/:id/events", err);
    }
  });

  // =========================================================================
  // CAPTAIN TEAM-LIST SUBMISSION WORKFLOW (AUTHENTICATED & SCOPED)
  // =========================================================================

  app.get("/api/team-submissions", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser!;
      const isAdmin = isPlatformAdmin(actor);
      if (!isAdmin && actor.role !== "CAPTAIN") {
        return res.status(403).json({
          error:
            "Only team captains and authorized sports officials can view team submissions",
        });
      }

      const tournamentId = req.query.tournamentId
        ? Number(req.query.tournamentId)
        : null;

      if (useDb() && db) {
        const conditions = [];
        if (tournamentId) {
          conditions.push(eq(teamSubmissions.tournamentId, tournamentId));
        }
        if (!isAdmin) {
          conditions.push(eq(teamSubmissions.captainUserId, actor.id));
        }
        const rows =
          conditions.length > 0
            ? await db
                .select()
                .from(teamSubmissions)
                .where(and(...conditions))
                .orderBy(desc(teamSubmissions.id))
            : await db
                .select()
                .from(teamSubmissions)
                .orderBy(desc(teamSubmissions.id));

        const captainIds = Array.from(new Set(rows.map((s) => s.captainUserId)));
        const capUsers =
          captainIds.length > 0
            ? await db
                .select({ id: users.id, name: users.name })
                .from(users)
                .where(inArray(users.id, captainIds))
            : [];
        const userMap = new Map(capUsers.map((u) => [u.id, u.name]));

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
        .filter(
          (s) =>
            (!tournamentId || s.tournamentId === tournamentId) &&
            (isAdmin || s.captainUserId === actor.id)
        )
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

        // Batch notification insert (single multi-row INSERT)
        if (status === "SUBMITTED") {
          const admins = await db
            .select({ id: users.id })
            .from(users)
            .where(inArray(users.role, ["SPORTS_SECRETARY", "FACULTY_ADVISOR"]));
          if (admins.length > 0) {
            await db.insert(notifications).values(
              admins.map((admin) => ({
                userId: admin.id,
                clubId: null,
                message: `Captain ${actor.name} submitted ${teamName} (${sportName}) squad for approval.`,
                isRead: false,
              }))
            );
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
        let nextNotifId =
          Math.max(0, ...demoStore.notifications.map((n) => n.id)) + 1;
        for (const admin of demoStore.users.filter(
          (u) => u.role === "SPORTS_SECRETARY" || u.role === "FACULTY_ADVISOR"
        )) {
          demoStore.notifications.unshift({
            id: nextNotifId++,
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

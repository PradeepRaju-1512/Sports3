import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { DemoUser } from "../App";
import {
  applyClientAction,
  createInitialScorerClientState,
} from "../scoring/engine";
import { MatchScorerShell } from "../scoring/MatchScorerShell";
import {
  ALL_SPORT_IDS,
  SPORT_REGISTRY,
  type AnySportState,
} from "../scoring/reducers";
import type {
  ClientAction,
  MatchRoster,
  ScorerClientState,
  SportEvent,
  SportId,
  ViewportMode,
} from "../scoring/types";

interface LiveTournamentMatch {
  id: number;
  sportName: string;
  stage: string;
  teamA: string;
  teamB: string;
  scoreA: string;
  scoreB: string;
  status: string;
  venue: string;
}

interface SportSession {
  client: ScorerClientState<AnySportState>;
  allEvents: SportEvent[];
  initialSportState: AnySportState;
  roster: MatchRoster;
}

function normalizeSportParam(raw: string | null): SportId {
  if (!raw) return "cricket";
  const cleaned = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((ALL_SPORT_IDS as string[]).includes(cleaned)) {
    return cleaned as SportId;
  }
  return "cricket";
}

function detectViewport(): ViewportMode {
  if (typeof window === "undefined") return "pc";
  return window.innerWidth < 960 ? "mobile" : "pc";
}

function buildSession(
  sport: SportId,
  viewport: ViewportMode,
  customRoster?: Partial<MatchRoster>,
  matchId?: string
): SportSession {
  const def = SPORT_REGISTRY[sport];
  const roster: MatchRoster = {
    ...def.defaultRoster,
    ...customRoster,
  };
  const initialSportState = def.createInitialState(roster);
  const reduceEvent = (state: AnySportState, ev: SportEvent) =>
    def.reduce(state, ev, roster);

  const client = createInitialScorerClientState<AnySportState, SportEvent>({
    matchId: matchId || `live-${sport}-1`,
    sport,
    roster,
    initialSportState,
    events: [],
    reduceEvent,
    viewport,
  });

  return {
    client,
    allEvents: [],
    initialSportState,
    roster,
  };
}

export default function LiveScorerPage({
  currentUser,
  onLiveStateChange,
}: {
  currentUser: DemoUser | null;
  onLiveStateChange: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSport = normalizeSportParam(searchParams.get("sport"));
  const queryMatchId = searchParams.get("matchId");

  const [activeSport, setActiveSport] = useState<SportId>(initialSport);
  const [sessions, setSessions] = useState<Partial<Record<SportId, SportSession>>>(
    () => ({
      [initialSport]: buildSession(initialSport, detectViewport()),
    })
  );

  const [matchClockMs, setMatchClockMs] = useState(0);
  const [clockRunning, setClockRunning] = useState(false);
  const [linkedMatch, setLinkedMatch] = useState<LiveTournamentMatch | null>(
    null
  );
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);

  const canPushLiveScore = Boolean(
    currentUser &&
      ["MATCH_SCORER", "SPORTS_SECRETARY", "FACULTY_ADVISOR"].includes(
        currentUser.role
      ) &&
      linkedMatch
  );

  // Fetch current tournament live match so scorers can optionally sync derived scores
  useEffect(() => {
    let cancelled = false;
    async function loadLiveFixture() {
      try {
        const res = await fetch("/api/tournaments/current", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        const list: LiveTournamentMatch[] = json.matches || [];
        const picked = queryMatchId
          ? list.find((m) => String(m.id) === queryMatchId) ||
            list.find((m) => m.status === "LIVE")
          : list.find((m) => m.status === "LIVE");
        if (!picked || cancelled) return;
        setLinkedMatch(picked);

        const pickedSport = normalizeSportParam(picked.sportName);
        // Apply live fixture team names into that sport's roster if no events recorded yet
        setSessions((prev) => {
          const existing = prev[pickedSport];
          if (existing && existing.allEvents.length > 0) return prev;
          const viewport = existing?.client.viewport || detectViewport();
          return {
            ...prev,
            [pickedSport]: buildSession(
              pickedSport,
              viewport,
              {
                teamAName: picked.teamA,
                teamBName: picked.teamB,
                venue: picked.venue,
                stage: picked.stage,
              },
              `tournament-match-${picked.id}`
            ),
          };
        });
      } catch {
        // Standalone scorer still works with zero backend dependency
      }
    }
    loadLiveFixture();
    return () => {
      cancelled = true;
    };
  }, [queryMatchId]);

  // Match clock ticker
  useEffect(() => {
    if (!clockRunning) return;
    const id = window.setInterval(() => {
      setMatchClockMs((ms) => ms + 1000);
    }, 1000);
    return () => window.clearInterval(id);
  }, [clockRunning]);

  const currentSession = useMemo(() => {
    return (
      sessions[activeSport] || buildSession(activeSport, detectViewport())
    );
  }, [sessions, activeSport]);

  const dispatch = useCallback(
    (action: ClientAction<SportEvent>) => {
      setSessions((prev) => {
        const existing =
          prev[activeSport] || buildSession(activeSport, detectViewport());
        const def = SPORT_REGISTRY[activeSport];
        const reduceEvent = (state: AnySportState, ev: SportEvent) =>
          def.reduce(state, ev, existing.roster);

        const next = applyClientAction(
          existing.client,
          existing.allEvents,
          existing.initialSportState,
          reduceEvent,
          action
        );

        return {
          ...prev,
          [activeSport]: {
            ...existing,
            client: next.client,
            allEvents: next.allEvents,
          },
        };
      });
    },
    [activeSport]
  );

  const handleChangeSport = useCallback(
    (nextSport: SportId) => {
      setActiveSport(nextSport);
      setPushFeedback(null);
      setSearchParams(
        (prev) => {
          const copy = new URLSearchParams(prev);
          copy.set("sport", nextSport);
          return copy;
        },
        { replace: true }
      );
      setSessions((prev) => {
        const currentVp =
          prev[activeSport]?.client.viewport || detectViewport();
        if (prev[nextSport]) {
          // Preserve viewport consistency when switching sports
          if (prev[nextSport]!.client.viewport === currentVp) return prev;
          return {
            ...prev,
            [nextSport]: {
              ...prev[nextSport]!,
              client: {
                ...prev[nextSport]!.client,
                viewport: currentVp,
              },
            },
          };
        }
        return {
          ...prev,
          [nextSport]: buildSession(nextSport, currentVp),
        };
      });
    },
    [activeSport, setSearchParams]
  );

  const handleResetMatch = useCallback(() => {
    setSessions((prev) => {
      const existing = prev[activeSport];
      const viewport = existing?.client.viewport || detectViewport();
      return {
        ...prev,
        [activeSport]: buildSession(
          activeSport,
          viewport,
          existing?.roster,
          existing?.client.derived.matchId
        ),
      };
    });
    setMatchClockMs(0);
    setClockRunning(false);
    setPushFeedback(null);
  }, [activeSport]);

  const handlePushLiveScore = useCallback(async () => {
    if (!currentUser || !linkedMatch) return;
    const def = SPORT_REGISTRY[activeSport];
    const summary = def.formatScoreSummary(
      currentSession.client.derived.sportState,
      currentSession.roster
    );
    dispatch({ type: "SET_SYNC", status: "syncing" });
    try {
      const res = await fetch(`/api/matches/${linkedMatch.id}/score`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorUserId: currentUser.id,
          scoreA: summary.scoreA,
          scoreB: summary.scoreB,
          status: "LIVE",
          resultSummary: summary.statusLine,
          detailedBreakdown: summary.breakdown,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        dispatch({
          type: "SET_SYNC",
          status: "error",
          message: err.error || "Sync failed",
        });
        setPushFeedback(err.error || "Unable to push score to tournament feed.");
        return;
      }
      dispatch({ type: "SET_SYNC", status: "synced" });
      setPushFeedback(
        `Synced ${summary.scoreA} – ${summary.scoreB} to ${linkedMatch.teamA} vs ${linkedMatch.teamB}.`
      );
      onLiveStateChange();
    } catch {
      dispatch({ type: "SET_SYNC", status: "offline" });
      setPushFeedback("Network unavailable — events remain safely stored locally.");
    }
  }, [
    activeSport,
    currentSession,
    currentUser,
    dispatch,
    linkedMatch,
    onLiveStateChange,
  ]);

  const linkedLabel = linkedMatch
    ? `${linkedMatch.sportName}: ${linkedMatch.teamA} vs ${linkedMatch.teamB}`
    : null;

  return (
    <div
      className={
        currentSession.client.viewport === "mobile"
          ? "scorer-page-mobile-frame"
          : "scorer-page-pc-frame"
      }
    >
      <MatchScorerShell
        state={currentSession.client}
        allEvents={currentSession.allEvents}
        dispatch={dispatch}
        onChangeSport={handleChangeSport}
        onResetMatch={handleResetMatch}
        matchClockMs={matchClockMs}
        clockRunning={clockRunning}
        onToggleClock={() => setClockRunning((r) => !r)}
        onResetClock={() => {
          setClockRunning(false);
          setMatchClockMs(0);
        }}
        linkedMatchLabel={linkedLabel}
        canPushLiveScore={canPushLiveScore}
        onPushLiveScore={handlePushLiveScore}
        pushFeedback={pushFeedback}
      />
    </div>
  );
}

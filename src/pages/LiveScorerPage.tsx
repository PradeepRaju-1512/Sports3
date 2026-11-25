import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { DemoUser } from "../App";
import { apiFetch } from "../lib/api";
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
  PlayerProfile,
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
  scorerUserId?: number | null;
}

interface SportSession {
  client: ScorerClientState<AnySportState>;
  allEvents: SportEvent[];
  initialSportState: AnySportState;
  roster: MatchRoster;
}

const OFFLINE_KEY_PREFIX = "iiitt_scorer_events_v1_";

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

function saveOfflineEvents(storageKey: string, events: SportEvent[]): boolean {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(events));
    return true;
  } catch {
    return false;
  }
}

function loadOfflineEvents(storageKey: string): SportEvent[] | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SportEvent[]) : null;
  } catch {
    return null;
  }
}

function buildSession(
  sport: SportId,
  viewport: ViewportMode,
  customRoster?: Partial<MatchRoster>,
  matchId?: string,
  initialEvents: SportEvent[] = []
): SportSession {
  const def = SPORT_REGISTRY[sport];
  const roster: MatchRoster = {
    ...def.defaultRoster,
    ...customRoster,
    playersA:
      customRoster?.playersA && customRoster.playersA.length > 0
        ? customRoster.playersA
        : def.defaultRoster.playersA,
    playersB:
      customRoster?.playersB && customRoster.playersB.length > 0
        ? customRoster.playersB
        : def.defaultRoster.playersB,
  };
  const initialSportState = def.createInitialState(roster);
  const reduceEvent = (state: AnySportState, ev: SportEvent) =>
    def.reduce(state, ev, roster);

  const client = createInitialScorerClientState<AnySportState, SportEvent>({
    matchId: matchId || `live-${sport}-1`,
    sport,
    roster,
    initialSportState,
    events: initialEvents,
    reduceEvent,
    viewport,
  });

  return {
    client,
    allEvents: initialEvents,
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
  const [sessions, setSessions] = useState<
    Partial<Record<SportId, SportSession>>
  >(() => ({
    [initialSport]: buildSession(initialSport, detectViewport()),
  }));

  // Timestamp-based drift-free match clock
  const [accumulatedMs, setAccumulatedMs] = useState(0);
  const [clockRunning, setClockRunning] = useState(false);
  const clockStartedAtRef = useRef<number | null>(null);
  const [displayClockMs, setDisplayClockMs] = useState(0);

  const [linkedMatch, setLinkedMatch] = useState<LiveTournamentMatch | null>(
    null
  );
  const [serverCanEdit, setServerCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [syncStatusLabel, setSyncStatusLabel] = useState<string>("Ready");

  const canEdit = useMemo(() => {
    if (!currentUser) return false;
    if (linkedMatch) return serverCanEdit;
    // Standalone sandbox only editable by official roles (strictly read-only for students/guests)
    return [
      "MATCH_SCORER",
      "SPORTS_SECRETARY",
      "FACULTY_ADVISOR",
    ].includes(currentUser.role);
  }, [currentUser, linkedMatch, serverCanEdit]);

  const canPushLiveScore = Boolean(canEdit && linkedMatch);

  // Hydrate linked fixture, real team rosters, and persisted events from backend + localStorage queue
  useEffect(() => {
    let cancelled = false;
    async function loadMatchAndEvents() {
      try {
        const res = await apiFetch("/api/tournaments/current", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        const list: LiveTournamentMatch[] = json.matches || [];
        const picked = queryMatchId
          ? list.find((m) => String(m.id) === queryMatchId) ||
            list.find((m) => m.status === "LIVE")
          : list.find((m) => m.status === "LIVE");
        if (!picked || cancelled) {
          setLinkedMatch(null);
          setServerCanEdit(false);
          return;
        }
        setLinkedMatch(picked);

        const evRes = await apiFetch(`/api/matches/${picked.id}/events`, {
          cache: "no-store",
        });
        if (!evRes.ok || cancelled) return;
        const evData = await evRes.json();
        if (cancelled) return;

        setServerCanEdit(Boolean(evData.canEdit));
        const pickedSport = normalizeSportParam(picked.sportName);
        if (!searchParams.get("sport")) {
          setActiveSport(pickedSport);
        }

        const storageKey = `${OFFLINE_KEY_PREFIX}${picked.id}`;
        const serverEvents: SportEvent[] = Array.isArray(evData.events)
          ? evData.events
          : [];
        const localEvents = loadOfflineEvents(storageKey);

        // Prefer whichever log has more recorded events (preserving unsynced offline edits)
        const hydratedEvents =
          localEvents && localEvents.length > serverEvents.length
            ? localEvents
            : serverEvents;

        if (localEvents && localEvents.length > serverEvents.length) {
          setSyncStatusLabel("Unsynced local edits restored");
        } else {
          setSyncStatusLabel(
            serverEvents.length > 0 ? "Synced with server" : "Ready"
          );
        }

        const playersA: PlayerProfile[] = Array.isArray(evData.roster?.playersA)
          ? evData.roster.playersA
          : [];
        const playersB: PlayerProfile[] = Array.isArray(evData.roster?.playersB)
          ? evData.roster.playersB
          : [];

        setSessions((prev) => {
          const viewport = prev[pickedSport]?.client.viewport || detectViewport();
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
                playersA,
                playersB,
              },
              `tournament-match-${picked.id}`,
              hydratedEvents
            ),
          };
        });
      } catch {
        if (!cancelled) {
          setSyncStatusLabel("Offline mode");
        }
      }
    }
    void loadMatchAndEvents();
    return () => {
      cancelled = true;
    };
  }, [queryMatchId, currentUser?.id]);

  // Elapsed timestamp clock (zero drift across background tabs)
  useEffect(() => {
    if (!clockRunning) {
      setDisplayClockMs(accumulatedMs);
      return;
    }
    if (clockStartedAtRef.current === null) {
      clockStartedAtRef.current = Date.now();
    }
    const tick = () => {
      if (clockStartedAtRef.current !== null) {
        setDisplayClockMs(accumulatedMs + (Date.now() - clockStartedAtRef.current));
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [clockRunning, accumulatedMs]);

  const handleToggleClock = useCallback(() => {
    if (!canEdit) return;
    setClockRunning((running) => {
      if (running) {
        if (clockStartedAtRef.current !== null) {
          setAccumulatedMs((prev) => prev + (Date.now() - clockStartedAtRef.current!));
          clockStartedAtRef.current = null;
        }
        return false;
      }
      clockStartedAtRef.current = Date.now();
      return true;
    });
  }, [canEdit]);

  const handleResetClock = useCallback(() => {
    if (!canEdit) return;
    clockStartedAtRef.current = null;
    setClockRunning(false);
    setAccumulatedMs(0);
    setDisplayClockMs(0);
  }, [canEdit]);

  const currentSession = useMemo(() => {
    return (
      sessions[activeSport] || buildSession(activeSport, detectViewport())
    );
  }, [sessions, activeSport]);

  const persistEventsToServer = useCallback(
    async (
      sessionToSave: SportSession,
      sportId: SportId,
      targetStatus: "LIVE" | "COMPLETED" = "LIVE"
    ) => {
      if (!linkedMatch || !canEdit) return false;
      const def = SPORT_REGISTRY[sportId];
      const summary = def.formatScoreSummary(
        sessionToSave.client.derived.sportState,
        sessionToSave.roster
      );

      setSaving(true);
      setPushError(null);
      try {
        const res = await apiFetch(`/api/matches/${linkedMatch.id}/events`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            events: sessionToSave.allEvents,
            derivedState: sessionToSave.client.derived.sportState,
            scoreA: summary.scoreA,
            scoreB: summary.scoreB,
            status: targetStatus,
            resultSummary: summary.statusLine,
            detailedBreakdown: summary.breakdown,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setPushError(err.error || "Unable to save match events.");
          setSyncStatusLabel("Save failed");
          return false;
        }
        saveOfflineEvents(
          `${OFFLINE_KEY_PREFIX}${linkedMatch.id}`,
          sessionToSave.allEvents
        );
        setSyncStatusLabel(
          targetStatus === "COMPLETED" ? "Match completed & synced" : "Synced"
        );
        setPushFeedback(
          targetStatus === "COMPLETED"
            ? `Match finalized (${summary.scoreA} – ${summary.scoreB}) and standings updated.`
            : `Saved ${sessionToSave.allEvents.length} events (${summary.scoreA} – ${summary.scoreB}).`
        );
        onLiveStateChange();
        return true;
      } catch {
        const storedLocally = saveOfflineEvents(
          `${OFFLINE_KEY_PREFIX}${linkedMatch.id}`,
          sessionToSave.allEvents
        );
        setSyncStatusLabel(storedLocally ? "Queued offline" : "Sync failed");
        setPushError(
          storedLocally
            ? "Network unavailable — events were saved to this browser's offline queue."
            : "Network unavailable and browser local storage could not persist events."
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [canEdit, linkedMatch, onLiveStateChange]
  );

  // Auto-save timer ref for seamless background server sync after scoring actions
  const autoSaveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  const dispatch = useCallback(
    (action: ClientAction<SportEvent>) => {
      const isMutationAction =
        action.type === "APPEND_EVENT" ||
        action.type === "UNDO_LAST" ||
        action.type === "EDIT_EVENT";
      if (isMutationAction && !canEdit) {
        setPushError("Read-only mode: you are not assigned to score this match.");
        return;
      }

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

        const updatedSession: SportSession = {
          ...existing,
          client: next.client,
          allEvents: next.allEvents,
        };

        if (isMutationAction) {
          const storageKey = linkedMatch
            ? `${OFFLINE_KEY_PREFIX}${linkedMatch.id}`
            : `${OFFLINE_KEY_PREFIX}sandbox_${activeSport}`;
          const savedLocal = saveOfflineEvents(storageKey, next.allEvents);
          if (linkedMatch && canEdit) {
            setSyncStatusLabel(savedLocal ? "Saving..." : "Syncing...");
            if (autoSaveTimerRef.current) {
              window.clearTimeout(autoSaveTimerRef.current);
            }
            autoSaveTimerRef.current = window.setTimeout(() => {
              void persistEventsToServer(updatedSession, activeSport, "LIVE");
            }, 600);
          }
        }

        return {
          ...prev,
          [activeSport]: updatedSession,
        };
      });
    },
    [activeSport, canEdit, linkedMatch, persistEventsToServer]
  );

  const handleChangeSport = useCallback(
    (nextSport: SportId) => {
      setActiveSport(nextSport);
      setPushFeedback(null);
      setPushError(null);
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
        const savedSandbox = loadOfflineEvents(
          `${OFFLINE_KEY_PREFIX}sandbox_${nextSport}`
        );
        return {
          ...prev,
          [nextSport]: buildSession(
            nextSport,
            currentVp,
            undefined,
            undefined,
            savedSandbox || []
          ),
        };
      });
    },
    [activeSport, setSearchParams]
  );

  const handleResetMatch = useCallback(() => {
    if (!canEdit) return;
    const existing = sessions[activeSport];
    const viewport = existing?.client.viewport || detectViewport();
    const fresh = buildSession(
      activeSport,
      viewport,
      existing?.roster,
      existing?.client.derived.matchId,
      []
    );
    setSessions((prev) => ({
      ...prev,
      [activeSport]: fresh,
    }));
    const storageKey = linkedMatch
      ? `${OFFLINE_KEY_PREFIX}${linkedMatch.id}`
      : `${OFFLINE_KEY_PREFIX}sandbox_${activeSport}`;
    saveOfflineEvents(storageKey, []);
    handleResetClock();
    setPushFeedback(null);
    setPushError(null);
    if (linkedMatch) {
      void persistEventsToServer(fresh, activeSport, "LIVE");
    }
  }, [
    activeSport,
    canEdit,
    handleResetClock,
    linkedMatch,
    persistEventsToServer,
    sessions,
  ]);

  const handlePushLiveScore = useCallback(() => {
    void persistEventsToServer(currentSession, activeSport, "LIVE");
  }, [activeSport, currentSession, persistEventsToServer]);

  const handleCompleteMatch = useCallback(() => {
    void persistEventsToServer(currentSession, activeSport, "COMPLETED");
  }, [activeSport, currentSession, persistEventsToServer]);

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
        matchClockMs={displayClockMs}
        clockRunning={clockRunning}
        onToggleClock={handleToggleClock}
        onResetClock={handleResetClock}
        linkedMatchLabel={linkedLabel}
        canEdit={canEdit}
        canPushLiveScore={canPushLiveScore}
        onPushLiveScore={handlePushLiveScore}
        onCompleteMatch={handleCompleteMatch}
        pushFeedback={pushFeedback}
        pushError={pushError}
        saving={saving}
        syncStatusLabel={syncStatusLabel}
      />
    </div>
  );
}

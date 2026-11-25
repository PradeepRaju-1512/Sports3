import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { DemoUser } from "../App";
import { apiFetch } from "../lib/api";
import { useLiveMatchesStream } from "../hooks/useLiveMatchesStream";
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

export interface LiveTournamentMatch {
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
  version?: number;
  updatedAt?: string;
}

interface PersistedClockPayload {
  clockAnchorMs: number | null;
  clockAccumulatedMs: number;
  clockRunning: boolean;
}

interface OfflineMatchEnvelope {
  version: number;
  updatedAt: string;
  dirty: boolean;
  events: SportEvent[];
  clock?: PersistedClockPayload;
}

interface SportSession {
  client: ScorerClientState<AnySportState>;
  allEvents: SportEvent[];
  initialSportState: AnySportState;
  roster: MatchRoster;
}

const OFFLINE_KEY_PREFIX = "iiitt_scorer_v2_";

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

function saveOfflineEnvelope(
  storageKey: string,
  envelope: OfflineMatchEnvelope
): boolean {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

function loadOfflineEnvelope(storageKey: string): OfflineMatchEnvelope | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray(parsed.events) &&
      typeof parsed.version === "number"
    ) {
      return parsed as OfflineMatchEnvelope;
    }
    return null;
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

  // Persisted drift-free match clock (synchronized with server)
  const [accumulatedMs, setAccumulatedMs] = useState(0);
  const [clockRunning, setClockRunning] = useState(false);
  const clockAnchorRef = useRef<number | null>(null);
  const [displayClockMs, setDisplayClockMs] = useState(0);

  const [availableMatches, setAvailableMatches] = useState<
    LiveTournamentMatch[]
  >([]);
  const [linkedMatch, setLinkedMatch] = useState<LiveTournamentMatch | null>(
    null
  );
  const [serverCanEdit, setServerCanEdit] = useState(false);
  const [serverVersion, setServerVersion] = useState<number>(1);
  const serverVersionRef = useRef<number>(1);
  const [saving, setSaving] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [syncStatusLabel, setSyncStatusLabel] = useState<string>("Ready");

  const getCurrentClockPayload = useCallback((): PersistedClockPayload => {
    return {
      clockAnchorMs: clockRunning ? clockAnchorRef.current : null,
      clockAccumulatedMs: Math.max(0, Math.round(accumulatedMs)),
      clockRunning,
    };
  }, [accumulatedMs, clockRunning]);

  const applyServerClock = useCallback(
    (clock?: Partial<PersistedClockPayload> | null) => {
      if (!clock) {
        clockAnchorRef.current = null;
        setClockRunning(false);
        setAccumulatedMs(0);
        setDisplayClockMs(0);
        return;
      }
      const acc = Math.max(0, Number(clock.clockAccumulatedMs || 0));
      const running = Boolean(clock.clockRunning);
      const anchor =
        running &&
        typeof clock.clockAnchorMs === "number" &&
        clock.clockAnchorMs > 0
          ? clock.clockAnchorMs
          : running
            ? Date.now()
            : null;
      clockAnchorRef.current = anchor;
      setAccumulatedMs(acc);
      setClockRunning(running);
      setDisplayClockMs(
        running && anchor !== null ? acc + Math.max(0, Date.now() - anchor) : acc
      );
    },
    []
  );

  // Strict lifecycle gating: scoring controls active ONLY when linked match is LIVE
  // (or standalone sandbox for official roles when no linked match exists)
  const canEdit = useMemo(() => {
    if (!currentUser) return false;
    if (linkedMatch) {
      return serverCanEdit && linkedMatch.status === "LIVE";
    }
    return [
      "MATCH_SCORER",
      "SPORTS_SECRETARY",
      "FACULTY_ADVISOR",
    ].includes(currentUser.role);
  }, [currentUser, linkedMatch, serverCanEdit]);

  const canGoLiveHere = Boolean(
    currentUser &&
      linkedMatch &&
      serverCanEdit &&
      linkedMatch.status === "UPCOMING"
  );

  const canPushLiveScore = Boolean(canEdit && linkedMatch);

  const loadMatchAndEvents = useCallback(
    async (opts?: { forceServer?: boolean }) => {
      try {
        const res = await apiFetch("/api/tournaments/current", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        const list: LiveTournamentMatch[] = json.matches || [];
        const selectable = list.filter(
          (m) => m.status === "LIVE" || m.status === "UPCOMING"
        );
        setAvailableMatches(selectable.length > 0 ? selectable : list);

        const picked = queryMatchId
          ? list.find((m) => String(m.id) === queryMatchId) ||
            list.find((m) => m.status === "LIVE") ||
            list[0]
          : list.find((m) => m.status === "LIVE") || list[0];

        if (!picked) {
          setLinkedMatch(null);
          setServerCanEdit(false);
          return;
        }
        setLinkedMatch(picked);

        const evRes = await apiFetch(`/api/matches/${picked.id}/events`, {
          cache: "no-store",
        });
        if (!evRes.ok) return;
        const evData = await evRes.json();

        setServerCanEdit(Boolean(evData.canEdit));
        const srvVersion = Number(evData.version ?? 1);
        const srvUpdatedAt = String(evData.updatedAt || "");
        setServerVersion(srvVersion);
        serverVersionRef.current = srvVersion;

        const pickedSport = normalizeSportParam(picked.sportName);
        setActiveSport(pickedSport);

        const storageKey = `${OFFLINE_KEY_PREFIX}${picked.id}`;
        const serverEvents: SportEvent[] = Array.isArray(evData.events)
          ? evData.events
          : [];
        const localEnv = loadOfflineEnvelope(storageKey);

        // Reconcile strictly by version & updatedAt (NEVER by events.length — undo/reset may shrink events!)
        const localIsNewerUnsynced =
          !opts?.forceServer &&
          Boolean(evData.canEdit) &&
          picked.status === "LIVE" &&
          localEnv !== null &&
          localEnv.dirty &&
          localEnv.version === srvVersion &&
          (!srvUpdatedAt ||
            new Date(localEnv.updatedAt).getTime() >
              new Date(srvUpdatedAt).getTime());

        const hydratedEvents = localIsNewerUnsynced
          ? localEnv!.events
          : serverEvents;

        if (localIsNewerUnsynced) {
          setSyncStatusLabel("Unsynced local edits restored");
          if (localEnv?.clock) {
            applyServerClock(localEnv.clock);
          } else {
            applyServerClock(evData.clock);
          }
        } else {
          applyServerClock(evData.clock);
          saveOfflineEnvelope(storageKey, {
            version: srvVersion,
            updatedAt: srvUpdatedAt || new Date().toISOString(),
            dirty: false,
            events: serverEvents,
            clock: evData.clock,
          });
          setSyncStatusLabel(
            picked.status === "COMPLETED"
              ? "Completed (Locked)"
              : picked.status === "UPCOMING"
                ? "Upcoming (Go Live to score)"
                : serverEvents.length > 0
                  ? `Synced v${srvVersion}`
                  : `Live v${srvVersion}`
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
        setSyncStatusLabel("Offline mode");
      }
    },
    [queryMatchId, applyServerClock]
  );

  useEffect(() => {
    void loadMatchAndEvents();
  }, [loadMatchAndEvents, currentUser?.id]);

  // Real-time SSE spectator updates when another scorer updates the match
  useLiveMatchesStream({
    onMatchUpdate: () => {
      if (!canEdit) {
        void loadMatchAndEvents({ forceServer: true });
      }
    },
  });

  // Elapsed timestamp clock (zero drift across background tabs)
  useEffect(() => {
    if (!clockRunning) {
      setDisplayClockMs(accumulatedMs);
      return;
    }
    if (clockAnchorRef.current === null) {
      clockAnchorRef.current = Date.now();
    }
    const tick = () => {
      if (clockAnchorRef.current !== null) {
        setDisplayClockMs(
          accumulatedMs + Math.max(0, Date.now() - clockAnchorRef.current)
        );
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [clockRunning, accumulatedMs]);

  const currentSession = useMemo(() => {
    return (
      sessions[activeSport] || buildSession(activeSport, detectViewport())
    );
  }, [sessions, activeSport]);

  const persistEventsToServer = useCallback(
    async (
      sessionToSave: SportSession,
      _sportId: SportId,
      options?: { completeMatch?: boolean; clockOverride?: PersistedClockPayload }
    ) => {
      if (!linkedMatch || !canEdit) return false;
      const completeMatch = Boolean(options?.completeMatch);
      const clock = options?.clockOverride || getCurrentClockPayload();

      setSaving(true);
      setPushError(null);
      try {
        // Never send status: "LIVE" on autosave; server enforces explicit Go-Live and derives scores/stats from events
        const res = await apiFetch(`/api/matches/${linkedMatch.id}/events`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            events: sessionToSave.allEvents,
            expectedVersion: serverVersionRef.current,
            completeMatch,
            clock,
          }),
        });
        const out = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setPushError(
            out.error ||
              "Match was updated on another device. Reloading latest state..."
          );
          setSyncStatusLabel("Conflict — reloading");
          await loadMatchAndEvents({ forceServer: true });
          return false;
        }
        if (!res.ok) {
          setPushError(out.error || "Unable to save match events.");
          setSyncStatusLabel("Save failed");
          return false;
        }
        const nextVersion = Number(out.version ?? serverVersionRef.current + 1);
        const nextUpdatedAt = String(out.updatedAt || new Date().toISOString());
        setServerVersion(nextVersion);
        serverVersionRef.current = nextVersion;

        saveOfflineEnvelope(`${OFFLINE_KEY_PREFIX}${linkedMatch.id}`, {
          version: nextVersion,
          updatedAt: nextUpdatedAt,
          dirty: false,
          events: sessionToSave.allEvents,
          clock: out.clock || clock,
        });

        if (completeMatch && out.match) {
          setLinkedMatch((prev) =>
            prev ? { ...prev, status: "COMPLETED", version: nextVersion } : prev
          );
        }

        setSyncStatusLabel(
          completeMatch
            ? "Completed & standings updated"
            : `Synced v${nextVersion}`
        );
        setPushFeedback(
          completeMatch
            ? `Match finalized (${out.derivedSummary?.scoreA ?? ""} – ${out.derivedSummary?.scoreB ?? ""}) and standings recalculated.`
            : `Saved ${sessionToSave.allEvents.length} events (v${nextVersion}).`
        );
        onLiveStateChange();
        return true;
      } catch {
        const storedLocally = saveOfflineEnvelope(
          `${OFFLINE_KEY_PREFIX}${linkedMatch.id}`,
          {
            version: serverVersionRef.current,
            updatedAt: new Date().toISOString(),
            dirty: true,
            events: sessionToSave.allEvents,
            clock,
          }
        );
        setSyncStatusLabel(storedLocally ? "Queued offline" : "Sync failed");
        setPushError(
          storedLocally
            ? "Network unavailable — events were saved locally and will sync when back online."
            : "Network unavailable and browser local storage could not persist events."
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [
      canEdit,
      getCurrentClockPayload,
      linkedMatch,
      loadMatchAndEvents,
      onLiveStateChange,
    ]
  );

  const handleToggleClock = useCallback(() => {
    if (!canEdit) return;
    let nextClock: PersistedClockPayload;
    if (clockRunning) {
      const elapsed =
        clockAnchorRef.current !== null
          ? Math.max(0, Date.now() - clockAnchorRef.current)
          : 0;
      const nextAcc = accumulatedMs + elapsed;
      clockAnchorRef.current = null;
      setAccumulatedMs(nextAcc);
      setClockRunning(false);
      setDisplayClockMs(nextAcc);
      nextClock = {
        clockAnchorMs: null,
        clockAccumulatedMs: nextAcc,
        clockRunning: false,
      };
    } else {
      const anchor = Date.now();
      clockAnchorRef.current = anchor;
      setClockRunning(true);
      nextClock = {
        clockAnchorMs: anchor,
        clockAccumulatedMs: accumulatedMs,
        clockRunning: true,
      };
    }
    if (linkedMatch) {
      void persistEventsToServer(currentSession, activeSport, {
        clockOverride: nextClock,
      });
    }
  }, [
    accumulatedMs,
    activeSport,
    canEdit,
    clockRunning,
    currentSession,
    linkedMatch,
    persistEventsToServer,
  ]);

  const handleResetClock = useCallback(() => {
    if (!canEdit) return;
    clockAnchorRef.current = null;
    setClockRunning(false);
    setAccumulatedMs(0);
    setDisplayClockMs(0);
    if (linkedMatch) {
      void persistEventsToServer(currentSession, activeSport, {
        clockOverride: {
          clockAnchorMs: null,
          clockAccumulatedMs: 0,
          clockRunning: false,
        },
      });
    }
  }, [activeSport, canEdit, currentSession, linkedMatch, persistEventsToServer]);

  const handleGoLive = useCallback(async () => {
    if (!linkedMatch || !canGoLiveHere) return;
    setSaving(true);
    setPushError(null);
    setPushFeedback(null);
    try {
      const res = await apiFetch(`/api/matches/${linkedMatch.id}/go-live`, {
        method: "POST",
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPushError(out.error || "Unable to start match.");
        return;
      }
      setPushFeedback("Match is now LIVE. Scoring pad unlocked.");
      await loadMatchAndEvents({ forceServer: true });
      onLiveStateChange();
    } catch {
      setPushError("Network error starting match.");
    } finally {
      setSaving(false);
    }
  }, [canGoLiveHere, linkedMatch, loadMatchAndEvents, onLiveStateChange]);

  const handleSelectMatch = useCallback(
    (matchId: number) => {
      const found = availableMatches.find((m) => m.id === matchId);
      setPushFeedback(null);
      setPushError(null);
      setSearchParams(
        (prev) => {
          const copy = new URLSearchParams(prev);
          copy.set("matchId", String(matchId));
          if (found) {
            copy.set("sport", normalizeSportParam(found.sportName));
          }
          return copy;
        },
        { replace: true }
      );
    },
    [availableMatches, setSearchParams]
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
        setPushError(
          linkedMatch?.status === "UPCOMING"
            ? "Match is UPCOMING. Click Go Live to unlock scoring."
            : linkedMatch?.status === "COMPLETED"
              ? "Match is COMPLETED and locked."
              : "Read-only mode: you are not assigned to score this match."
        );
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
          const savedLocal = saveOfflineEnvelope(storageKey, {
            version: serverVersionRef.current,
            updatedAt: new Date().toISOString(),
            dirty: true,
            events: next.allEvents,
            clock: getCurrentClockPayload(),
          });
          if (linkedMatch && canEdit) {
            setSyncStatusLabel(savedLocal ? "Saving..." : "Syncing...");
            if (autoSaveTimerRef.current) {
              window.clearTimeout(autoSaveTimerRef.current);
            }
            autoSaveTimerRef.current = window.setTimeout(() => {
              void persistEventsToServer(updatedSession, activeSport, {
                completeMatch: false,
              });
            }, 600);
          }
        }

        return {
          ...prev,
          [activeSport]: updatedSession,
        };
      });
    },
    [
      activeSport,
      canEdit,
      getCurrentClockPayload,
      linkedMatch,
      persistEventsToServer,
    ]
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
        const savedSandbox = loadOfflineEnvelope(
          `${OFFLINE_KEY_PREFIX}sandbox_${nextSport}`
        );
        return {
          ...prev,
          [nextSport]: buildSession(
            nextSport,
            currentVp,
            undefined,
            undefined,
            savedSandbox?.events || []
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
    const resetClock: PersistedClockPayload = {
      clockAnchorMs: null,
      clockAccumulatedMs: 0,
      clockRunning: false,
    };
    clockAnchorRef.current = null;
    setClockRunning(false);
    setAccumulatedMs(0);
    setDisplayClockMs(0);

    const storageKey = linkedMatch
      ? `${OFFLINE_KEY_PREFIX}${linkedMatch.id}`
      : `${OFFLINE_KEY_PREFIX}sandbox_${activeSport}`;
    saveOfflineEnvelope(storageKey, {
      version: serverVersionRef.current,
      updatedAt: new Date().toISOString(),
      dirty: true,
      events: [],
      clock: resetClock,
    });
    setPushFeedback(null);
    setPushError(null);
    if (linkedMatch) {
      void persistEventsToServer(fresh, activeSport, {
        completeMatch: false,
        clockOverride: resetClock,
      });
    }
  }, [activeSport, canEdit, linkedMatch, persistEventsToServer, sessions]);

  const handlePushLiveScore = useCallback(() => {
    void persistEventsToServer(currentSession, activeSport, {
      completeMatch: false,
    });
  }, [activeSport, currentSession, persistEventsToServer]);

  const handleCompleteMatch = useCallback(() => {
    void persistEventsToServer(currentSession, activeSport, {
      completeMatch: true,
    });
  }, [activeSport, currentSession, persistEventsToServer]);

  const linkedLabel = linkedMatch
    ? `[${linkedMatch.status}] ${linkedMatch.sportName}: ${linkedMatch.teamA} vs ${linkedMatch.teamB} (v${serverVersion})`
    : null;

  return (
    <div
      className={
        currentSession.client.viewport === "mobile"
          ? "scorer-page-mobile-frame"
          : "scorer-page-pc-frame"
      }
    >
      {/* Match Selector Bar when multiple tournament matches exist */}
      {availableMatches.length > 0 && (
        <div className="scorer-match-selector-bar">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 12, textTransform: "uppercase", color: "#d4a038" }}>
              Fixture:
            </strong>
            <select
              className="scorer-sport-select"
              aria-label="Select match"
              value={linkedMatch ? String(linkedMatch.id) : ""}
              onChange={(e) => handleSelectMatch(Number(e.target.value))}
            >
              {availableMatches.map((m) => (
                <option key={m.id} value={m.id}>
                  [{m.status}] {m.sportName} · {m.teamA} vs {m.teamB} ({m.stage})
                </option>
              ))}
            </select>
            {canGoLiveHere && (
              <button
                type="button"
                className="action-btn"
                style={{ padding: "5px 12px", fontSize: 12 }}
                disabled={saving}
                onClick={handleGoLive}
              >
                {saving ? "Starting..." : "Go Live & Unlock Scorer"}
              </button>
            )}
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            {linkedMatch?.status === "LIVE"
              ? "● LIVE"
              : linkedMatch?.status || "SANDBOX"}{" "}
            · {syncStatusLabel}
          </span>
        </div>
      )}

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

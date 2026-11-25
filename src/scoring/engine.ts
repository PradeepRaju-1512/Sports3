import type {
  BaseEvent,
  ClientAction,
  MatchRoster,
  ScorerClientState,
  SportEvent,
  SportId,
  ViewportMode,
} from "./types.js";

/**
 * Pure deterministic event fold.
 * Skips any event marked `voided === true` so Undo preserves full audit history
 * while guaranteeing zero state drift across Mobile and PC viewports.
 */
export function foldEvents<
  TSportState,
  TEvent extends BaseEvent<string, unknown>,
>(
  initialState: TSportState,
  events: readonly TEvent[],
  reduceEvent: (state: TSportState, event: TEvent) => TSportState
): TSportState {
  let state = initialState;
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    if (ev.voided === true) continue;
    state = reduceEvent(state, ev);
  }
  return state;
}

export function createScorerEvent<
  TType extends string,
  TPayload extends Record<string, unknown>,
>(
  seq: number,
  matchClockMs: number,
  type: TType,
  payload: TPayload
): BaseEvent<TType, TPayload> {
  const randomSuffix = Math.random().toString(36).slice(2, 7);
  return {
    eventId: `ev-${Date.now()}-${seq}-${randomSuffix}`,
    seq,
    occurredAt: new Date().toISOString(),
    matchClockMs,
    type,
    payload,
    voided: false,
  };
}

export function createInitialScorerClientState<
  TSportState,
  TSportEvent extends SportEvent = SportEvent,
>(params: {
  matchId: string;
  sport: SportId;
  roster: MatchRoster;
  initialSportState: TSportState;
  events?: readonly TSportEvent[];
  reduceEvent: (state: TSportState, event: TSportEvent) => TSportState;
  viewport?: ViewportMode;
}): ScorerClientState<TSportState> {
  const all = params.events ? [...params.events] : [];
  const activeEvents = all.filter((ev) => ev.voided !== true);
  const sportState = foldEvents(
    params.initialSportState,
    all,
    params.reduceEvent
  );

  return {
    viewport: params.viewport ?? "pc",
    syncStatus: "synced",
    derived: {
      matchId: params.matchId,
      sport: params.sport,
      roster: params.roster,
      sportState,
      activeEvents,
      totalEventsCount: all.length,
      voidedEventsCount: all.length - activeEvents.length,
      canUndo: activeEvents.length > 0,
      lastUpdatedAt: new Date().toISOString(),
    },
    mobileUi: {
      drawerOpen: false,
      activeTab: "scorecard",
      editingEventId: null,
    },
    pcUi: {
      rightTab: "timeline",
      editingEventId: null,
      compactMode: false,
    },
  };
}

function rebuildDerived<TSportState, TSportEvent extends SportEvent>(
  client: ScorerClientState<TSportState>,
  nextEvents: TSportEvent[],
  initialSportState: TSportState,
  reduceEvent: (state: TSportState, event: TSportEvent) => TSportState
): ScorerClientState<TSportState> {
  const activeEvents = nextEvents.filter((ev) => ev.voided !== true);
  const sportState = foldEvents(initialSportState, nextEvents, reduceEvent);

  return {
    ...client,
    derived: {
      ...client.derived,
      sportState,
      activeEvents,
      totalEventsCount: nextEvents.length,
      voidedEventsCount: nextEvents.length - activeEvents.length,
      canUndo: activeEvents.length > 0,
      lastUpdatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Shared state transition engine used identically on Mobile and PC viewports.
 * Supports APPEND_EVENT, tombstone UNDO_LAST, mid-match EDIT_EVENT + full replay,
 * and UI/viewport/sync actions.
 */
export function applyClientAction<
  TSportState,
  TSportEvent extends SportEvent = SportEvent,
>(
  client: ScorerClientState<TSportState>,
  allEvents: readonly TSportEvent[],
  initialSportState: TSportState,
  reduceEvent: (state: TSportState, event: TSportEvent) => TSportState,
  action: ClientAction<TSportEvent>
): {
  client: ScorerClientState<TSportState>;
  allEvents: TSportEvent[];
} {
  switch (action.type) {
    case "APPEND_EVENT": {
      const nextSeq =
        action.event.seq > 0 ? action.event.seq : allEvents.length + 1;
      const appended = {
        ...action.event,
        seq: nextSeq,
        voided: action.event.voided ?? false,
      } as TSportEvent;
      const nextEvents = [...allEvents, appended];
      return {
        allEvents: nextEvents,
        client: rebuildDerived(
          client,
          nextEvents,
          initialSportState,
          reduceEvent
        ),
      };
    }

    case "UNDO_LAST": {
      let lastActiveIdx = -1;
      for (let i = allEvents.length - 1; i >= 0; i -= 1) {
        if (allEvents[i].voided !== true) {
          lastActiveIdx = i;
          break;
        }
      }
      if (lastActiveIdx === -1) {
        return { client, allEvents: [...allEvents] };
      }

      const nextEvents = allEvents.map((ev, idx) =>
        idx === lastActiveIdx ? ({ ...ev, voided: true } as TSportEvent) : ev
      );
      const voidedId = allEvents[lastActiveIdx].eventId;
      const nextClient = rebuildDerived(
        client,
        nextEvents,
        initialSportState,
        reduceEvent
      );

      return {
        allEvents: nextEvents,
        client: {
          ...nextClient,
          mobileUi:
            nextClient.mobileUi.editingEventId === voidedId
              ? { ...nextClient.mobileUi, editingEventId: null }
              : nextClient.mobileUi,
          pcUi:
            nextClient.pcUi.editingEventId === voidedId
              ? { ...nextClient.pcUi, editingEventId: null }
              : nextClient.pcUi,
        },
      };
    }

    case "EDIT_EVENT": {
      let found = false;
      const nextEvents = allEvents.map((ev) => {
        if (ev.eventId !== action.eventId) return ev;
        found = true;
        return {
          ...ev,
          payload: {
            ...(ev.payload as Record<string, unknown>),
            ...action.payloadPatch,
          },
        } as TSportEvent;
      });
      if (!found) {
        return { client, allEvents: [...allEvents] };
      }
      return {
        allEvents: nextEvents,
        client: rebuildDerived(
          client,
          nextEvents,
          initialSportState,
          reduceEvent
        ),
      };
    }

    case "SET_VIEWPORT": {
      return {
        allEvents: [...allEvents],
        client: {
          ...client,
          viewport: action.viewport,
        },
      };
    }

    case "SET_SYNC": {
      return {
        allEvents: [...allEvents],
        client: {
          ...client,
          syncStatus: action.status,
          syncMessage: action.message,
        },
      };
    }

    case "SET_MOBILE_UI": {
      return {
        allEvents: [...allEvents],
        client: {
          ...client,
          mobileUi: {
            ...client.mobileUi,
            ...action.patch,
          },
        },
      };
    }

    case "SET_PC_UI": {
      return {
        allEvents: [...allEvents],
        client: {
          ...client,
          pcUi: {
            ...client.pcUi,
            ...action.patch,
          },
        },
      };
    }
  }
}

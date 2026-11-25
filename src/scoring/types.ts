export type SportId =
  | "football"
  | "cricket"
  | "volleyball"
  | "kho_kho"
  | "kabaddi"
  | "badminton"
  | "table_tennis"
  | "carrom"
  | "chess";

export type Side = "A" | "B";

export interface PlayerProfile {
  id: string;
  name: string;
  number?: string;
  role?: string;
  side: Side;
}

export interface MatchRoster {
  teamAName: string;
  teamBName: string;
  playersA: PlayerProfile[];
  playersB: PlayerProfile[];
  venue?: string;
  stage?: string;
}

export interface BaseEvent<
  TType extends string = string,
  TPayload = Record<string, unknown>,
> {
  eventId: string;
  seq: number;
  occurredAt: string;
  matchClockMs: number;
  type: TType;
  payload: TPayload;
  voided?: boolean;
}

// --- 1. FOOTBALL EVENTS ---
export type FootballPeriod = "1H" | "HT" | "2H" | "ET1" | "ET2" | "PEN" | "FT";

export type FootballEvent =
  | BaseEvent<
      "GOAL",
      {
        side: Side;
        scorerId?: string;
        assistId?: string;
        minute?: number;
        isOwnGoal?: boolean;
        isPenalty?: boolean;
      }
    >
  | BaseEvent<
      "CARD",
      {
        side: Side;
        playerId?: string;
        card: "YELLOW" | "RED";
        minute?: number;
      }
    >
  | BaseEvent<
      "SUBSTITUTION",
      {
        side: Side;
        playerOutId?: string;
        playerInId?: string;
        minute?: number;
      }
    >
  | BaseEvent<
      "SHOT",
      {
        side: Side;
        playerId?: string;
        onTarget: boolean;
      }
    >
  | BaseEvent<
      "FOUL",
      {
        side: Side;
        playerId?: string;
      }
    >
  | BaseEvent<"CORNER", { side: Side }>
  | BaseEvent<"PERIOD_CHANGE", { period: FootballPeriod }>
  | BaseEvent<
      "PENALTY_SHOOTOUT",
      { side: Side; playerId?: string; scored: boolean }
    >;

// --- 2. CRICKET EVENTS ---
export type CricketExtraType = "NONE" | "WIDE" | "NO_BALL" | "BYE" | "LEG_BYE";
export type CricketDismissalKind =
  | "BOWLED"
  | "CAUGHT"
  | "LBW"
  | "RUN_OUT"
  | "STUMPED"
  | "HIT_WICKET";

export type CricketEvent =
  | BaseEvent<
      "BALL",
      {
        runsOffBat: number;
        extraType?: CricketExtraType;
        extraRuns?: number;
        isWicket?: boolean;
        dismissalKind?: CricketDismissalKind;
        dismissedRole?: "STRIKER" | "NON_STRIKER";
        nextBatterId?: string;
        batterId?: string;
        bowlerId?: string;
      }
    >
  | BaseEvent<
      "SET_LINEUP",
      {
        strikerId: string;
        nonStrikerId: string;
        bowlerId: string;
      }
    >
  | BaseEvent<"CHANGE_BOWLER", { bowlerId: string }>
  | BaseEvent<"SWAP_STRIKE", Record<string, never>>
  | BaseEvent<
      "END_INNINGS",
      {
        reason?: "ALL_OUT" | "OVERS_COMPLETED" | "DECLARED" | "TARGET_CHASED";
      }
    >
  | BaseEvent<"SET_OVERS_LIMIT", { oversLimit: number }>;

// --- 3. VOLLEYBALL EVENTS ---
export type VolleyballEvent =
  | BaseEvent<
      "POINT",
      {
        side: Side;
        rallyType?: "KILL" | "ACE" | "BLOCK" | "OPPONENT_ERROR" | "RALLY";
        playerId?: string;
      }
    >
  | BaseEvent<"ROTATE", { side: Side }>
  | BaseEvent<"TIMEOUT", { side: Side }>
  | BaseEvent<
      "SET_CONFIG",
      {
        bestOf: 3 | 5;
        targetPoints?: number;
        deciderTarget?: number;
      }
    >;

// --- 4. KHO KHO EVENTS ---
export type KhoKhoOutMethod =
  | "TOUCH"
  | "POLE_DIVE"
  | "OUT_OF_FIELD"
  | "LATE_ENTRY";

export type KhoKhoEvent =
  | BaseEvent<
      "OUT",
      {
        chaserSide: Side;
        chaserId?: string;
        defenderId?: string;
        method: KhoKhoOutMethod;
      }
    >
  | BaseEvent<"SWITCH_TURN", { nextChaserSide?: Side }>
  | BaseEvent<"END_INNINGS", Record<string, never>>;

// --- 5. KABADDI EVENTS ---
export type KabaddiHalf = "1ST" | "HT" | "2ND" | "FT";

export type KabaddiEvent =
  | BaseEvent<
      "RAID",
      {
        raidingSide: Side;
        raiderId?: string;
        touchPoints: number;
        bonusPoint: boolean;
        emptyRaid?: boolean;
      }
    >
  | BaseEvent<
      "TACKLE",
      {
        defendingSide: Side;
        tacklerId?: string;
        isSuperTackle?: boolean;
      }
    >
  | BaseEvent<
      "ALL_OUT",
      {
        inflictedBy: Side;
        bonusPoints?: number;
      }
    >
  | BaseEvent<
      "TECHNICAL_POINT",
      {
        side: Side;
        points?: number;
        reason?: string;
      }
    >
  | BaseEvent<"HALF_CHANGE", { half: KabaddiHalf }>;

// --- 6. BADMINTON EVENTS ---
export type BadmintonEvent =
  | BaseEvent<
      "POINT",
      {
        side: Side;
        shotType?: "SMASH" | "DROP" | "NET" | "SERVICE_ACE" | "ERROR";
        playerId?: string;
      }
    >
  | BaseEvent<"SERVICE_FAULT", { faultingSide: Side }>
  | BaseEvent<
      "SET_CONFIG",
      {
        bestOf: 1 | 3;
        targetPoints?: number;
        capPoints?: number;
      }
    >;

// --- 7. TABLE TENNIS EVENTS ---
export type TableTennisEvent =
  | BaseEvent<
      "POINT",
      {
        side: Side;
        shotType?: "FOREHAND" | "BACKHAND" | "SERVICE_ACE" | "ERROR";
        playerId?: string;
      }
    >
  | BaseEvent<"TIMEOUT", { side: Side }>
  | BaseEvent<
      "SET_CONFIG",
      {
        bestOf: 3 | 5 | 7;
        targetPoints?: number;
        servesPerTurn?: number;
      }
    >;

// --- 8. CARROM EVENTS ---
export type CarromEvent =
  | BaseEvent<
      "POCKET",
      {
        side: Side;
        piece: "WHITE" | "BLACK" | "QUEEN";
        count?: number;
      }
    >
  | BaseEvent<
      "QUEEN_COVER",
      {
        side: Side;
        covered: boolean;
      }
    >
  | BaseEvent<
      "FOUL",
      {
        side: Side;
        penaltyPieces?: number;
      }
    >
  | BaseEvent<
      "END_BOARD",
      {
        winner: Side;
        points: number;
        queenBonus?: boolean;
      }
    >
  | BaseEvent<
      "SET_CONFIG",
      {
        targetPoints?: number;
        maxBoards?: number;
      }
    >;

// --- 9. CHESS EVENTS ---
export type ChessResultOutcome = "A_WIN" | "B_WIN" | "DRAW";
export type ChessResultReason =
  | "CHECKMATE"
  | "RESIGNATION"
  | "TIMEOUT"
  | "STALEMATE"
  | "AGREED_DRAW"
  | "REPETITION";

export type ChessEvent =
  | BaseEvent<
      "MOVE",
      {
        side: Side;
        san: string;
        clockAfterMs?: number;
        capture?: boolean;
        check?: boolean;
      }
    >
  | BaseEvent<
      "CLOCK_TICK",
      {
        side: Side;
        elapsedMs: number;
      }
    >
  | BaseEvent<"OFFER_DRAW", { side: Side }>
  | BaseEvent<
      "RESULT",
      {
        outcome: ChessResultOutcome;
        reason: ChessResultReason;
      }
    >
  | BaseEvent<
      "SET_TIME_CONTROL",
      {
        initialMs: number;
        incrementMs: number;
      }
    >;

export type SportEvent =
  | FootballEvent
  | CricketEvent
  | VolleyballEvent
  | KhoKhoEvent
  | KabaddiEvent
  | BadmintonEvent
  | TableTennisEvent
  | CarromEvent
  | ChessEvent;

export type ViewportMode = "mobile" | "pc";
export type MobileDrawerTab = "scorecard" | "timeline" | "stats" | "controls";
export type PcRightTab = "timeline" | "scorecard" | "stats";

export interface DerivedMatchState<TSportState = unknown> {
  matchId: string;
  sport: SportId;
  roster: MatchRoster;
  sportState: TSportState;
  activeEvents: SportEvent[];
  totalEventsCount: number;
  voidedEventsCount: number;
  canUndo: boolean;
  lastUpdatedAt: string;
}

export interface ScorerClientState<TSportState = unknown> {
  viewport: ViewportMode;
  syncStatus: "synced" | "syncing" | "offline" | "error";
  syncMessage?: string;
  derived: DerivedMatchState<TSportState>;
  mobileUi: {
    drawerOpen: boolean;
    activeTab: MobileDrawerTab;
    editingEventId: string | null;
  };
  pcUi: {
    rightTab: PcRightTab;
    editingEventId: string | null;
    compactMode: boolean;
  };
}

export type ClientAction<TSportEvent extends SportEvent = SportEvent> =
  | { type: "APPEND_EVENT"; event: TSportEvent }
  | { type: "UNDO_LAST" }
  | {
      type: "EDIT_EVENT";
      eventId: string;
      payloadPatch: Record<string, unknown>;
    }
  | { type: "SET_VIEWPORT"; viewport: ViewportMode }
  | {
      type: "SET_SYNC";
      status: ScorerClientState["syncStatus"];
      message?: string;
    }
  | { type: "SET_MOBILE_UI"; patch: Partial<ScorerClientState["mobileUi"]> }
  | { type: "SET_PC_UI"; patch: Partial<ScorerClientState["pcUi"]> };

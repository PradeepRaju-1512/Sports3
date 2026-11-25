import type {
  BadmintonEvent,
  CarromEvent,
  ChessEvent,
  ChessResultReason,
  CricketEvent,
  FootballEvent,
  FootballPeriod,
  KabaddiEvent,
  KabaddiHalf,
  KhoKhoEvent,
  MatchRoster,
  Side,
  SportEvent,
  SportId,
  TableTennisEvent,
  VolleyballEvent,
} from "./types";

// ============================================================================
// DERIVED STATE INTERFACES FOR ALL 9 SPORTS
// ============================================================================

export interface FootballState {
  scoreA: number;
  scoreB: number;
  period: FootballPeriod;
  shotsA: number;
  shotsB: number;
  shotsOnTargetA: number;
  shotsOnTargetB: number;
  foulsA: number;
  foulsB: number;
  cornersA: number;
  cornersB: number;
  yellowCardsA: number;
  yellowCardsB: number;
  redCardsA: number;
  redCardsB: number;
  penaltiesA: number;
  penaltiesB: number;
  goalLog: Array<{
    side: Side;
    scorerId?: string;
    minute?: number;
    isOwnGoal?: boolean;
    isPenalty?: boolean;
  }>;
  cardLog: Array<{
    side: Side;
    playerId?: string;
    card: "YELLOW" | "RED";
    minute?: number;
  }>;
  winner: Side | "DRAW" | null;
  statusText: string;
}

export interface CricketBatterLine {
  playerId: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  dismissal?: string;
}

export interface CricketBowlerLine {
  playerId: string;
  legalBalls: number;
  runsConceded: number;
  wickets: number;
  wides: number;
  noBalls: number;
}

export interface CricketInningsSummary {
  battingSide: Side;
  runs: number;
  wickets: number;
  legalBalls: number;
  oversLabel: string;
}

export interface CricketState {
  inningsNumber: 1 | 2;
  battingSide: Side;
  bowlingSide: Side;
  oversLimit: number;
  runs: number;
  wickets: number;
  legalBalls: number;
  oversLabel: string;
  extras: {
    wides: number;
    noBalls: number;
    byes: number;
    legByes: number;
    total: number;
  };
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
  freeHit: boolean;
  thisOver: string[];
  batters: Record<string, CricketBatterLine>;
  bowlers: Record<string, CricketBowlerLine>;
  firstInnings: CricketInningsSummary | null;
  target: number | null;
  isMatchComplete: boolean;
  winner: Side | "TIE" | null;
  statusText: string;
}

export interface VolleyballState {
  bestOf: 3 | 5;
  targetPoints: number;
  deciderTarget: number;
  currentSetNumber: number;
  setsWonA: number;
  setsWonB: number;
  pointsA: number;
  pointsB: number;
  servingSide: Side;
  rotationA: number;
  rotationB: number;
  timeoutsA: number;
  timeoutsB: number;
  killsA: number;
  killsB: number;
  acesA: number;
  acesB: number;
  blocksA: number;
  blocksB: number;
  setHistory: Array<{ setNumber: number; pointsA: number; pointsB: number }>;
  winner: Side | null;
  statusText: string;
}

export interface KhoKhoState {
  innings: 1 | 2;
  turnInInnings: 1 | 2;
  chaserSide: Side;
  defenderSide: Side;
  scoreA: number;
  scoreB: number;
  turnOuts: number;
  outLog: Array<{
    innings: number;
    turn: number;
    chaserSide: Side;
    method: string;
    defenderId?: string;
    chaserId?: string;
  }>;
  isMatchComplete: boolean;
  winner: Side | "DRAW" | null;
  statusText: string;
}

export interface KabaddiState {
  scoreA: number;
  scoreB: number;
  half: KabaddiHalf;
  raidPointsA: number;
  raidPointsB: number;
  tacklePointsA: number;
  tacklePointsB: number;
  bonusPointsA: number;
  bonusPointsB: number;
  allOutPointsA: number;
  allOutPointsB: number;
  allOutsInflictedA: number;
  allOutsInflictedB: number;
  superRaidsA: number;
  superRaidsB: number;
  superTacklesA: number;
  superTacklesB: number;
  activeDefendersA: number;
  activeDefendersB: number;
  consecutiveEmptyRaidsA: number;
  consecutiveEmptyRaidsB: number;
  doOrDieSide: Side | null;
  winner: Side | "DRAW" | null;
  statusText: string;
}

export interface BadmintonState {
  bestOf: 1 | 3;
  targetPoints: number;
  capPoints: number;
  currentGameNumber: number;
  gamesWonA: number;
  gamesWonB: number;
  pointsA: number;
  pointsB: number;
  servingSide: Side;
  serviceCourt: "RIGHT" | "LEFT";
  smashesA: number;
  smashesB: number;
  gameHistory: Array<{ gameNumber: number; pointsA: number; pointsB: number }>;
  winner: Side | null;
  statusText: string;
}

export interface TableTennisState {
  bestOf: 3 | 5 | 7;
  targetPoints: number;
  servesPerTurn: number;
  currentGameNumber: number;
  gamesWonA: number;
  gamesWonB: number;
  pointsA: number;
  pointsB: number;
  initialServer: Side;
  servingSide: Side;
  timeoutsUsedA: number;
  timeoutsUsedB: number;
  gameHistory: Array<{ gameNumber: number; pointsA: number; pointsB: number }>;
  winner: Side | null;
  statusText: string;
}

export interface CarromState {
  targetPoints: number;
  maxBoards: number;
  boardNumber: number;
  scoreA: number;
  scoreB: number;
  boardWhitePocketed: number;
  boardBlackPocketed: number;
  queenState: "ON_BOARD" | "PENDING_A" | "PENDING_B" | "COVERED_A" | "COVERED_B";
  foulsA: number;
  foulsB: number;
  boardHistory: Array<{
    boardNumber: number;
    winner: Side;
    points: number;
    queenBonus: boolean;
  }>;
  winner: Side | "DRAW" | null;
  statusText: string;
}

export interface ChessState {
  whiteSide: Side;
  blackSide: Side;
  turn: Side;
  moveNumber: number;
  initialMs: number;
  incrementMs: number;
  clockMsA: number;
  clockMsB: number;
  moves: Array<{
    moveNumber: number;
    side: Side;
    san: string;
    clockAfterMs: number;
  }>;
  drawOfferedBy: Side | null;
  result: "*" | "1-0" | "0-1" | "1/2-1/2";
  resultReason: ChessResultReason | null;
  winner: Side | "DRAW" | null;
  statusText: string;
}

export type AnySportState =
  | FootballState
  | CricketState
  | VolleyballState
  | KhoKhoState
  | KabaddiState
  | BadmintonState
  | TableTennisState
  | CarromState
  | ChessState;

// ============================================================================
// HELPERS
// ============================================================================

function oppositeSide(side: Side): Side {
  return side === "A" ? "B" : "A";
}

function formatOvers(legalBalls: number): string {
  const completed = Math.floor(legalBalls / 6);
  const rem = legalBalls % 6;
  return `${completed}.${rem}`;
}

function getPlayerName(roster: MatchRoster, playerId?: string): string {
  if (!playerId) return "";
  const all = [...roster.playersA, ...roster.playersB];
  return all.find((p) => p.id === playerId)?.name || playerId;
}

function teamLabel(roster: MatchRoster, side: Side): string {
  return side === "A" ? roster.teamAName : roster.teamBName;
}

// ============================================================================
// 1. FOOTBALL
// ============================================================================

export function createInitialFootballState(): FootballState {
  return {
    scoreA: 0,
    scoreB: 0,
    period: "1H",
    shotsA: 0,
    shotsB: 0,
    shotsOnTargetA: 0,
    shotsOnTargetB: 0,
    foulsA: 0,
    foulsB: 0,
    cornersA: 0,
    cornersB: 0,
    yellowCardsA: 0,
    yellowCardsB: 0,
    redCardsA: 0,
    redCardsB: 0,
    penaltiesA: 0,
    penaltiesB: 0,
    goalLog: [],
    cardLog: [],
    winner: null,
    statusText: "1st Half underway",
  };
}

export function reduceFootball(
  state: FootballState,
  event: FootballEvent
): FootballState {
  switch (event.type) {
    case "GOAL": {
      const creditedSide = event.payload.isOwnGoal
        ? oppositeSide(event.payload.side)
        : event.payload.side;
      const scoreA = state.scoreA + (creditedSide === "A" ? 1 : 0);
      const scoreB = state.scoreB + (creditedSide === "B" ? 1 : 0);
      return {
        ...state,
        scoreA,
        scoreB,
        shotsA:
          state.shotsA + (!event.payload.isOwnGoal && creditedSide === "A" ? 1 : 0),
        shotsB:
          state.shotsB + (!event.payload.isOwnGoal && creditedSide === "B" ? 1 : 0),
        shotsOnTargetA:
          state.shotsOnTargetA +
          (!event.payload.isOwnGoal && creditedSide === "A" ? 1 : 0),
        shotsOnTargetB:
          state.shotsOnTargetB +
          (!event.payload.isOwnGoal && creditedSide === "B" ? 1 : 0),
        goalLog: [
          ...state.goalLog,
          {
            side: creditedSide,
            scorerId: event.payload.scorerId,
            minute: event.payload.minute,
            isOwnGoal: event.payload.isOwnGoal,
            isPenalty: event.payload.isPenalty,
          },
        ],
        statusText: `${state.period} · Score ${scoreA}–${scoreB}`,
      };
    }

    case "CARD": {
      const isA = event.payload.side === "A";
      const isYellow = event.payload.card === "YELLOW";
      return {
        ...state,
        yellowCardsA: state.yellowCardsA + (isA && isYellow ? 1 : 0),
        yellowCardsB: state.yellowCardsB + (!isA && isYellow ? 1 : 0),
        redCardsA: state.redCardsA + (isA && !isYellow ? 1 : 0),
        redCardsB: state.redCardsB + (!isA && !isYellow ? 1 : 0),
        cardLog: [
          ...state.cardLog,
          {
            side: event.payload.side,
            playerId: event.payload.playerId,
            card: event.payload.card,
            minute: event.payload.minute,
          },
        ],
      };
    }

    case "SHOT": {
      const isA = event.payload.side === "A";
      return {
        ...state,
        shotsA: state.shotsA + (isA ? 1 : 0),
        shotsB: state.shotsB + (!isA ? 1 : 0),
        shotsOnTargetA:
          state.shotsOnTargetA + (isA && event.payload.onTarget ? 1 : 0),
        shotsOnTargetB:
          state.shotsOnTargetB + (!isA && event.payload.onTarget ? 1 : 0),
      };
    }

    case "FOUL":
      return {
        ...state,
        foulsA: state.foulsA + (event.payload.side === "A" ? 1 : 0),
        foulsB: state.foulsB + (event.payload.side === "B" ? 1 : 0),
      };

    case "CORNER":
      return {
        ...state,
        cornersA: state.cornersA + (event.payload.side === "A" ? 1 : 0),
        cornersB: state.cornersB + (event.payload.side === "B" ? 1 : 0),
      };

    case "PENALTY_SHOOTOUT": {
      const penaltiesA =
        state.penaltiesA +
        (event.payload.side === "A" && event.payload.scored ? 1 : 0);
      const penaltiesB =
        state.penaltiesB +
        (event.payload.side === "B" && event.payload.scored ? 1 : 0);
      return {
        ...state,
        penaltiesA,
        penaltiesB,
        statusText: `Penalties ${penaltiesA}–${penaltiesB} (${state.scoreA}–${state.scoreB})`,
      };
    }

    case "PERIOD_CHANGE": {
      const period = event.payload.period;
      let winner: FootballState["winner"] = state.winner;
      let statusText = `Period: ${period}`;
      if (period === "FT") {
        if (state.scoreA > state.scoreB) winner = "A";
        else if (state.scoreB > state.scoreA) winner = "B";
        else if (state.penaltiesA > state.penaltiesB) winner = "A";
        else if (state.penaltiesB > state.penaltiesA) winner = "B";
        else winner = "DRAW";
        statusText =
          winner === "DRAW"
            ? `Full Time · Draw ${state.scoreA}–${state.scoreB}`
            : `Full Time · Side ${winner} won`;
      } else if (period === "HT") {
        statusText = `Half Time · ${state.scoreA}–${state.scoreB}`;
      }
      return { ...state, period, winner, statusText };
    }

    case "SUBSTITUTION":
      return state;
  }
}

// ============================================================================
// 2. CRICKET
// ============================================================================

export function createInitialCricketState(roster?: MatchRoster): CricketState {
  const pA = roster?.playersA || [];
  const pB = roster?.playersB || [];
  const strikerId = pA[0]?.id || "A1";
  const nonStrikerId = pA[1]?.id || "A2";
  const bowlerId = pB[0]?.id || "B1";

  return {
    inningsNumber: 1,
    battingSide: "A",
    bowlingSide: "B",
    oversLimit: 15,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    oversLabel: "0.0",
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, total: 0 },
    strikerId,
    nonStrikerId,
    bowlerId,
    freeHit: false,
    thisOver: [],
    batters: {
      [strikerId]: {
        playerId: strikerId,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        out: false,
      },
      [nonStrikerId]: {
        playerId: nonStrikerId,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        out: false,
      },
    },
    bowlers: {
      [bowlerId]: {
        playerId: bowlerId,
        legalBalls: 0,
        runsConceded: 0,
        wickets: 0,
        wides: 0,
        noBalls: 0,
      },
    },
    firstInnings: null,
    target: null,
    isMatchComplete: false,
    winner: null,
    statusText: "1st Innings underway",
  };
}

function ensureBatter(
  batters: Record<string, CricketBatterLine>,
  id: string
): CricketBatterLine {
  return (
    batters[id] || {
      playerId: id,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      out: false,
    }
  );
}

function ensureBowler(
  bowlers: Record<string, CricketBowlerLine>,
  id: string
): CricketBowlerLine {
  return (
    bowlers[id] || {
      playerId: id,
      legalBalls: 0,
      runsConceded: 0,
      wickets: 0,
      wides: 0,
      noBalls: 0,
    }
  );
}

function pickNextBatterId(
  batters: Record<string, CricketBatterLine>,
  battingSide: Side,
  roster?: MatchRoster
): string {
  const pool = battingSide === "A" ? roster?.playersA : roster?.playersB;
  if (pool && pool.length > 0) {
    const unused = pool.find((p) => !batters[p.id]);
    if (unused) return unused.id;
  }
  let idx = Object.keys(batters).length + 1;
  while (batters[`${battingSide}${idx}`]) idx += 1;
  return `${battingSide}${idx}`;
}

export function reduceCricket(
  state: CricketState,
  event: CricketEvent,
  roster?: MatchRoster
): CricketState {
  switch (event.type) {
    case "SET_OVERS_LIMIT":
      return {
        ...state,
        oversLimit: Math.max(1, Math.round(event.payload.oversLimit || 15)),
      };

    case "SET_LINEUP": {
      const batters = { ...state.batters };
      batters[event.payload.strikerId] = ensureBatter(
        batters,
        event.payload.strikerId
      );
      batters[event.payload.nonStrikerId] = ensureBatter(
        batters,
        event.payload.nonStrikerId
      );
      const bowlers = { ...state.bowlers };
      bowlers[event.payload.bowlerId] = ensureBowler(
        bowlers,
        event.payload.bowlerId
      );
      return {
        ...state,
        strikerId: event.payload.strikerId,
        nonStrikerId: event.payload.nonStrikerId,
        bowlerId: event.payload.bowlerId,
        batters,
        bowlers,
      };
    }

    case "CHANGE_BOWLER": {
      const bowlers = { ...state.bowlers };
      bowlers[event.payload.bowlerId] = ensureBowler(
        bowlers,
        event.payload.bowlerId
      );
      return {
        ...state,
        bowlerId: event.payload.bowlerId,
        bowlers,
      };
    }

    case "SWAP_STRIKE":
      return {
        ...state,
        strikerId: state.nonStrikerId,
        nonStrikerId: state.strikerId,
      };

    case "END_INNINGS": {
      if (state.inningsNumber === 1) {
        const nextBatting = oppositeSide(state.battingSide);
        const nextBowling = state.battingSide;
        const nextPool =
          nextBatting === "A" ? roster?.playersA : roster?.playersB;
        const bowlPool =
          nextBowling === "A" ? roster?.playersA : roster?.playersB;
        const strikerId = nextPool?.[0]?.id || `${nextBatting}1`;
        const nonStrikerId = nextPool?.[1]?.id || `${nextBatting}2`;
        const bowlerId = bowlPool?.[0]?.id || `${nextBowling}1`;
        const target = state.runs + 1;

        return {
          ...state,
          inningsNumber: 2,
          battingSide: nextBatting,
          bowlingSide: nextBowling,
          firstInnings: {
            battingSide: state.battingSide,
            runs: state.runs,
            wickets: state.wickets,
            legalBalls: state.legalBalls,
            oversLabel: state.oversLabel,
          },
          target,
          runs: 0,
          wickets: 0,
          legalBalls: 0,
          oversLabel: "0.0",
          extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, total: 0 },
          strikerId,
          nonStrikerId,
          bowlerId,
          freeHit: false,
          thisOver: [],
          batters: {
            [strikerId]: {
              playerId: strikerId,
              runs: 0,
              balls: 0,
              fours: 0,
              sixes: 0,
              out: false,
            },
            [nonStrikerId]: {
              playerId: nonStrikerId,
              runs: 0,
              balls: 0,
              fours: 0,
              sixes: 0,
              out: false,
            },
          },
          bowlers: {
            [bowlerId]: {
              playerId: bowlerId,
              legalBalls: 0,
              runsConceded: 0,
              wickets: 0,
              wides: 0,
              noBalls: 0,
            },
          },
          statusText: `2nd Innings · Target ${target}`,
        };
      }

      // End of 2nd innings -> settle match
      const target = state.target ?? 0;
      let winner: CricketState["winner"] = null;
      let statusText = "Match Completed";
      if (state.runs >= target && target > 0) {
        winner = state.battingSide;
        statusText = `Side ${state.battingSide} won by ${Math.max(1, 10 - state.wickets)} wkts`;
      } else if (state.runs === target - 1 && target > 0) {
        winner = "TIE";
        statusText = "Match Tied";
      } else {
        winner = state.bowlingSide;
        statusText = `Side ${state.bowlingSide} won by ${Math.max(1, target - 1 - state.runs)} runs`;
      }
      return {
        ...state,
        isMatchComplete: true,
        winner,
        statusText,
      };
    }

    case "BALL": {
      if (state.isMatchComplete) return state;

      const extraType = event.payload.extraType || "NONE";
      const rawBat = Math.max(0, Math.round(Number(event.payload.runsOffBat) || 0));
      const rawExtra = Math.max(0, Math.round(Number(event.payload.extraRuns) || 0));

      const isWide = extraType === "WIDE";
      const isNoBall = extraType === "NO_BALL";
      const isBye = extraType === "BYE";
      const isLegBye = extraType === "LEG_BYE";
      const isLegal = !isWide && !isNoBall;

      // Support smooth mid-match EDIT_EVENT when converting bat runs <-> bye/leg-bye
      const runsOffBat = isBye || isLegBye || isWide ? 0 : rawBat;
      const byeOrLegByeRuns =
        isBye || isLegBye ? (rawExtra > 0 ? rawExtra : rawBat) : 0;
      const wideExtraRuns = isWide ? 1 + rawExtra : 0;
      const noBallExtraRuns = isNoBall ? 1 + rawExtra : 0;

      const totalBallRuns =
        runsOffBat + byeOrLegByeRuns + wideExtraRuns + noBallExtraRuns;
      const runningRuns = isWide
        ? rawExtra
        : isNoBall
          ? runsOffBat + rawExtra
          : isBye || isLegBye
            ? byeOrLegByeRuns
            : runsOffBat;

      const activeStrikerId = event.payload.batterId || state.strikerId;
      const activeBowlerId = event.payload.bowlerId || state.bowlerId;

      const batters = { ...state.batters };
      const striker = { ...ensureBatter(batters, activeStrikerId) };
      if (!isWide) {
        striker.balls += 1;
      }
      striker.runs += runsOffBat;
      if (runsOffBat === 4) striker.fours += 1;
      if (runsOffBat === 6) striker.sixes += 1;
      batters[activeStrikerId] = striker;

      const bowlers = { ...state.bowlers };
      const bowler = { ...ensureBowler(bowlers, activeBowlerId) };
      if (isLegal) bowler.legalBalls += 1;
      if (isWide) bowler.wides += 1;
      if (isNoBall) bowler.noBalls += 1;
      // Bowler is charged for bat runs + wides + no-balls (not byes/leg-byes)
      bowler.runsConceded += runsOffBat + wideExtraRuns + noBallExtraRuns;

      // Free hit protection: only RUN_OUT counts on a free hit
      const dismissalKind = event.payload.dismissalKind || "BOWLED";
      const wicketValid =
        Boolean(event.payload.isWicket) &&
        (!state.freeHit || dismissalKind === "RUN_OUT");

      let nextWickets = state.wickets;
      let nextStrikerId = activeStrikerId;
      let nextNonStrikerId = state.nonStrikerId;

      if (wicketValid) {
        nextWickets += 1;
        if (dismissalKind !== "RUN_OUT") {
          bowler.wickets += 1;
        }
        const dismissedId =
          event.payload.dismissedRole === "NON_STRIKER"
            ? nextNonStrikerId
            : nextStrikerId;
        const dismissedBatter = { ...ensureBatter(batters, dismissedId) };
        dismissedBatter.out = true;
        dismissedBatter.dismissal = dismissalKind.replace("_", " ");
        batters[dismissedId] = dismissedBatter;

        const incomingId =
          event.payload.nextBatterId ||
          pickNextBatterId(batters, state.battingSide, roster);
        batters[incomingId] = ensureBatter(batters, incomingId);

        if (event.payload.dismissedRole === "NON_STRIKER") {
          nextNonStrikerId = incomingId;
        } else {
          nextStrikerId = incomingId;
        }
      }

      bowlers[activeBowlerId] = bowler;

      // Strike rotation on odd runs
      if (runningRuns % 2 === 1) {
        const tmp = nextStrikerId;
        nextStrikerId = nextNonStrikerId;
        nextNonStrikerId = tmp;
      }

      const prevLegalBalls = state.legalBalls;
      const nextLegalBalls = prevLegalBalls + (isLegal ? 1 : 0);
      const completedOver =
        isLegal && nextLegalBalls > 0 && nextLegalBalls % 6 === 0;

      // Start fresh thisOver array if previous over just finished before this delivery
      const startingNewOver =
        prevLegalBalls > 0 &&
        prevLegalBalls % 6 === 0 &&
        state.thisOver.length > 0 &&
        state.thisOver.filter(
          (tok) => !tok.startsWith("Wd") && !tok.startsWith("Nb")
        ).length >= 6;

      let token = String(runsOffBat);
      if (isWide) token = rawExtra > 0 ? `Wd+${rawExtra}` : "Wd";
      else if (isNoBall)
        token = runsOffBat > 0 ? `Nb+${runsOffBat}` : rawExtra > 0 ? `Nb+${rawExtra}` : "Nb";
      else if (isBye) token = `${byeOrLegByeRuns}B`;
      else if (isLegBye) token = `${byeOrLegByeRuns}LB`;
      if (wicketValid) token = token === "0" ? "W" : `${token}+W`;

      const nextThisOver = startingNewOver
        ? [token]
        : [...state.thisOver, token];

      // End-of-over strike rotation
      if (completedOver) {
        const tmp = nextStrikerId;
        nextStrikerId = nextNonStrikerId;
        nextNonStrikerId = tmp;
      }

      const nextFreeHit = isNoBall ? true : isLegal ? false : state.freeHit;
      const nextRuns = state.runs + totalBallRuns;
      const nextExtras = {
        wides: state.extras.wides + wideExtraRuns,
        noBalls: state.extras.noBalls + noBallExtraRuns,
        byes: state.extras.byes + (isBye ? byeOrLegByeRuns : 0),
        legByes: state.extras.legByes + (isLegBye ? byeOrLegByeRuns : 0),
        total:
          state.extras.total +
          wideExtraRuns +
          noBallExtraRuns +
          byeOrLegByeRuns,
      };

      const maxBalls = state.oversLimit * 6;
      const oversLabel = formatOvers(nextLegalBalls);
      let isMatchComplete: boolean = state.isMatchComplete;
      let winner = state.winner;
      let statusText =
        state.inningsNumber === 1
          ? `1st Innings · ${nextRuns}/${nextWickets} (${oversLabel}/${state.oversLimit} ov)`
          : `2nd Innings · Need ${Math.max(0, (state.target || 0) - nextRuns)} off ${Math.max(0, maxBalls - nextLegalBalls)} balls`;

      if (state.inningsNumber === 2 && state.target !== null) {
        if (nextRuns >= state.target) {
          isMatchComplete = true;
          winner = state.battingSide;
          statusText = `Side ${state.battingSide} won by ${Math.max(1, 10 - nextWickets)} wickets`;
        } else if (nextWickets >= 10 || nextLegalBalls >= maxBalls) {
          isMatchComplete = true;
          if (nextRuns === state.target - 1) {
            winner = "TIE";
            statusText = "Match Tied";
          } else {
            winner = state.bowlingSide;
            statusText = `Side ${state.bowlingSide} won by ${state.target - 1 - nextRuns} runs`;
          }
        }
      } else if (nextWickets >= 10 || nextLegalBalls >= maxBalls) {
        statusText = `1st Innings Complete (${nextRuns}/${nextWickets}) · Ready for 2nd Innings`;
      }

      return {
        ...state,
        runs: nextRuns,
        wickets: nextWickets,
        legalBalls: nextLegalBalls,
        oversLabel,
        extras: nextExtras,
        strikerId: nextStrikerId,
        nonStrikerId: nextNonStrikerId,
        bowlerId: activeBowlerId,
        freeHit: nextFreeHit,
        thisOver: nextThisOver,
        batters,
        bowlers,
        isMatchComplete,
        winner,
        statusText,
      };
    }
  }
}

// ============================================================================
// 3. VOLLEYBALL
// ============================================================================

export function createInitialVolleyballState(): VolleyballState {
  return {
    bestOf: 3,
    targetPoints: 25,
    deciderTarget: 15,
    currentSetNumber: 1,
    setsWonA: 0,
    setsWonB: 0,
    pointsA: 0,
    pointsB: 0,
    servingSide: "A",
    rotationA: 1,
    rotationB: 1,
    timeoutsA: 0,
    timeoutsB: 0,
    killsA: 0,
    killsB: 0,
    acesA: 0,
    acesB: 0,
    blocksA: 0,
    blocksB: 0,
    setHistory: [],
    winner: null,
    statusText: "Set 1 · Side A serving",
  };
}

export function reduceVolleyball(
  state: VolleyballState,
  event: VolleyballEvent
): VolleyballState {
  switch (event.type) {
    case "SET_CONFIG":
      return {
        ...state,
        bestOf: event.payload.bestOf,
        targetPoints: event.payload.targetPoints ?? state.targetPoints,
        deciderTarget: event.payload.deciderTarget ?? state.deciderTarget,
      };

    case "ROTATE":
      return {
        ...state,
        rotationA:
          event.payload.side === "A" ? (state.rotationA % 6) + 1 : state.rotationA,
        rotationB:
          event.payload.side === "B" ? (state.rotationB % 6) + 1 : state.rotationB,
      };

    case "TIMEOUT":
      return {
        ...state,
        timeoutsA: state.timeoutsA + (event.payload.side === "A" ? 1 : 0),
        timeoutsB: state.timeoutsB + (event.payload.side === "B" ? 1 : 0),
      };

    case "POINT": {
      if (state.winner) return state;
      const side = event.payload.side;
      const pointsA = state.pointsA + (side === "A" ? 1 : 0);
      const pointsB = state.pointsB + (side === "B" ? 1 : 0);
      const isSideOut = state.servingSide !== side;

      const rotationA =
        isSideOut && side === "A" ? (state.rotationA % 6) + 1 : state.rotationA;
      const rotationB =
        isSideOut && side === "B" ? (state.rotationB % 6) + 1 : state.rotationB;

      const rt = event.payload.rallyType;
      const killsA = state.killsA + (side === "A" && rt === "KILL" ? 1 : 0);
      const killsB = state.killsB + (side === "B" && rt === "KILL" ? 1 : 0);
      const acesA = state.acesA + (side === "A" && rt === "ACE" ? 1 : 0);
      const acesB = state.acesB + (side === "B" && rt === "ACE" ? 1 : 0);
      const blocksA = state.blocksA + (side === "A" && rt === "BLOCK" ? 1 : 0);
      const blocksB = state.blocksB + (side === "B" && rt === "BLOCK" ? 1 : 0);

      const isDecider = state.currentSetNumber === state.bestOf;
      const target = isDecider ? state.deciderTarget : state.targetPoints;
      const lead = Math.abs(pointsA - pointsB);
      const setWonBy: Side | null =
        pointsA >= target && lead >= 2
          ? "A"
          : pointsB >= target && lead >= 2
            ? "B"
            : null;

      if (setWonBy) {
        const setsWonA = state.setsWonA + (setWonBy === "A" ? 1 : 0);
        const setsWonB = state.setsWonB + (setWonBy === "B" ? 1 : 0);
        const setHistory = [
          ...state.setHistory,
          { setNumber: state.currentSetNumber, pointsA, pointsB },
        ];
        const neededSets = Math.ceil(state.bestOf / 2);
        const winner: Side | null =
          setsWonA >= neededSets
            ? "A"
            : setsWonB >= neededSets
              ? "B"
              : null;

        return {
          ...state,
          setsWonA,
          setsWonB,
          setHistory,
          pointsA: winner ? pointsA : 0,
          pointsB: winner ? pointsB : 0,
          currentSetNumber: winner
            ? state.currentSetNumber
            : state.currentSetNumber + 1,
          servingSide: setWonBy,
          rotationA: winner ? rotationA : 1,
          rotationB: winner ? rotationB : 1,
          timeoutsA: winner ? state.timeoutsA : 0,
          timeoutsB: winner ? state.timeoutsB : 0,
          killsA,
          killsB,
          acesA,
          acesB,
          blocksA,
          blocksB,
          winner,
          statusText: winner
            ? `Match Won by Side ${winner} (${setsWonA}–${setsWonB})`
            : `Set ${state.currentSetNumber + 1} · Sets ${setsWonA}–${setsWonB}`,
        };
      }

      return {
        ...state,
        pointsA,
        pointsB,
        servingSide: side,
        rotationA,
        rotationB,
        killsA,
        killsB,
        acesA,
        acesB,
        blocksA,
        blocksB,
        statusText: `Set ${state.currentSetNumber} · Side ${side} serving (Rot ${side === "A" ? rotationA : rotationB})`,
      };
    }
  }
}

// ============================================================================
// 4. KHO KHO
// ============================================================================

export function createInitialKhoKhoState(): KhoKhoState {
  return {
    innings: 1,
    turnInInnings: 1,
    chaserSide: "A",
    defenderSide: "B",
    scoreA: 0,
    scoreB: 0,
    turnOuts: 0,
    outLog: [],
    isMatchComplete: false,
    winner: null,
    statusText: "Innings 1 · Turn 1 · Side A Chasing",
  };
}

export function reduceKhoKho(
  state: KhoKhoState,
  event: KhoKhoEvent
): KhoKhoState {
  switch (event.type) {
    case "OUT": {
      if (state.isMatchComplete) return state;
      const chaser = event.payload.chaserSide || state.chaserSide;
      const scoreA = state.scoreA + (chaser === "A" ? 1 : 0);
      const scoreB = state.scoreB + (chaser === "B" ? 1 : 0);
      const turnOuts = state.turnOuts + 1;
      return {
        ...state,
        scoreA,
        scoreB,
        turnOuts,
        outLog: [
          ...state.outLog,
          {
            innings: state.innings,
            turn: state.turnInInnings,
            chaserSide: chaser,
            method: event.payload.method,
            defenderId: event.payload.defenderId,
            chaserId: event.payload.chaserId,
          },
        ],
        statusText: `Inn ${state.innings} · Turn ${state.turnInInnings} · Side ${chaser} Chasing (${turnOuts} outs)`,
      };
    }

    case "SWITCH_TURN": {
      if (state.isMatchComplete) return state;
      const nextChaser =
        event.payload.nextChaserSide || oppositeSide(state.chaserSide);
      const nextDefender = oppositeSide(nextChaser);

      if (state.turnInInnings === 1) {
        return {
          ...state,
          turnInInnings: 2,
          chaserSide: nextChaser,
          defenderSide: nextDefender,
          turnOuts: 0,
          statusText: `Innings ${state.innings} · Turn 2 · Side ${nextChaser} Chasing`,
        };
      }

      if (state.innings === 1) {
        return {
          ...state,
          innings: 2,
          turnInInnings: 1,
          chaserSide: nextChaser,
          defenderSide: nextDefender,
          turnOuts: 0,
          statusText: `Innings 2 · Turn 1 · Side ${nextChaser} Chasing`,
        };
      }

      const winner: KhoKhoState["winner"] =
        state.scoreA > state.scoreB
          ? "A"
          : state.scoreB > state.scoreA
            ? "B"
            : "DRAW";
      return {
        ...state,
        isMatchComplete: true,
        winner,
        statusText:
          winner === "DRAW"
            ? `Match Drawn ${state.scoreA}–${state.scoreB}`
            : `Side ${winner} won ${state.scoreA}–${state.scoreB}`,
      };
    }

    case "END_INNINGS": {
      if (state.innings === 1) {
        const nextChaser = oppositeSide(state.chaserSide);
        return {
          ...state,
          innings: 2,
          turnInInnings: 1,
          chaserSide: nextChaser,
          defenderSide: oppositeSide(nextChaser),
          turnOuts: 0,
          statusText: `Innings 2 · Turn 1 · Side ${nextChaser} Chasing`,
        };
      }
      const winner: KhoKhoState["winner"] =
        state.scoreA > state.scoreB
          ? "A"
          : state.scoreB > state.scoreA
            ? "B"
            : "DRAW";
      return {
        ...state,
        isMatchComplete: true,
        winner,
        statusText:
          winner === "DRAW"
            ? `Full Time · Draw ${state.scoreA}–${state.scoreB}`
            : `Full Time · Side ${winner} won`,
      };
    }
  }
}

// ============================================================================
// 5. KABADDI
// ============================================================================

export function createInitialKabaddiState(): KabaddiState {
  return {
    scoreA: 0,
    scoreB: 0,
    half: "1ST",
    raidPointsA: 0,
    raidPointsB: 0,
    tacklePointsA: 0,
    tacklePointsB: 0,
    bonusPointsA: 0,
    bonusPointsB: 0,
    allOutPointsA: 0,
    allOutPointsB: 0,
    allOutsInflictedA: 0,
    allOutsInflictedB: 0,
    superRaidsA: 0,
    superRaidsB: 0,
    superTacklesA: 0,
    superTacklesB: 0,
    activeDefendersA: 7,
    activeDefendersB: 7,
    consecutiveEmptyRaidsA: 0,
    consecutiveEmptyRaidsB: 0,
    doOrDieSide: null,
    winner: null,
    statusText: "1st Half · 7 vs 7 on mat",
  };
}

export function reduceKabaddi(
  state: KabaddiState,
  event: KabaddiEvent
): KabaddiState {
  switch (event.type) {
    case "RAID": {
      const side = event.payload.raidingSide;
      const touch = Math.max(0, Math.round(event.payload.touchPoints || 0));
      const bonus = event.payload.bonusPoint ? 1 : 0;
      const total = touch + bonus;
      const isEmpty = event.payload.emptyRaid || total === 0;
      const isSuperRaid = total >= 3;

      const isA = side === "A";
      const nextEmptyA = isA
        ? isEmpty
          ? state.consecutiveEmptyRaidsA + 1
          : 0
        : state.consecutiveEmptyRaidsA;
      const nextEmptyB = !isA
        ? isEmpty
          ? state.consecutiveEmptyRaidsB + 1
          : 0
        : state.consecutiveEmptyRaidsB;

      let activeDefendersA = state.activeDefendersA;
      let activeDefendersB = state.activeDefendersB;
      if (touch > 0) {
        if (isA) {
          activeDefendersB = Math.max(0, activeDefendersB - touch);
          activeDefendersA = Math.min(7, activeDefendersA + touch);
        } else {
          activeDefendersA = Math.max(0, activeDefendersA - touch);
          activeDefendersB = Math.min(7, activeDefendersB + touch);
        }
      }

      const doOrDieSide: Side | null =
        nextEmptyA >= 2 ? "A" : nextEmptyB >= 2 ? "B" : null;

      return {
        ...state,
        scoreA: state.scoreA + (isA ? total : 0),
        scoreB: state.scoreB + (!isA ? total : 0),
        raidPointsA: state.raidPointsA + (isA ? touch : 0),
        raidPointsB: state.raidPointsB + (!isA ? touch : 0),
        bonusPointsA: state.bonusPointsA + (isA ? bonus : 0),
        bonusPointsB: state.bonusPointsB + (!isA ? bonus : 0),
        superRaidsA: state.superRaidsA + (isA && isSuperRaid ? 1 : 0),
        superRaidsB: state.superRaidsB + (!isA && isSuperRaid ? 1 : 0),
        activeDefendersA,
        activeDefendersB,
        consecutiveEmptyRaidsA: nextEmptyA,
        consecutiveEmptyRaidsB: nextEmptyB,
        doOrDieSide,
        statusText: isEmpty
          ? `Empty raid by Side ${side}${doOrDieSide ? ` · Do-or-Die on Side ${doOrDieSide}` : ""}`
          : `${isSuperRaid ? "Super Raid" : "Raid"} +${total} for Side ${side}`,
      };
    }

    case "TACKLE": {
      const side = event.payload.defendingSide;
      const isA = side === "A";
      const currentDefenders = isA
        ? state.activeDefendersA
        : state.activeDefendersB;
      const isSuper =
        event.payload.isSuperTackle !== undefined
          ? event.payload.isSuperTackle
          : currentDefenders <= 3;
      const pts = isSuper ? 2 : 1;

      const activeDefendersA = isA
        ? Math.min(7, state.activeDefendersA + 1)
        : Math.max(0, state.activeDefendersA - 1);
      const activeDefendersB = !isA
        ? Math.min(7, state.activeDefendersB + 1)
        : Math.max(0, state.activeDefendersB - 1);

      return {
        ...state,
        scoreA: state.scoreA + (isA ? pts : 0),
        scoreB: state.scoreB + (!isA ? pts : 0),
        tacklePointsA: state.tacklePointsA + (isA ? pts : 0),
        tacklePointsB: state.tacklePointsB + (!isA ? pts : 0),
        superTacklesA: state.superTacklesA + (isA && isSuper ? 1 : 0),
        superTacklesB: state.superTacklesB + (!isA && isSuper ? 1 : 0),
        activeDefendersA,
        activeDefendersB,
        // Raiding team failed raid so reset their empty raid streak
        consecutiveEmptyRaidsA: !isA ? 0 : state.consecutiveEmptyRaidsA,
        consecutiveEmptyRaidsB: isA ? 0 : state.consecutiveEmptyRaidsB,
        doOrDieSide: null,
        statusText: `${isSuper ? "Super Tackle" : "Tackle"} +${pts} for Side ${side}`,
      };
    }

    case "ALL_OUT": {
      const side = event.payload.inflictedBy;
      const isA = side === "A";
      const pts = event.payload.bonusPoints ?? 2;
      return {
        ...state,
        scoreA: state.scoreA + (isA ? pts : 0),
        scoreB: state.scoreB + (!isA ? pts : 0),
        allOutPointsA: state.allOutPointsA + (isA ? pts : 0),
        allOutPointsB: state.allOutPointsB + (!isA ? pts : 0),
        allOutsInflictedA: state.allOutsInflictedA + (isA ? 1 : 0),
        allOutsInflictedB: state.allOutsInflictedB + (!isA ? 1 : 0),
        activeDefendersA: !isA ? 7 : state.activeDefendersA,
        activeDefendersB: isA ? 7 : state.activeDefendersB,
        statusText: `ALL OUT! +${pts} Lona to Side ${side}`,
      };
    }

    case "TECHNICAL_POINT": {
      const side = event.payload.side;
      const pts = event.payload.points ?? 1;
      return {
        ...state,
        scoreA: state.scoreA + (side === "A" ? pts : 0),
        scoreB: state.scoreB + (side === "B" ? pts : 0),
        statusText: `Technical +${pts} to Side ${side}`,
      };
    }

    case "HALF_CHANGE": {
      const half = event.payload.half;
      const winner: KabaddiState["winner"] =
        half === "FT"
          ? state.scoreA > state.scoreB
            ? "A"
            : state.scoreB > state.scoreA
              ? "B"
              : "DRAW"
          : null;
      return {
        ...state,
        half,
        winner,
        statusText:
          half === "FT"
            ? winner === "DRAW"
              ? `Full Time · Draw ${state.scoreA}–${state.scoreB}`
              : `Full Time · Side ${winner} won`
            : `Half: ${half}`,
      };
    }
  }
}

// ============================================================================
// 6. BADMINTON
// ============================================================================

export function createInitialBadmintonState(): BadmintonState {
  return {
    bestOf: 3,
    targetPoints: 21,
    capPoints: 30,
    currentGameNumber: 1,
    gamesWonA: 0,
    gamesWonB: 0,
    pointsA: 0,
    pointsB: 0,
    servingSide: "A",
    serviceCourt: "RIGHT",
    smashesA: 0,
    smashesB: 0,
    gameHistory: [],
    winner: null,
    statusText: "Game 1 · Side A serving (Right Court)",
  };
}

function applyBadmintonPoint(
  state: BadmintonState,
  side: Side,
  shotType?: string
): BadmintonState {
  if (state.winner) return state;
  const pointsA = state.pointsA + (side === "A" ? 1 : 0);
  const pointsB = state.pointsB + (side === "B" ? 1 : 0);
  const smashesA = state.smashesA + (side === "A" && shotType === "SMASH" ? 1 : 0);
  const smashesB = state.smashesB + (side === "B" && shotType === "SMASH" ? 1 : 0);

  const serverScore = side === "A" ? pointsA : pointsB;
  const serviceCourt: "RIGHT" | "LEFT" = serverScore % 2 === 0 ? "RIGHT" : "LEFT";

  const lead = Math.abs(pointsA - pointsB);
  const aWinsGame =
    (pointsA >= state.targetPoints && lead >= 2) || pointsA >= state.capPoints;
  const bWinsGame =
    (pointsB >= state.targetPoints && lead >= 2) || pointsB >= state.capPoints;
  const gameWinner: Side | null = aWinsGame ? "A" : bWinsGame ? "B" : null;

  if (gameWinner) {
    const gamesWonA = state.gamesWonA + (gameWinner === "A" ? 1 : 0);
    const gamesWonB = state.gamesWonB + (gameWinner === "B" ? 1 : 0);
    const gameHistory = [
      ...state.gameHistory,
      { gameNumber: state.currentGameNumber, pointsA, pointsB },
    ];
    const needed = Math.ceil(state.bestOf / 2);
    const winner: Side | null =
      gamesWonA >= needed ? "A" : gamesWonB >= needed ? "B" : null;

    return {
      ...state,
      gamesWonA,
      gamesWonB,
      gameHistory,
      pointsA: winner ? pointsA : 0,
      pointsB: winner ? pointsB : 0,
      currentGameNumber: winner
        ? state.currentGameNumber
        : state.currentGameNumber + 1,
      servingSide: gameWinner,
      serviceCourt: "RIGHT",
      smashesA,
      smashesB,
      winner,
      statusText: winner
        ? `Match Won by Side ${winner} (${gamesWonA}–${gamesWonB})`
        : `Game ${state.currentGameNumber + 1} · Side ${gameWinner} serving`,
    };
  }

  return {
    ...state,
    pointsA,
    pointsB,
    servingSide: side,
    serviceCourt,
    smashesA,
    smashesB,
    statusText: `Game ${state.currentGameNumber} · Side ${side} serving (${serviceCourt})`,
  };
}

export function reduceBadminton(
  state: BadmintonState,
  event: BadmintonEvent
): BadmintonState {
  switch (event.type) {
    case "SET_CONFIG":
      return {
        ...state,
        bestOf: event.payload.bestOf,
        targetPoints: event.payload.targetPoints ?? state.targetPoints,
        capPoints: event.payload.capPoints ?? state.capPoints,
      };
    case "POINT":
      return applyBadmintonPoint(state, event.payload.side, event.payload.shotType);
    case "SERVICE_FAULT":
      return applyBadmintonPoint(
        state,
        oppositeSide(event.payload.faultingSide),
        "ERROR"
      );
  }
}

// ============================================================================
// 7. TABLE TENNIS
// ============================================================================

export function createInitialTableTennisState(): TableTennisState {
  return {
    bestOf: 5,
    targetPoints: 11,
    servesPerTurn: 2,
    currentGameNumber: 1,
    gamesWonA: 0,
    gamesWonB: 0,
    pointsA: 0,
    pointsB: 0,
    initialServer: "A",
    servingSide: "A",
    timeoutsUsedA: 0,
    timeoutsUsedB: 0,
    gameHistory: [],
    winner: null,
    statusText: "Game 1 · Side A serving",
  };
}

function computeTtServer(
  initialServer: Side,
  pointsA: number,
  pointsB: number,
  targetPoints: number,
  servesPerTurn: number
): Side {
  const deuceThreshold = targetPoints - 1;
  const total = pointsA + pointsB;
  if (pointsA >= deuceThreshold && pointsB >= deuceThreshold) {
    const extraPoints = total - deuceThreshold * 2;
    const baseSwitches = Math.floor((deuceThreshold * 2) / servesPerTurn);
    return (baseSwitches + extraPoints) % 2 === 0
      ? initialServer
      : oppositeSide(initialServer);
  }
  const blocks = Math.floor(total / servesPerTurn);
  return blocks % 2 === 0 ? initialServer : oppositeSide(initialServer);
}

export function reduceTableTennis(
  state: TableTennisState,
  event: TableTennisEvent
): TableTennisState {
  switch (event.type) {
    case "SET_CONFIG":
      return {
        ...state,
        bestOf: event.payload.bestOf,
        targetPoints: event.payload.targetPoints ?? state.targetPoints,
        servesPerTurn: event.payload.servesPerTurn ?? state.servesPerTurn,
      };

    case "TIMEOUT":
      return {
        ...state,
        timeoutsUsedA:
          state.timeoutsUsedA + (event.payload.side === "A" ? 1 : 0),
        timeoutsUsedB:
          state.timeoutsUsedB + (event.payload.side === "B" ? 1 : 0),
      };

    case "POINT": {
      if (state.winner) return state;
      const side = event.payload.side;
      const pointsA = state.pointsA + (side === "A" ? 1 : 0);
      const pointsB = state.pointsB + (side === "B" ? 1 : 0);
      const lead = Math.abs(pointsA - pointsB);
      const gameWinner: Side | null =
        pointsA >= state.targetPoints && lead >= 2
          ? "A"
          : pointsB >= state.targetPoints && lead >= 2
            ? "B"
            : null;

      if (gameWinner) {
        const gamesWonA = state.gamesWonA + (gameWinner === "A" ? 1 : 0);
        const gamesWonB = state.gamesWonB + (gameWinner === "B" ? 1 : 0);
        const gameHistory = [
          ...state.gameHistory,
          { gameNumber: state.currentGameNumber, pointsA, pointsB },
        ];
        const needed = Math.ceil(state.bestOf / 2);
        const winner: Side | null =
          gamesWonA >= needed ? "A" : gamesWonB >= needed ? "B" : null;
        const nextInitialServer = oppositeSide(state.initialServer);

        return {
          ...state,
          gamesWonA,
          gamesWonB,
          gameHistory,
          pointsA: winner ? pointsA : 0,
          pointsB: winner ? pointsB : 0,
          currentGameNumber: winner
            ? state.currentGameNumber
            : state.currentGameNumber + 1,
          initialServer: winner ? state.initialServer : nextInitialServer,
          servingSide: winner ? state.servingSide : nextInitialServer,
          winner,
          statusText: winner
            ? `Match Won by Side ${winner} (${gamesWonA}–${gamesWonB})`
            : `Game ${state.currentGameNumber + 1} · Side ${nextInitialServer} serving`,
        };
      }

      const servingSide = computeTtServer(
        state.initialServer,
        pointsA,
        pointsB,
        state.targetPoints,
        state.servesPerTurn
      );
      const isDeuce =
        pointsA >= state.targetPoints - 1 && pointsB >= state.targetPoints - 1;

      return {
        ...state,
        pointsA,
        pointsB,
        servingSide,
        statusText: `Game ${state.currentGameNumber} · Side ${servingSide} serving${isDeuce ? " (Deuce · 1-serve rotation)" : ""}`,
      };
    }
  }
}

// ============================================================================
// 8. CARROM
// ============================================================================

export function createInitialCarromState(): CarromState {
  return {
    targetPoints: 25,
    maxBoards: 8,
    boardNumber: 1,
    scoreA: 0,
    scoreB: 0,
    boardWhitePocketed: 0,
    boardBlackPocketed: 0,
    queenState: "ON_BOARD",
    foulsA: 0,
    foulsB: 0,
    boardHistory: [],
    winner: null,
    statusText: "Board 1 · Queen on board",
  };
}

export function reduceCarrom(
  state: CarromState,
  event: CarromEvent
): CarromState {
  switch (event.type) {
    case "SET_CONFIG":
      return {
        ...state,
        targetPoints: event.payload.targetPoints ?? state.targetPoints,
        maxBoards: event.payload.maxBoards ?? state.maxBoards,
      };

    case "POCKET": {
      if (state.winner) return state;
      const count = Math.max(1, event.payload.count ?? 1);
      if (event.payload.piece === "QUEEN") {
        return {
          ...state,
          queenState:
            event.payload.side === "A" ? "PENDING_A" : "PENDING_B",
          statusText: `Board ${state.boardNumber} · Queen pocketed by Side ${event.payload.side} (needs cover)`,
        };
      }
      const boardWhitePocketed =
        state.boardWhitePocketed +
        (event.payload.piece === "WHITE" ? count : 0);
      const boardBlackPocketed =
        state.boardBlackPocketed +
        (event.payload.piece === "BLACK" ? count : 0);
      return {
        ...state,
        boardWhitePocketed: Math.min(9, boardWhitePocketed),
        boardBlackPocketed: Math.min(9, boardBlackPocketed),
      };
    }

    case "QUEEN_COVER": {
      if (state.winner) return state;
      if (!event.payload.covered) {
        return {
          ...state,
          queenState: "ON_BOARD",
          statusText: `Board ${state.boardNumber} · Queen returned to center`,
        };
      }
      return {
        ...state,
        queenState: event.payload.side === "A" ? "COVERED_A" : "COVERED_B",
        statusText: `Board ${state.boardNumber} · Queen covered by Side ${event.payload.side}`,
      };
    }

    case "FOUL": {
      const pen = Math.max(1, event.payload.penaltyPieces ?? 1);
      return {
        ...state,
        foulsA: state.foulsA + (event.payload.side === "A" ? 1 : 0),
        foulsB: state.foulsB + (event.payload.side === "B" ? 1 : 0),
        boardWhitePocketed:
          event.payload.side === "A"
            ? Math.max(0, state.boardWhitePocketed - pen)
            : state.boardWhitePocketed,
        boardBlackPocketed:
          event.payload.side === "B"
            ? Math.max(0, state.boardBlackPocketed - pen)
            : state.boardBlackPocketed,
      };
    }

    case "END_BOARD": {
      if (state.winner) return state;
      const side = event.payload.winner;
      const queenCoveredByWinner =
        event.payload.queenBonus !== undefined
          ? event.payload.queenBonus
          : (side === "A" && state.queenState === "COVERED_A") ||
            (side === "B" && state.queenState === "COVERED_B");
      const basePts = Math.max(0, Math.round(event.payload.points || 0));
      const boardPts = basePts + (queenCoveredByWinner ? 3 : 0);
      const scoreA = state.scoreA + (side === "A" ? boardPts : 0);
      const scoreB = state.scoreB + (side === "B" ? boardPts : 0);
      const boardHistory = [
        ...state.boardHistory,
        {
          boardNumber: state.boardNumber,
          winner: side,
          points: boardPts,
          queenBonus: queenCoveredByWinner,
        },
      ];

      let winner: CarromState["winner"] = null;
      if (scoreA >= state.targetPoints) winner = "A";
      else if (scoreB >= state.targetPoints) winner = "B";
      else if (state.boardNumber >= state.maxBoards) {
        winner = scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : "DRAW";
      }

      return {
        ...state,
        scoreA,
        scoreB,
        boardHistory,
        boardNumber: winner ? state.boardNumber : state.boardNumber + 1,
        boardWhitePocketed: 0,
        boardBlackPocketed: 0,
        queenState: "ON_BOARD",
        winner,
        statusText: winner
          ? winner === "DRAW"
            ? `Match Drawn ${scoreA}–${scoreB}`
            : `Side ${winner} won (${scoreA}–${scoreB})`
          : `Board ${state.boardNumber + 1} · Score ${scoreA}–${scoreB}`,
      };
    }
  }
}

// ============================================================================
// 9. CHESS
// ============================================================================

export function createInitialChessState(): ChessState {
  const initialMs = 10 * 60 * 1000; // 10+5 Rapid default
  const incrementMs = 5 * 1000;
  return {
    whiteSide: "A",
    blackSide: "B",
    turn: "A",
    moveNumber: 1,
    initialMs,
    incrementMs,
    clockMsA: initialMs,
    clockMsB: initialMs,
    moves: [],
    drawOfferedBy: null,
    result: "*",
    resultReason: null,
    winner: null,
    statusText: "Move 1 · White to play (10+5)",
  };
}

export function reduceChess(state: ChessState, event: ChessEvent): ChessState {
  switch (event.type) {
    case "SET_TIME_CONTROL": {
      const initialMs = Math.max(60000, event.payload.initialMs);
      const incrementMs = Math.max(0, event.payload.incrementMs);
      return {
        ...state,
        initialMs,
        incrementMs,
        clockMsA: state.moves.length === 0 ? initialMs : state.clockMsA,
        clockMsB: state.moves.length === 0 ? initialMs : state.clockMsB,
        statusText: `Time control ${Math.round(initialMs / 60000)}+${Math.round(incrementMs / 1000)}`,
      };
    }

    case "CLOCK_TICK": {
      if (state.result !== "*") return state;
      const clockMsA =
        event.payload.side === "A"
          ? Math.max(0, state.clockMsA - event.payload.elapsedMs)
          : state.clockMsA;
      const clockMsB =
        event.payload.side === "B"
          ? Math.max(0, state.clockMsB - event.payload.elapsedMs)
          : state.clockMsB;
      return { ...state, clockMsA, clockMsB };
    }

    case "OFFER_DRAW":
      return {
        ...state,
        drawOfferedBy: event.payload.side,
        statusText: `Draw offered by ${event.payload.side === "A" ? "White" : "Black"}`,
      };

    case "MOVE": {
      if (state.result !== "*") return state;
      const side = event.payload.side || state.turn;
      const isA = side === "A";
      const clockMsA = isA
        ? event.payload.clockAfterMs !== undefined
          ? event.payload.clockAfterMs
          : state.clockMsA + state.incrementMs
        : state.clockMsA;
      const clockMsB = !isA
        ? event.payload.clockAfterMs !== undefined
          ? event.payload.clockAfterMs
          : state.clockMsB + state.incrementMs
        : state.clockMsB;

      const moves = [
        ...state.moves,
        {
          moveNumber: state.moveNumber,
          side,
          san: event.payload.san.trim() || "...",
          clockAfterMs: isA ? clockMsA : clockMsB,
        },
      ];
      const nextTurn = oppositeSide(side);
      const nextMoveNumber = side === "B" ? state.moveNumber + 1 : state.moveNumber;

      return {
        ...state,
        turn: nextTurn,
        moveNumber: nextMoveNumber,
        clockMsA,
        clockMsB,
        moves,
        drawOfferedBy: null,
        statusText: `Move ${nextMoveNumber} · ${nextTurn === "A" ? "White" : "Black"} to play (Last: ${event.payload.san})`,
      };
    }

    case "RESULT": {
      const outcome = event.payload.outcome;
      const result: ChessState["result"] =
        outcome === "A_WIN"
          ? "1-0"
          : outcome === "B_WIN"
            ? "0-1"
            : "1/2-1/2";
      const winner: ChessState["winner"] =
        outcome === "A_WIN" ? "A" : outcome === "B_WIN" ? "B" : "DRAW";
      return {
        ...state,
        result,
        resultReason: event.payload.reason,
        winner,
        drawOfferedBy: null,
        statusText: `${result} · ${event.payload.reason.replace("_", " ")}`,
      };
    }
  }
}

// ============================================================================
// SPORT REGISTRY MAP KEYED BY SportId
// ============================================================================

export interface DerivedScoreSummary {
  scoreA: string;
  scoreB: string;
  statusLine: string;
  breakdown: string;
}

export interface SportEngineDefinition<
  TSportState = AnySportState,
  TSportEvent extends SportEvent = SportEvent,
> {
  id: SportId;
  label: string;
  shortSubtitle: string;
  defaultRoster: MatchRoster;
  createInitialState: (roster: MatchRoster) => TSportState;
  reduce: (
    state: TSportState,
    event: TSportEvent,
    roster?: MatchRoster
  ) => TSportState;
  formatScoreSummary: (
    state: TSportState,
    roster: MatchRoster
  ) => DerivedScoreSummary;
  formatEventLabel: (event: TSportEvent, roster: MatchRoster) => string;
}

export const SPORT_REGISTRY: Record<SportId, SportEngineDefinition<any, any>> =
  {
    cricket: {
      id: "cricket",
      label: "Cricket",
      shortSubtitle: "Ball-by-ball · Extras · Strike & Free Hit",
      defaultRoster: {
        teamAName: "Trichy Titans",
        teamBName: "Cauvery Kings",
        venue: "IIITT Cricket Ground",
        stage: "Group Match",
        playersA: [
          { id: "cA1", name: "Rohan Verma", number: "7", role: "All-Rounder", side: "A" },
          { id: "cA2", name: "Aditi Menon", number: "18", role: "WK-Batter", side: "A" },
          { id: "cA3", name: "Karthik Nair", number: "10", role: "Captain", side: "A" },
          { id: "cA4", name: "Meera Krishnan", number: "24", role: "All-Rounder", side: "A" },
          { id: "cA5", name: "Ananya Reddy", number: "11", role: "Batter", side: "A" },
        ],
        playersB: [
          { id: "cB1", name: "Vikram Rao", number: "99", role: "Fast Bowler", side: "B" },
          { id: "cB2", name: "Arjun Das", number: "45", role: "Spinner", side: "B" },
          { id: "cB3", name: "Siddharth Iyer", number: "12", role: "All-Rounder", side: "B" },
          { id: "cB4", name: "Nikhil Pillai", number: "33", role: "Bowler", side: "B" },
          { id: "cB5", name: "Devansh Kulkarni", number: "5", role: "Batter", side: "B" },
        ],
      },
      createInitialState: (roster) => createInitialCricketState(roster),
      reduce: (state: CricketState, event: CricketEvent, roster?: MatchRoster) =>
        reduceCricket(state, event, roster),
      formatScoreSummary: (s: CricketState, roster: MatchRoster) => {
        const currentScore = `${s.runs}/${s.wickets} (${s.oversLabel} ov)`;
        const firstScore = s.firstInnings
          ? `${s.firstInnings.runs}/${s.firstInnings.wickets} (${s.firstInnings.oversLabel} ov)`
          : "Yet to bat";
        const scoreA = s.battingSide === "A" ? currentScore : firstScore;
        const scoreB = s.battingSide === "B" ? currentScore : firstScore;
        const striker = getPlayerName(roster, s.strikerId);
        const nonStriker = getPlayerName(roster, s.nonStrikerId);
        const bowler = getPlayerName(roster, s.bowlerId);
        return {
          scoreA,
          scoreB,
          statusLine: s.statusText,
          breakdown: `Batters: ${striker}* (${s.batters[s.strikerId]?.runs ?? 0}), ${nonStriker} (${s.batters[s.nonStrikerId]?.runs ?? 0}) · Bowler: ${bowler} (${s.bowlers[s.bowlerId]?.wickets ?? 0}/${s.bowlers[s.bowlerId]?.runsConceded ?? 0}) · Extras: ${s.extras.total}`,
        };
      },
      formatEventLabel: (ev: CricketEvent, roster: MatchRoster) => {
        switch (ev.type) {
          case "BALL": {
            const parts: string[] = [];
            const ex = ev.payload.extraType || "NONE";
            if (ex !== "NONE") parts.push(ex);
            if (ev.payload.runsOffBat > 0) parts.push(`${ev.payload.runsOffBat}r`);
            if (ev.payload.extraRuns && ev.payload.extraRuns > 0)
              parts.push(`+${ev.payload.extraRuns}ex`);
            if (ev.payload.isWicket)
              parts.push(`WICKET (${ev.payload.dismissalKind || "OUT"})`);
            if (parts.length === 0) parts.push("Dot ball (0)");
            return `Ball: ${parts.join(" · ")}`;
          }
          case "CHANGE_BOWLER":
            return `Bowler → ${getPlayerName(roster, ev.payload.bowlerId)}`;
          case "SET_LINEUP":
            return `Lineup: ${getPlayerName(roster, ev.payload.strikerId)}* & ${getPlayerName(roster, ev.payload.nonStrikerId)}`;
          case "SWAP_STRIKE":
            return "Swap Strike";
          case "END_INNINGS":
            return `End Innings (${ev.payload.reason || "Complete"})`;
          case "SET_OVERS_LIMIT":
            return `Overs limit → ${ev.payload.oversLimit}`;
        }
      },
    },

    football: {
      id: "football",
      label: "Football",
      shortSubtitle: "Goals · Cards · Shots · Periods & Pens",
      defaultRoster: {
        teamAName: "Kaveri United",
        teamBName: "Chola Rovers FC",
        venue: "Main Football Ground",
        stage: "League Fixture",
        playersA: [
          { id: "fA1", name: "Siddharth Iyer", number: "9", role: "Striker", side: "A" },
          { id: "fA2", name: "Karthik Nair", number: "8", role: "Midfielder", side: "A" },
          { id: "fA3", name: "Arjun Das", number: "4", role: "Defender", side: "A" },
          { id: "fA4", name: "Rohan Verma", number: "1", role: "GK", side: "A" },
        ],
        playersB: [
          { id: "fB1", name: "Vikram Rao", number: "10", role: "Forward", side: "B" },
          { id: "fB2", name: "Aditi Menon", number: "6", role: "Midfielder", side: "B" },
          { id: "fB3", name: "Meera Krishnan", number: "5", role: "Defender", side: "B" },
          { id: "fB4", name: "Ananya Reddy", number: "1", role: "GK", side: "B" },
        ],
      },
      createInitialState: () => createInitialFootballState(),
      reduce: (s: FootballState, ev: FootballEvent) => reduceFootball(s, ev),
      formatScoreSummary: (s: FootballState) => ({
        scoreA:
          s.penaltiesA > 0 || s.penaltiesB > 0
            ? `${s.scoreA} (${s.penaltiesA})`
            : String(s.scoreA),
        scoreB:
          s.penaltiesA > 0 || s.penaltiesB > 0
            ? `${s.scoreB} (${s.penaltiesB})`
            : String(s.scoreB),
        statusLine: `${s.period} · ${s.statusText}`,
        breakdown: `Shots: ${s.shotsA}-${s.shotsB} (On Target: ${s.shotsOnTargetA}-${s.shotsOnTargetB}) · Corners: ${s.cornersA}-${s.cornersB} · Fouls: ${s.foulsA}-${s.foulsB} · Cards Y:${s.yellowCardsA}-${s.yellowCardsB} R:${s.redCardsA}-${s.redCardsB}`,
      }),
      formatEventLabel: (ev: FootballEvent, roster: MatchRoster) => {
        switch (ev.type) {
          case "GOAL":
            return `GOAL ${teamLabel(roster, ev.payload.side)}${ev.payload.scorerId ? ` (${getPlayerName(roster, ev.payload.scorerId)})` : ""}${ev.payload.isPenalty ? " [PEN]" : ""}${ev.payload.isOwnGoal ? " [OG]" : ""}`;
          case "CARD":
            return `${ev.payload.card} CARD · ${teamLabel(roster, ev.payload.side)}${ev.payload.playerId ? ` (${getPlayerName(roster, ev.payload.playerId)})` : ""}`;
          case "SHOT":
            return `Shot ${ev.payload.onTarget ? "on target" : "off target"} · ${teamLabel(roster, ev.payload.side)}`;
          case "FOUL":
            return `Foul · ${teamLabel(roster, ev.payload.side)}`;
          case "CORNER":
            return `Corner · ${teamLabel(roster, ev.payload.side)}`;
          case "PERIOD_CHANGE":
            return `Period → ${ev.payload.period}`;
          case "PENALTY_SHOOTOUT":
            return `Pen Shootout · ${teamLabel(roster, ev.payload.side)} ${ev.payload.scored ? "SCORED" : "MISSED"}`;
          case "SUBSTITUTION":
            return `Sub · ${teamLabel(roster, ev.payload.side)}`;
        }
      },
    },

    volleyball: {
      id: "volleyball",
      label: "Volleyball",
      shortSubtitle: "Sets · Side-out Rotations (1–6) · Aces/Blocks",
      defaultRoster: {
        teamAName: "Trichy Spikers",
        teamBName: "Cauvery Blockers",
        venue: "Outdoor Volleyball Courts",
        stage: "Semi-Final",
        playersA: [
          { id: "vA1", name: "Vikram Rao", number: "7", role: "Outside Hitter", side: "A" },
          { id: "vA2", name: "Rohan Verma", number: "3", role: "Setter", side: "A" },
          { id: "vA3", name: "Karthik Nair", number: "12", role: "Middle Blocker", side: "A" },
        ],
        playersB: [
          { id: "vB1", name: "Arjun Das", number: "9", role: "Outside Hitter", side: "B" },
          { id: "vB2", name: "Siddharth Iyer", number: "4", role: "Setter", side: "B" },
          { id: "vB3", name: "Aditi Menon", number: "1", role: "Libero", side: "B" },
        ],
      },
      createInitialState: () => createInitialVolleyballState(),
      reduce: (s: VolleyballState, ev: VolleyballEvent) => reduceVolleyball(s, ev),
      formatScoreSummary: (s: VolleyballState) => ({
        scoreA: `${s.setsWonA} (${s.pointsA})`,
        scoreB: `${s.setsWonB} (${s.pointsB})`,
        statusLine: s.statusText,
        breakdown: `Sets: ${s.setHistory.map((h) => `${h.pointsA}-${h.pointsB}`).join(", ") || "In Set 1"} · Kills ${s.killsA}-${s.killsB} · Aces ${s.acesA}-${s.acesB} · Blocks ${s.blocksA}-${s.blocksB}`,
      }),
      formatEventLabel: (ev: VolleyballEvent, roster: MatchRoster) => {
        switch (ev.type) {
          case "POINT":
            return `Point ${teamLabel(roster, ev.payload.side)}${ev.payload.rallyType ? ` (${ev.payload.rallyType})` : ""}`;
          case "ROTATE":
            return `Manual Rotate · ${teamLabel(roster, ev.payload.side)}`;
          case "TIMEOUT":
            return `Timeout · ${teamLabel(roster, ev.payload.side)}`;
          case "SET_CONFIG":
            return `Config: Best of ${ev.payload.bestOf}`;
        }
      },
    },

    kho_kho: {
      id: "kho_kho",
      label: "Kho Kho",
      shortSubtitle: "Innings · Chaser/Defender Turns · Outs",
      defaultRoster: {
        teamAName: "Chola Chasers",
        teamBName: "Delta Runners",
        venue: "Campus Track & Field",
        stage: "Group Match",
        playersA: [
          { id: "kkA1", name: "Rohan Verma", role: "Chaser", side: "A" },
          { id: "kkA2", name: "Meera Krishnan", role: "Runner", side: "A" },
        ],
        playersB: [
          { id: "kkB1", name: "Arjun Das", role: "Chaser", side: "B" },
          { id: "kkB2", name: "Ananya Reddy", role: "Runner", side: "B" },
        ],
      },
      createInitialState: () => createInitialKhoKhoState(),
      reduce: (s: KhoKhoState, ev: KhoKhoEvent) => reduceKhoKho(s, ev),
      formatScoreSummary: (s: KhoKhoState) => ({
        scoreA: String(s.scoreA),
        scoreB: String(s.scoreB),
        statusLine: s.statusText,
        breakdown: `Innings ${s.innings} · Turn ${s.turnInInnings} · Chasing: Side ${s.chaserSide} · Turn Outs: ${s.turnOuts}`,
      }),
      formatEventLabel: (ev: KhoKhoEvent, roster: MatchRoster) => {
        switch (ev.type) {
          case "OUT":
            return `OUT +1 to ${teamLabel(roster, ev.payload.chaserSide)} (${ev.payload.method.replace("_", " ")})`;
          case "SWITCH_TURN":
            return "Switch Turn (Chaser ↔ Defender)";
          case "END_INNINGS":
            return "End Innings";
        }
      },
    },

    kabaddi: {
      id: "kabaddi",
      label: "Kabaddi",
      shortSubtitle: "Raids · Bonus · Super Tackles · All-Out & Do-or-Die",
      defaultRoster: {
        teamAName: "Chola Raiders",
        teamBName: "Trichy Defenders",
        venue: "Kabaddi Arena",
        stage: "Final",
        playersA: [
          { id: "kbA1", name: "Arjun Das", number: "7", role: "Lead Raider", side: "A" },
          { id: "kbA2", name: "Karthik Nair", number: "5", role: "Corner", side: "A" },
        ],
        playersB: [
          { id: "kbB1", name: "Vikram Rao", number: "11", role: "Cover", side: "B" },
          { id: "kbB2", name: "Siddharth Iyer", number: "8", role: "All-Rounder", side: "B" },
        ],
      },
      createInitialState: () => createInitialKabaddiState(),
      reduce: (s: KabaddiState, ev: KabaddiEvent) => reduceKabaddi(s, ev),
      formatScoreSummary: (s: KabaddiState) => ({
        scoreA: String(s.scoreA),
        scoreB: String(s.scoreB),
        statusLine: s.statusText,
        breakdown: `Raid ${s.raidPointsA}-${s.raidPointsB} · Tackle ${s.tacklePointsA}-${s.tacklePointsB} · Bonus ${s.bonusPointsA}-${s.bonusPointsB} · All-Out ${s.allOutPointsA}-${s.allOutPointsB}`,
      }),
      formatEventLabel: (ev: KabaddiEvent, roster: MatchRoster) => {
        switch (ev.type) {
          case "RAID": {
            const total =
              (ev.payload.touchPoints || 0) + (ev.payload.bonusPoint ? 1 : 0);
            return ev.payload.emptyRaid || total === 0
              ? `Empty Raid · ${teamLabel(roster, ev.payload.raidingSide)}`
              : `Raid +${total} · ${teamLabel(roster, ev.payload.raidingSide)} (${ev.payload.touchPoints}T${ev.payload.bonusPoint ? "+B" : ""})`;
          }
          case "TACKLE":
            return `${ev.payload.isSuperTackle ? "Super Tackle" : "Tackle"} · ${teamLabel(roster, ev.payload.defendingSide)}`;
          case "ALL_OUT":
            return `ALL OUT +${ev.payload.bonusPoints ?? 2} · ${teamLabel(roster, ev.payload.inflictedBy)}`;
          case "TECHNICAL_POINT":
            return `Technical +${ev.payload.points ?? 1} · ${teamLabel(roster, ev.payload.side)}`;
          case "HALF_CHANGE":
            return `Half → ${ev.payload.half}`;
        }
      },
    },

    badminton: {
      id: "badminton",
      label: "Badminton",
      shortSubtitle: "Best of 3 · 21pt (Cap 30) · Service Court",
      defaultRoster: {
        teamAName: "Shuttlers United",
        teamBName: "Smash Royals",
        venue: "Indoor Badminton Hall",
        stage: "Singles Final",
        playersA: [
          { id: "bdA1", name: "Meera Krishnan", role: "Singles", side: "A" },
          { id: "bdA2", name: "Aditi Menon", role: "Doubles", side: "A" },
        ],
        playersB: [
          { id: "bdB1", name: "Ananya Reddy", role: "Singles", side: "B" },
          { id: "bdB2", name: "Karthik Nair", role: "Doubles", side: "B" },
        ],
      },
      createInitialState: () => createInitialBadmintonState(),
      reduce: (s: BadmintonState, ev: BadmintonEvent) => reduceBadminton(s, ev),
      formatScoreSummary: (s: BadmintonState) => ({
        scoreA: `${s.gamesWonA} (${s.pointsA})`,
        scoreB: `${s.gamesWonB} (${s.pointsB})`,
        statusLine: s.statusText,
        breakdown: `Games: ${s.gameHistory.map((g) => `${g.pointsA}-${g.pointsB}`).join(", ") || "Game 1"} · Smashes ${s.smashesA}-${s.smashesB}`,
      }),
      formatEventLabel: (ev: BadmintonEvent, roster: MatchRoster) => {
        switch (ev.type) {
          case "POINT":
            return `Point ${teamLabel(roster, ev.payload.side)}${ev.payload.shotType ? ` (${ev.payload.shotType})` : ""}`;
          case "SERVICE_FAULT":
            return `Service Fault · ${teamLabel(roster, ev.payload.faultingSide)}`;
          case "SET_CONFIG":
            return `Config: Best of ${ev.payload.bestOf}`;
        }
      },
    },

    table_tennis: {
      id: "table_tennis",
      label: "Table Tennis",
      shortSubtitle: "Best of 5 · 11pt · 2-Serve & Deuce Rotation",
      defaultRoster: {
        teamAName: "Spin Masters",
        teamBName: "SAC Blazers",
        venue: "SAC TT Hall",
        stage: "Knockout",
        playersA: [{ id: "ttA1", name: "Rohan Verma", role: "Singles", side: "A" }],
        playersB: [{ id: "ttB1", name: "Siddharth Iyer", role: "Singles", side: "B" }],
      },
      createInitialState: () => createInitialTableTennisState(),
      reduce: (s: TableTennisState, ev: TableTennisEvent) =>
        reduceTableTennis(s, ev),
      formatScoreSummary: (s: TableTennisState) => ({
        scoreA: `${s.gamesWonA} (${s.pointsA})`,
        scoreB: `${s.gamesWonB} (${s.pointsB})`,
        statusLine: s.statusText,
        breakdown: `Games: ${s.gameHistory.map((g) => `${g.pointsA}-${g.pointsB}`).join(", ") || "Game 1"} · Serve: Side ${s.servingSide}`,
      }),
      formatEventLabel: (ev: TableTennisEvent, roster: MatchRoster) => {
        switch (ev.type) {
          case "POINT":
            return `Point ${teamLabel(roster, ev.payload.side)}${ev.payload.shotType ? ` (${ev.payload.shotType})` : ""}`;
          case "TIMEOUT":
            return `Timeout · ${teamLabel(roster, ev.payload.side)}`;
          case "SET_CONFIG":
            return `Config: Best of ${ev.payload.bestOf}`;
        }
      },
    },

    carrom: {
      id: "carrom",
      label: "Carrom",
      shortSubtitle: "Boards (Target 25) · Queen Cover (+3) · Fouls",
      defaultRoster: {
        teamAName: "White Strikers",
        teamBName: "Black Coins",
        venue: "Indoor Recreation Room",
        stage: "Doubles Board",
        playersA: [{ id: "crA1", name: "Aditi Menon", role: "Striker", side: "A" }],
        playersB: [{ id: "crB1", name: "Vikram Rao", role: "Striker", side: "B" }],
      },
      createInitialState: () => createInitialCarromState(),
      reduce: (s: CarromState, ev: CarromEvent) => reduceCarrom(s, ev),
      formatScoreSummary: (s: CarromState) => ({
        scoreA: String(s.scoreA),
        scoreB: String(s.scoreB),
        statusLine: s.statusText,
        breakdown: `Board ${s.boardNumber}/${s.maxBoards} · White: ${s.boardWhitePocketed}/9 · Black: ${s.boardBlackPocketed}/9 · Queen: ${s.queenState}`,
      }),
      formatEventLabel: (ev: CarromEvent, roster: MatchRoster) => {
        switch (ev.type) {
          case "POCKET":
            return `Pocket ${ev.payload.piece} · ${teamLabel(roster, ev.payload.side)}`;
          case "QUEEN_COVER":
            return `Queen ${ev.payload.covered ? "COVERED" : "RETURNED"} · ${teamLabel(roster, ev.payload.side)}`;
          case "FOUL":
            return `Foul (-${ev.payload.penaltyPieces ?? 1}) · ${teamLabel(roster, ev.payload.side)}`;
          case "END_BOARD":
            return `Board Won by ${teamLabel(roster, ev.payload.winner)} (+${ev.payload.points}${ev.payload.queenBonus ? " +3Q" : ""})`;
          case "SET_CONFIG":
            return `Target ${ev.payload.targetPoints ?? 25} pts`;
        }
      },
    },

    chess: {
      id: "chess",
      label: "Chess",
      shortSubtitle: "SAN Moves · Rapid Clocks (+Inc) · Match Result",
      defaultRoster: {
        teamAName: "White · Karthik Nair",
        teamBName: "Black · Siddharth Iyer",
        venue: "Chess Lounge",
        stage: "Board 1 Rapid",
        playersA: [{ id: "chA1", name: "Karthik Nair", role: "White", side: "A" }],
        playersB: [{ id: "chB1", name: "Siddharth Iyer", role: "Black", side: "B" }],
      },
      createInitialState: () => createInitialChessState(),
      reduce: (s: ChessState, ev: ChessEvent) => reduceChess(s, ev),
      formatScoreSummary: (s: ChessState) => ({
        scoreA: s.result === "1-0" ? "1" : s.result === "1/2-1/2" ? "½" : s.result === "0-1" ? "0" : `${s.moves.filter((m) => m.side === "A").length} mv`,
        scoreB: s.result === "0-1" ? "1" : s.result === "1/2-1/2" ? "½" : s.result === "1-0" ? "0" : `${s.moves.filter((m) => m.side === "B").length} mv`,
        statusLine: s.statusText,
        breakdown: `Result: ${s.result} · Moves: ${s.moves.map((m) => `${m.side === "A" ? `${m.moveNumber}.` : ""}${m.san}`).join(" ") || "Opening"}`,
      }),
      formatEventLabel: (ev: ChessEvent) => {
        switch (ev.type) {
          case "MOVE":
            return `${ev.payload.side === "A" ? "White" : "Black"}: ${ev.payload.san}`;
          case "OFFER_DRAW":
            return `Draw Offered (${ev.payload.side === "A" ? "White" : "Black"})`;
          case "RESULT":
            return `Result ${ev.payload.outcome} (${ev.payload.reason})`;
          case "CLOCK_TICK":
            return `Clock -${Math.round(ev.payload.elapsedMs / 1000)}s`;
          case "SET_TIME_CONTROL":
            return `TC ${Math.round(ev.payload.initialMs / 60000)}+${Math.round(ev.payload.incrementMs / 1000)}`;
        }
      },
    },
  };

export const ALL_SPORT_IDS: SportId[] = [
  "cricket",
  "football",
  "volleyball",
  "kho_kho",
  "kabaddi",
  "badminton",
  "table_tennis",
  "carrom",
  "chess",
];

import React, { useState } from "react";
import { createScorerEvent } from "./engine";
import {
  SPORT_REGISTRY,
  type AnySportState,
  type BadmintonState,
  type CarromState,
  type ChessState,
  type CricketState,
  type FootballState,
  type KabaddiState,
  type KhoKhoState,
  type TableTennisState,
  type VolleyballState,
} from "./reducers";
import type {
  ChessResultReason,
  ClientAction,
  CricketDismissalKind,
  CricketExtraType,
  FootballPeriod,
  KabaddiHalf,
  KhoKhoOutMethod,
  MatchRoster,
  Side,
  SportEvent,
  SportId,
} from "./types";

export function formatClockMs(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function getPlayerDisplayName(
  roster: MatchRoster,
  playerId?: string
): string {
  if (!playerId) return "Unassigned";
  const found = [...roster.playersA, ...roster.playersB].find(
    (p) => p.id === playerId
  );
  return found ? found.name : playerId;
}

// ============================================================================
// LIVE SPORT ACTION PAD (ALL 9 SPORTS)
// ============================================================================

export function SportActionPad({
  sport,
  sportState,
  roster,
  nextSeq,
  matchClockMs,
  dispatch,
  compact,
}: {
  sport: SportId;
  sportState: AnySportState;
  roster: MatchRoster;
  nextSeq: number;
  matchClockMs: number;
  dispatch: (action: ClientAction<SportEvent>) => void;
  compact?: boolean;
}) {
  const append = (type: string, payload: Record<string, unknown>) => {
    const ev = createScorerEvent(
      nextSeq,
      matchClockMs,
      type,
      payload
    ) as SportEvent;
    dispatch({ type: "APPEND_EVENT", event: ev });
  };

  switch (sport) {
    case "cricket":
      return (
        <CricketPad
          state={sportState as CricketState}
          roster={roster}
          append={append}
          compact={compact}
        />
      );
    case "football":
      return (
        <FootballPad
          state={sportState as FootballState}
          roster={roster}
          matchClockMs={matchClockMs}
          append={append}
          compact={compact}
        />
      );
    case "volleyball":
      return (
        <VolleyballPad
          state={sportState as VolleyballState}
          roster={roster}
          append={append}
        />
      );
    case "kho_kho":
      return (
        <KhoKhoPad
          state={sportState as KhoKhoState}
          roster={roster}
          append={append}
        />
      );
    case "kabaddi":
      return (
        <KabaddiPad
          state={sportState as KabaddiState}
          roster={roster}
          append={append}
        />
      );
    case "badminton":
      return (
        <BadmintonPad
          state={sportState as BadmintonState}
          roster={roster}
          append={append}
        />
      );
    case "table_tennis":
      return (
        <TableTennisPad
          state={sportState as TableTennisState}
          roster={roster}
          append={append}
        />
      );
    case "carrom":
      return (
        <CarromPad
          state={sportState as CarromState}
          roster={roster}
          append={append}
        />
      );
    case "chess":
      return (
        <ChessPad
          state={sportState as ChessState}
          roster={roster}
          append={append}
        />
      );
  }
}

// --- 1. CRICKET PAD ---
function CricketPad({
  state,
  roster,
  append,
  compact,
}: {
  state: CricketState;
  roster: MatchRoster;
  append: (type: string, payload: Record<string, unknown>) => void;
  compact?: boolean;
}) {
  const [extraType, setExtraType] = useState<CricketExtraType>("NONE");
  const [wicketMode, setWicketMode] = useState(false);
  const [dismissalKind, setDismissalKind] =
    useState<CricketDismissalKind>("BOWLED");
  const [dismissedRole, setDismissedRole] = useState<"STRIKER" | "NON_STRIKER">(
    "STRIKER"
  );

  const bowlingPool =
    state.bowlingSide === "A" ? roster.playersA : roster.playersB;

  const recordBall = (runs: number) => {
    const isByeOrLb = extraType === "BYE" || extraType === "LEG_BYE";
    const isWide = extraType === "WIDE";
    const isNoBall = extraType === "NO_BALL";

    append("BALL", {
      runsOffBat: isByeOrLb || isWide ? 0 : runs,
      extraType,
      extraRuns: isByeOrLb || isWide ? runs : isNoBall ? 0 : 0,
      isWicket: wicketMode,
      dismissalKind: wicketMode ? dismissalKind : undefined,
      dismissedRole: wicketMode ? dismissedRole : undefined,
      batterId: state.strikerId,
      bowlerId: state.bowlerId,
    });
    setExtraType("NONE");
    setWicketMode(false);
  };

  return (
    <div className="scorer-pad-stack">
      <div className="scorer-context-strip">
        <div>
          <span className="scorer-label">On Strike</span>
          <strong className="scorer-value-inline">
            {getPlayerDisplayName(roster, state.strikerId)}* (
            {state.batters[state.strikerId]?.runs ?? 0}/
            {state.batters[state.strikerId]?.balls ?? 0})
          </strong>
        </div>
        <div>
          <span className="scorer-label">Non-Striker</span>
          <span className="scorer-value-inline">
            {getPlayerDisplayName(roster, state.nonStrikerId)} (
            {state.batters[state.nonStrikerId]?.runs ?? 0}/
            {state.batters[state.nonStrikerId]?.balls ?? 0})
          </span>
        </div>
        <div>
          <span className="scorer-label">Bowler</span>
          <select
            className="scorer-inline-select"
            value={state.bowlerId}
            onChange={(e) => append("CHANGE_BOWLER", { bowlerId: e.target.value })}
          >
            {bowlingPool.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.freeHit && (
        <div className="scorer-alert-banner">
          FREE HIT ACTIVE — Only Run Out dismissal permitted on this delivery
        </div>
      )}

      <div className="scorer-over-strip">
        <span className="scorer-label">This Over</span>
        <div className="scorer-over-balls">
          {state.thisOver.length === 0 ? (
            <span className="muted">New over</span>
          ) : (
            state.thisOver.map((tok, i) => (
              <span
                key={`${tok}-${i}`}
                className={`scorer-ball-tok ${tok.includes("W") && !tok.startsWith("Wd") ? "tok-wicket" : tok === "4" || tok === "6" ? "tok-boundary" : ""}`}
              >
                {tok}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="scorer-toggle-row">
        {(["NONE", "WIDE", "NO_BALL", "BYE", "LEG_BYE"] as CricketExtraType[]).map(
          (ex) => (
            <button
              key={ex}
              type="button"
              className={`scorer-mode-btn ${extraType === ex ? "active" : ""}`}
              onClick={() => setExtraType(ex)}
            >
              {ex === "NONE"
                ? "Normal"
                : ex === "NO_BALL"
                  ? "No Ball"
                  : ex === "LEG_BYE"
                    ? "Leg Bye"
                    : ex === "WIDE"
                      ? "Wide"
                      : "Bye"}
            </button>
          )
        )}
        <button
          type="button"
          className={`scorer-mode-btn danger ${wicketMode ? "active" : ""}`}
          onClick={() => setWicketMode((w) => !w)}
        >
          {wicketMode ? "Wicket ON" : "+ Wicket"}
        </button>
      </div>

      {wicketMode && (
        <div className="scorer-subpanel">
          <div className="scorer-subpanel-row">
            <label className="scorer-field">
              <span>Dismissal</span>
              <select
                value={dismissalKind}
                onChange={(e) =>
                  setDismissalKind(e.target.value as CricketDismissalKind)
                }
              >
                <option value="BOWLED">Bowled</option>
                <option value="CAUGHT">Caught</option>
                <option value="LBW">LBW</option>
                <option value="RUN_OUT">Run Out</option>
                <option value="STUMPED">Stumped</option>
                <option value="HIT_WICKET">Hit Wicket</option>
              </select>
            </label>
            {dismissalKind === "RUN_OUT" && (
              <label className="scorer-field">
                <span>Batter Out</span>
                <select
                  value={dismissedRole}
                  onChange={(e) =>
                    setDismissedRole(
                      e.target.value as "STRIKER" | "NON_STRIKER"
                    )
                  }
                >
                  <option value="STRIKER">Striker</option>
                  <option value="NON_STRIKER">Non-Striker</option>
                </select>
              </label>
            )}
          </div>
        </div>
      )}

      <div className={`scorer-keygrid ${compact ? "cols-3" : "cols-6"}`}>
        {[0, 1, 2, 3, 4, 6].map((runs) => (
          <button
            key={runs}
            type="button"
            disabled={state.isMatchComplete}
            className={`scorer-key-btn ${runs === 4 || runs === 6 ? "accent-gold" : ""}`}
            onClick={() => recordBall(runs)}
          >
            <span className="scorer-key-num">{runs}</span>
            <span className="scorer-key-sub">
              {wicketMode
                ? "WKT"
                : extraType !== "NONE"
                  ? extraType.replace("_", " ")
                  : runs === 0
                    ? "Dot"
                    : runs === 4
                      ? "Four"
                      : runs === 6
                        ? "Six"
                        : "Runs"}
            </span>
          </button>
        ))}
      </div>

      <div className="scorer-utility-row">
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("SWAP_STRIKE", {})}
        >
          Swap Strike
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() =>
            append("SET_OVERS_LIMIT", {
              oversLimit: state.oversLimit === 15 ? 20 : state.oversLimit === 20 ? 10 : 15,
            })
          }
        >
          Overs: {state.oversLimit}
        </button>
        <button
          type="button"
          className="scorer-util-btn accent-crimson"
          disabled={state.isMatchComplete}
          onClick={() =>
            append("END_INNINGS", {
              reason: state.inningsNumber === 1 ? "OVERS_COMPLETED" : "ALL_OUT",
            })
          }
        >
          {state.inningsNumber === 1 ? "End 1st Innings" : "Finish Match"}
        </button>
      </div>
    </div>
  );
}

// --- 2. FOOTBALL PAD ---
function FootballPad({
  state,
  roster,
  matchClockMs,
  append,
  compact,
}: {
  state: FootballState;
  roster: MatchRoster;
  matchClockMs: number;
  append: (type: string, payload: Record<string, unknown>) => void;
  compact?: boolean;
}) {
  const [scorerA, setScorerA] = useState(roster.playersA[0]?.id || "");
  const [scorerB, setScorerB] = useState(roster.playersB[0]?.id || "");
  const [isPenalty, setIsPenalty] = useState(false);
  const [isOwnGoal, setIsOwnGoal] = useState(false);
  const currentMin = Math.max(1, Math.ceil(matchClockMs / 60000));

  const fireGoal = (side: Side) => {
    append("GOAL", {
      side,
      scorerId: side === "A" ? scorerA : scorerB,
      minute: currentMin,
      isPenalty,
      isOwnGoal,
    });
    setIsPenalty(false);
    setIsOwnGoal(false);
  };

  return (
    <div className="scorer-pad-stack">
      <div className="scorer-toggle-row">
        {(["1H", "HT", "2H", "ET1", "ET2", "PEN", "FT"] as FootballPeriod[]).map(
          (p) => (
            <button
              key={p}
              type="button"
              className={`scorer-mode-btn ${state.period === p ? "active" : ""}`}
              onClick={() => append("PERIOD_CHANGE", { period: p })}
            >
              {p}
            </button>
          )
        )}
      </div>

      <div className="scorer-subpanel">
        <div className="scorer-subpanel-row">
          <label className="scorer-field">
            <span>{roster.teamAName} Player</span>
            <select
              value={scorerA}
              onChange={(e) => setScorerA(e.target.value)}
            >
              {roster.playersA.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number || "-"} {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="scorer-field">
            <span>{roster.teamBName} Player</span>
            <select
              value={scorerB}
              onChange={(e) => setScorerB(e.target.value)}
            >
              {roster.playersB.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number || "-"} {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="scorer-checkbox-row">
          <label>
            <input
              type="checkbox"
              checked={isPenalty}
              onChange={(e) => setIsPenalty(e.target.checked)}
            />
            Penalty Goal
          </label>
          <label>
            <input
              type="checkbox"
              checked={isOwnGoal}
              onChange={(e) => setIsOwnGoal(e.target.checked)}
            />
            Own Goal
          </label>
        </div>
      </div>

      <div className="scorer-dual-grid">
        <button
          type="button"
          className="scorer-key-btn accent-gold"
          onClick={() => fireGoal("A")}
        >
          <span className="scorer-key-num">+ GOAL</span>
          <span className="scorer-key-sub">{roster.teamAName}</span>
        </button>
        <button
          type="button"
          className="scorer-key-btn accent-gold"
          onClick={() => fireGoal("B")}
        >
          <span className="scorer-key-num">+ GOAL</span>
          <span className="scorer-key-sub">{roster.teamBName}</span>
        </button>
      </div>

      <div className={`scorer-action-matrix ${compact ? "cols-2" : "cols-4"}`}>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() =>
            append("SHOT", { side: "A", playerId: scorerA, onTarget: true })
          }
        >
          A Shot On
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() =>
            append("SHOT", { side: "B", playerId: scorerB, onTarget: true })
          }
        >
          B Shot On
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("CORNER", { side: "A" })}
        >
          A Corner
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("CORNER", { side: "B" })}
        >
          B Corner
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() =>
            append("CARD", {
              side: "A",
              playerId: scorerA,
              card: "YELLOW",
              minute: currentMin,
            })
          }
        >
          A Yellow
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() =>
            append("CARD", {
              side: "B",
              playerId: scorerB,
              card: "YELLOW",
              minute: currentMin,
            })
          }
        >
          B Yellow
        </button>
        <button
          type="button"
          className="scorer-util-btn accent-crimson"
          onClick={() =>
            append("CARD", {
              side: "A",
              playerId: scorerA,
              card: "RED",
              minute: currentMin,
            })
          }
        >
          A Red
        </button>
        <button
          type="button"
          className="scorer-util-btn accent-crimson"
          onClick={() =>
            append("CARD", {
              side: "B",
              playerId: scorerB,
              card: "RED",
              minute: currentMin,
            })
          }
        >
          B Red
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("FOUL", { side: "A", playerId: scorerA })}
        >
          A Foul
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("FOUL", { side: "B", playerId: scorerB })}
        >
          B Foul
        </button>
        {state.period === "PEN" && (
          <>
            <button
              type="button"
              className="scorer-util-btn accent-gold"
              onClick={() =>
                append("PENALTY_SHOOTOUT", {
                  side: "A",
                  playerId: scorerA,
                  scored: true,
                })
              }
            >
              A Pen Goal
            </button>
            <button
              type="button"
              className="scorer-util-btn accent-gold"
              onClick={() =>
                append("PENALTY_SHOOTOUT", {
                  side: "B",
                  playerId: scorerB,
                  scored: true,
                })
              }
            >
              B Pen Goal
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// --- 3. VOLLEYBALL PAD ---
function VolleyballPad({
  state,
  roster,
  append,
}: {
  state: VolleyballState;
  roster: MatchRoster;
  append: (type: string, payload: Record<string, unknown>) => void;
}) {
  const [rallyType, setRallyType] = useState<
    "RALLY" | "KILL" | "ACE" | "BLOCK" | "OPPONENT_ERROR"
  >("RALLY");

  return (
    <div className="scorer-pad-stack">
      <div className="scorer-context-strip">
        <div>
          <span className="scorer-label">Serving</span>
          <strong className="scorer-value-inline">
            {state.servingSide === "A" ? roster.teamAName : roster.teamBName}
          </strong>
        </div>
        <div>
          <span className="scorer-label">Court Rotations</span>
          <span className="scorer-value-inline">
            A: R{state.rotationA} · B: R{state.rotationB}
          </span>
        </div>
        <div>
          <span className="scorer-label">Format</span>
          <span className="scorer-value-inline">Best of {state.bestOf}</span>
        </div>
      </div>

      <div className="scorer-toggle-row">
        {(["RALLY", "KILL", "ACE", "BLOCK", "OPPONENT_ERROR"] as const).map(
          (rt) => (
            <button
              key={rt}
              type="button"
              className={`scorer-mode-btn ${rallyType === rt ? "active" : ""}`}
              onClick={() => setRallyType(rt)}
            >
              {rt.replace("_", " ")}
            </button>
          )
        )}
      </div>

      <div className="scorer-dual-grid">
        <button
          type="button"
          disabled={Boolean(state.winner)}
          className="scorer-key-btn accent-gold"
          onClick={() => append("POINT", { side: "A", rallyType })}
        >
          <span className="scorer-key-num">+1 PT</span>
          <span className="scorer-key-sub">{roster.teamAName}</span>
        </button>
        <button
          type="button"
          disabled={Boolean(state.winner)}
          className="scorer-key-btn accent-gold"
          onClick={() => append("POINT", { side: "B", rallyType })}
        >
          <span className="scorer-key-num">+1 PT</span>
          <span className="scorer-key-sub">{roster.teamBName}</span>
        </button>
      </div>

      <div className="scorer-utility-row">
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("ROTATE", { side: "A" })}
        >
          Rotate A (R{state.rotationA})
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("ROTATE", { side: "B" })}
        >
          Rotate B (R{state.rotationB})
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("TIMEOUT", { side: "A" })}
        >
          TO A ({state.timeoutsA})
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("TIMEOUT", { side: "B" })}
        >
          TO B ({state.timeoutsB})
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() =>
            append("SET_CONFIG", { bestOf: state.bestOf === 3 ? 5 : 3 })
          }
        >
          Switch to Bo{state.bestOf === 3 ? 5 : 3}
        </button>
      </div>
    </div>
  );
}

// --- 4. KHO KHO PAD ---
function KhoKhoPad({
  state,
  roster,
  append,
}: {
  state: KhoKhoState;
  roster: MatchRoster;
  append: (type: string, payload: Record<string, unknown>) => void;
}) {
  const chaserTeam =
    state.chaserSide === "A" ? roster.teamAName : roster.teamBName;
  const methods: { id: KhoKhoOutMethod; label: string }[] = [
    { id: "TOUCH", label: "Touch Out (+1)" },
    { id: "POLE_DIVE", label: "Pole Dive (+1)" },
    { id: "OUT_OF_FIELD", label: "Out of Field (+1)" },
    { id: "LATE_ENTRY", label: "Late Entry (+1)" },
  ];

  return (
    <div className="scorer-pad-stack">
      <div className="scorer-context-strip">
        <div>
          <span className="scorer-label">Innings / Turn</span>
          <strong className="scorer-value-inline">
            Inn {state.innings} · Turn {state.turnInInnings}
          </strong>
        </div>
        <div>
          <span className="scorer-label">Active Chasers</span>
          <strong className="scorer-value-inline" style={{ color: "#d4a038" }}>
            {chaserTeam}
          </strong>
        </div>
        <div>
          <span className="scorer-label">Turn Outs</span>
          <strong className="scorer-value-inline">{state.turnOuts}</strong>
        </div>
      </div>

      <div className="scorer-dual-grid">
        {methods.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={state.isMatchComplete}
            className="scorer-key-btn accent-gold"
            onClick={() =>
              append("OUT", { chaserSide: state.chaserSide, method: m.id })
            }
          >
            <span className="scorer-key-num">+1 OUT</span>
            <span className="scorer-key-sub">{m.label}</span>
          </button>
        ))}
      </div>

      <div className="scorer-utility-row">
        <button
          type="button"
          disabled={state.isMatchComplete}
          className="scorer-util-btn"
          onClick={() => append("SWITCH_TURN", {})}
        >
          Switch Turn (Chaser ↔ Defender)
        </button>
        <button
          type="button"
          disabled={state.isMatchComplete}
          className="scorer-util-btn accent-crimson"
          onClick={() => append("END_INNINGS", {})}
        >
          {state.innings === 1 ? "End Innings 1" : "Finish Match"}
        </button>
      </div>
    </div>
  );
}

// --- 5. KABADDI PAD ---
function KabaddiPad({
  state,
  roster,
  append,
}: {
  state: KabaddiState;
  roster: MatchRoster;
  append: (type: string, payload: Record<string, unknown>) => void;
}) {
  const [raidingSide, setRaidingSide] = useState<Side>("A");
  const [bonusPoint, setBonusPoint] = useState(false);

  const fireRaid = (touchPoints: number) => {
    append("RAID", {
      raidingSide,
      touchPoints,
      bonusPoint,
      emptyRaid: touchPoints === 0 && !bonusPoint,
    });
    setBonusPoint(false);
  };

  return (
    <div className="scorer-pad-stack">
      <div className="scorer-context-strip">
        <div>
          <span className="scorer-label">Mat Defenders</span>
          <strong className="scorer-value-inline">
            A: {state.activeDefendersA}/7 · B: {state.activeDefendersB}/7
          </strong>
        </div>
        <div>
          <span className="scorer-label">Empty Raids</span>
          <span className="scorer-value-inline">
            A: {state.consecutiveEmptyRaidsA} · B: {state.consecutiveEmptyRaidsB}
          </span>
        </div>
        <div>
          <span className="scorer-label">Half</span>
          <strong className="scorer-value-inline">{state.half}</strong>
        </div>
      </div>

      {state.doOrDieSide && (
        <div className="scorer-alert-banner">
          DO-OR-DIE RAID ACTIVE for{" "}
          {state.doOrDieSide === "A" ? roster.teamAName : roster.teamBName}
        </div>
      )}

      <div className="scorer-toggle-row">
        <button
          type="button"
          className={`scorer-mode-btn ${raidingSide === "A" ? "active" : ""}`}
          onClick={() => setRaidingSide("A")}
        >
          Raiding: {roster.teamAName}
        </button>
        <button
          type="button"
          className={`scorer-mode-btn ${raidingSide === "B" ? "active" : ""}`}
          onClick={() => setRaidingSide("B")}
        >
          Raiding: {roster.teamBName}
        </button>
        <button
          type="button"
          className={`scorer-mode-btn ${bonusPoint ? "active" : ""}`}
          onClick={() => setBonusPoint((b) => !b)}
        >
          {bonusPoint ? "Bonus +1 ON" : "+ Bonus Pt"}
        </button>
      </div>

      <div className="scorer-keygrid cols-4">
        <button
          type="button"
          className="scorer-key-btn"
          onClick={() => fireRaid(0)}
        >
          <span className="scorer-key-num">{bonusPoint ? "+1" : "0"}</span>
          <span className="scorer-key-sub">
            {bonusPoint ? "Bonus Only" : "Empty Raid"}
          </span>
        </button>
        <button
          type="button"
          className="scorer-key-btn accent-gold"
          onClick={() => fireRaid(1)}
        >
          <span className="scorer-key-num">+{1 + (bonusPoint ? 1 : 0)}</span>
          <span className="scorer-key-sub">1 Touch</span>
        </button>
        <button
          type="button"
          className="scorer-key-btn accent-gold"
          onClick={() => fireRaid(2)}
        >
          <span className="scorer-key-num">+{2 + (bonusPoint ? 1 : 0)}</span>
          <span className="scorer-key-sub">2 Touches</span>
        </button>
        <button
          type="button"
          className="scorer-key-btn accent-gold"
          onClick={() => fireRaid(3)}
        >
          <span className="scorer-key-num">+{3 + (bonusPoint ? 1 : 0)}</span>
          <span className="scorer-key-sub">Super Raid</span>
        </button>
      </div>

      <div className="scorer-action-matrix cols-2">
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("TACKLE", { defendingSide: "A" })}
        >
          Tackle A ({state.activeDefendersA <= 3 ? "Super +2" : "+1"})
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("TACKLE", { defendingSide: "B" })}
        >
          Tackle B ({state.activeDefendersB <= 3 ? "Super +2" : "+1"})
        </button>
        <button
          type="button"
          className="scorer-util-btn accent-crimson"
          onClick={() => append("ALL_OUT", { inflictedBy: "A", bonusPoints: 2 })}
        >
          All-Out by A (+2)
        </button>
        <button
          type="button"
          className="scorer-util-btn accent-crimson"
          onClick={() => append("ALL_OUT", { inflictedBy: "B", bonusPoints: 2 })}
        >
          All-Out by B (+2)
        </button>
      </div>

      <div className="scorer-toggle-row">
        {(["1ST", "HT", "2ND", "FT"] as KabaddiHalf[]).map((h) => (
          <button
            key={h}
            type="button"
            className={`scorer-mode-btn ${state.half === h ? "active" : ""}`}
            onClick={() => append("HALF_CHANGE", { half: h })}
          >
            {h}
          </button>
        ))}
        <button
          type="button"
          className="scorer-mode-btn"
          onClick={() => append("TECHNICAL_POINT", { side: raidingSide, points: 1 })}
        >
          +1 Tech ({raidingSide})
        </button>
      </div>
    </div>
  );
}

// --- 6. BADMINTON PAD ---
function BadmintonPad({
  state,
  roster,
  append,
}: {
  state: BadmintonState;
  roster: MatchRoster;
  append: (type: string, payload: Record<string, unknown>) => void;
}) {
  const [shotType, setShotType] = useState<
    "SMASH" | "DROP" | "NET" | "SERVICE_ACE" | "ERROR"
  >("SMASH");

  return (
    <div className="scorer-pad-stack">
      <div className="scorer-context-strip">
        <div>
          <span className="scorer-label">Serving</span>
          <strong className="scorer-value-inline">
            {state.servingSide === "A" ? roster.teamAName : roster.teamBName}
          </strong>
        </div>
        <div>
          <span className="scorer-label">Service Court</span>
          <strong className="scorer-value-inline" style={{ color: "#d4a038" }}>
            {state.serviceCourt}
          </strong>
        </div>
        <div>
          <span className="scorer-label">Game / Cap</span>
          <span className="scorer-value-inline">
            G{state.currentGameNumber} · {state.targetPoints}pt (Cap{" "}
            {state.capPoints})
          </span>
        </div>
      </div>

      <div className="scorer-toggle-row">
        {(["SMASH", "DROP", "NET", "SERVICE_ACE", "ERROR"] as const).map(
          (st) => (
            <button
              key={st}
              type="button"
              className={`scorer-mode-btn ${shotType === st ? "active" : ""}`}
              onClick={() => setShotType(st)}
            >
              {st.replace("_", " ")}
            </button>
          )
        )}
      </div>

      <div className="scorer-dual-grid">
        <button
          type="button"
          disabled={Boolean(state.winner)}
          className="scorer-key-btn accent-gold"
          onClick={() => append("POINT", { side: "A", shotType })}
        >
          <span className="scorer-key-num">+1 PT</span>
          <span className="scorer-key-sub">{roster.teamAName}</span>
        </button>
        <button
          type="button"
          disabled={Boolean(state.winner)}
          className="scorer-key-btn accent-gold"
          onClick={() => append("POINT", { side: "B", shotType })}
        >
          <span className="scorer-key-num">+1 PT</span>
          <span className="scorer-key-sub">{roster.teamBName}</span>
        </button>
      </div>

      <div className="scorer-utility-row">
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("SERVICE_FAULT", { faultingSide: "A" })}
        >
          Service Fault A
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("SERVICE_FAULT", { faultingSide: "B" })}
        >
          Service Fault B
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() =>
            append("SET_CONFIG", { bestOf: state.bestOf === 3 ? 1 : 3 })
          }
        >
          Format: Bo{state.bestOf}
        </button>
      </div>
    </div>
  );
}

// --- 7. TABLE TENNIS PAD ---
function TableTennisPad({
  state,
  roster,
  append,
}: {
  state: TableTennisState;
  roster: MatchRoster;
  append: (type: string, payload: Record<string, unknown>) => void;
}) {
  const [shotType, setShotType] = useState<
    "FOREHAND" | "BACKHAND" | "SERVICE_ACE" | "ERROR"
  >("FOREHAND");

  const isDeuce =
    state.pointsA >= state.targetPoints - 1 &&
    state.pointsB >= state.targetPoints - 1;

  return (
    <div className="scorer-pad-stack">
      <div className="scorer-context-strip">
        <div>
          <span className="scorer-label">Current Server</span>
          <strong className="scorer-value-inline" style={{ color: "#d4a038" }}>
            {state.servingSide === "A" ? roster.teamAName : roster.teamBName}
          </strong>
        </div>
        <div>
          <span className="scorer-label">Serve Cadence</span>
          <span className="scorer-value-inline">
            {isDeuce ? "Deuce · 1-serve" : `${state.servesPerTurn}-serve`}
          </span>
        </div>
        <div>
          <span className="scorer-label">Format</span>
          <span className="scorer-value-inline">Best of {state.bestOf}</span>
        </div>
      </div>

      <div className="scorer-toggle-row">
        {(["FOREHAND", "BACKHAND", "SERVICE_ACE", "ERROR"] as const).map(
          (st) => (
            <button
              key={st}
              type="button"
              className={`scorer-mode-btn ${shotType === st ? "active" : ""}`}
              onClick={() => setShotType(st)}
            >
              {st.replace("_", " ")}
            </button>
          )
        )}
      </div>

      <div className="scorer-dual-grid">
        <button
          type="button"
          disabled={Boolean(state.winner)}
          className="scorer-key-btn accent-gold"
          onClick={() => append("POINT", { side: "A", shotType })}
        >
          <span className="scorer-key-num">+1 PT</span>
          <span className="scorer-key-sub">{roster.teamAName}</span>
        </button>
        <button
          type="button"
          disabled={Boolean(state.winner)}
          className="scorer-key-btn accent-gold"
          onClick={() => append("POINT", { side: "B", shotType })}
        >
          <span className="scorer-key-num">+1 PT</span>
          <span className="scorer-key-sub">{roster.teamBName}</span>
        </button>
      </div>

      <div className="scorer-utility-row">
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("TIMEOUT", { side: "A" })}
        >
          Timeout A ({state.timeoutsUsedA})
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("TIMEOUT", { side: "B" })}
        >
          Timeout B ({state.timeoutsUsedB})
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() =>
            append("SET_CONFIG", {
              bestOf: state.bestOf === 5 ? 7 : state.bestOf === 7 ? 3 : 5,
            })
          }
        >
          Cycle Bo3/5/7
        </button>
      </div>
    </div>
  );
}

// --- 8. CARROM PAD ---
function CarromPad({
  state,
  roster,
  append,
}: {
  state: CarromState;
  roster: MatchRoster;
  append: (type: string, payload: Record<string, unknown>) => void;
}) {
  const [boardPoints, setBoardPoints] = useState(4);

  return (
    <div className="scorer-pad-stack">
      <div className="scorer-context-strip">
        <div>
          <span className="scorer-label">Board</span>
          <strong className="scorer-value-inline">
            #{state.boardNumber} / {state.maxBoards}
          </strong>
        </div>
        <div>
          <span className="scorer-label">Pocketed</span>
          <span className="scorer-value-inline">
            W: {state.boardWhitePocketed}/9 · B: {state.boardBlackPocketed}/9
          </span>
        </div>
        <div>
          <span className="scorer-label">Queen</span>
          <strong className="scorer-value-inline" style={{ color: "#d4a038" }}>
            {state.queenState.replace("_", " ")}
          </strong>
        </div>
      </div>

      <div className="scorer-keygrid cols-3">
        <button
          type="button"
          className="scorer-key-btn"
          onClick={() => append("POCKET", { side: "A", piece: "WHITE", count: 1 })}
        >
          <span className="scorer-key-num">+1 W</span>
          <span className="scorer-key-sub">White Coin</span>
        </button>
        <button
          type="button"
          className="scorer-key-btn accent-gold"
          onClick={() =>
            append("POCKET", {
              side: state.boardWhitePocketed >= state.boardBlackPocketed ? "A" : "B",
              piece: "QUEEN",
            })
          }
        >
          <span className="scorer-key-num">Q</span>
          <span className="scorer-key-sub">Pocket Queen</span>
        </button>
        <button
          type="button"
          className="scorer-key-btn"
          onClick={() => append("POCKET", { side: "B", piece: "BLACK", count: 1 })}
        >
          <span className="scorer-key-num">+1 B</span>
          <span className="scorer-key-sub">Black Coin</span>
        </button>
      </div>

      <div className="scorer-utility-row">
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("QUEEN_COVER", { side: "A", covered: true })}
        >
          Cover Queen (A)
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("QUEEN_COVER", { side: "B", covered: true })}
        >
          Cover Queen (B)
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          onClick={() => append("QUEEN_COVER", { side: "A", covered: false })}
        >
          Return Queen
        </button>
        <button
          type="button"
          className="scorer-util-btn accent-crimson"
          onClick={() => append("FOUL", { side: "A", penaltyPieces: 1 })}
        >
          Foul A
        </button>
        <button
          type="button"
          className="scorer-util-btn accent-crimson"
          onClick={() => append("FOUL", { side: "B", penaltyPieces: 1 })}
        >
          Foul B
        </button>
      </div>

      <div className="scorer-subpanel">
        <div className="scorer-subpanel-row">
          <label className="scorer-field">
            <span>Remaining Coins (Board Points)</span>
            <input
              type="number"
              min={1}
              max={9}
              value={boardPoints}
              onChange={(e) =>
                setBoardPoints(Math.max(1, Math.min(9, Number(e.target.value) || 1)))
              }
            />
          </label>
          <button
            type="button"
            disabled={Boolean(state.winner)}
            className="scorer-util-btn accent-gold"
            onClick={() =>
              append("END_BOARD", { winner: "A", points: boardPoints })
            }
          >
            End Board → {roster.teamAName}
          </button>
          <button
            type="button"
            disabled={Boolean(state.winner)}
            className="scorer-util-btn accent-gold"
            onClick={() =>
              append("END_BOARD", { winner: "B", points: boardPoints })
            }
          >
            End Board → {roster.teamBName}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- 9. CHESS PAD ---
function ChessPad({
  state,
  roster,
  append,
}: {
  state: ChessState;
  roster: MatchRoster;
  append: (type: string, payload: Record<string, unknown>) => void;
}) {
  const [san, setSan] = useState("");
  const [reason, setReason] = useState<ChessResultReason>("CHECKMATE");

  const submitMove = (moveSan: string) => {
    const clean = moveSan.trim();
    if (!clean || state.result !== "*") return;
    append("MOVE", { side: state.turn, san: clean });
    setSan("");
  };

  const quickMoves =
    state.turn === "A"
      ? ["e4", "d4", "Nf3", "Bc4", "O-O", "Qxd5+"]
      : ["e5", "c5", "Nf6", "Nc6", "O-O", "exd4"];

  return (
    <div className="scorer-pad-stack">
      <div className="scorer-context-strip">
        <div>
          <span className="scorer-label">White Clock</span>
          <strong className="scorer-value-inline tabular-nums">
            {formatClockMs(state.clockMsA)}
          </strong>
        </div>
        <div>
          <span className="scorer-label">To Move</span>
          <strong className="scorer-value-inline" style={{ color: "#d4a038" }}>
            Move {state.moveNumber} · {state.turn === "A" ? "White" : "Black"}
          </strong>
        </div>
        <div>
          <span className="scorer-label">Black Clock</span>
          <strong className="scorer-value-inline tabular-nums">
            {formatClockMs(state.clockMsB)}
          </strong>
        </div>
      </div>

      <form
        className="scorer-chess-form"
        onSubmit={(e) => {
          e.preventDefault();
          submitMove(san);
        }}
      >
        <input
          value={san}
          onChange={(e) => setSan(e.target.value)}
          placeholder={`Enter ${state.turn === "A" ? "White" : "Black"} SAN move (e.g. Nf3, O-O)`}
          disabled={state.result !== "*"}
        />
        <button
          type="submit"
          className="action-btn"
          disabled={state.result !== "*" || !san.trim()}
        >
          Play Move
        </button>
      </form>

      <div className="scorer-keygrid cols-6">
        {quickMoves.map((mv) => (
          <button
            key={mv}
            type="button"
            disabled={state.result !== "*"}
            className="scorer-key-btn"
            onClick={() => submitMove(mv)}
          >
            <span className="scorer-key-num" style={{ fontSize: "1rem" }}>
              {mv}
            </span>
          </button>
        ))}
      </div>

      <div className="scorer-subpanel">
        <div className="scorer-subpanel-row">
          <label className="scorer-field">
            <span>Result Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as ChessResultReason)}
            >
              <option value="CHECKMATE">Checkmate</option>
              <option value="RESIGNATION">Resignation</option>
              <option value="TIMEOUT">Timeout</option>
              <option value="AGREED_DRAW">Agreed Draw</option>
              <option value="STALEMATE">Stalemate</option>
              <option value="REPETITION">Repetition</option>
            </select>
          </label>
          <button
            type="button"
            className="scorer-util-btn"
            onClick={() => append("OFFER_DRAW", { side: state.turn })}
          >
            Offer Draw
          </button>
        </div>
        <div className="scorer-utility-row" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="scorer-util-btn accent-gold"
            onClick={() => append("RESULT", { outcome: "A_WIN", reason })}
          >
            1–0 ({roster.teamAName.split("·")[0].trim()})
          </button>
          <button
            type="button"
            className="scorer-util-btn"
            onClick={() => append("RESULT", { outcome: "DRAW", reason })}
          >
            ½–½ Draw
          </button>
          <button
            type="button"
            className="scorer-util-btn accent-gold"
            onClick={() => append("RESULT", { outcome: "B_WIN", reason })}
          >
            0–1 ({roster.teamBName.split("·")[0].trim()})
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SCORECARD & STATS RENDERERS (SHARED BY MOBILE DRAWER & PC RIGHT PANEL)
// ============================================================================

export function SportScorecardView({
  sport,
  sportState,
  roster,
}: {
  sport: SportId;
  sportState: AnySportState;
  roster: MatchRoster;
}) {
  if (sport === "cricket") {
    const s = sportState as CricketState;
    const batterList = Object.values(s.batters);
    const bowlerList = Object.values(s.bowlers);
    return (
      <div className="scorer-detail-stack">
        {s.firstInnings && (
          <div className="scorer-summary-line">
            1st Innings:{" "}
            <strong>
              {s.firstInnings.battingSide === "A"
                ? roster.teamAName
                : roster.teamBName}{" "}
              {s.firstInnings.runs}/{s.firstInnings.wickets} (
              {s.firstInnings.oversLabel} ov)
            </strong>
          </div>
        )}
        <div className="scorer-table-title">Batting</div>
        <table className="scorer-mini-table">
          <thead>
            <tr>
              <th>Batter</th>
              <th>R</th>
              <th>B</th>
              <th>4s</th>
              <th>6s</th>
            </tr>
          </thead>
          <tbody>
            {batterList.map((b) => (
              <tr key={b.playerId}>
                <td>
                  {getPlayerDisplayName(roster, b.playerId)}
                  {b.playerId === s.strikerId && !b.out ? "*" : ""}
                  {b.out && (
                    <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
                      ({b.dismissal || "out"})
                    </span>
                  )}
                </td>
                <td className="tabular-nums">{b.runs}</td>
                <td className="tabular-nums">{b.balls}</td>
                <td className="tabular-nums">{b.fours}</td>
                <td className="tabular-nums">{b.sixes}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="scorer-table-title">Bowling</div>
        <table className="scorer-mini-table">
          <thead>
            <tr>
              <th>Bowler</th>
              <th>Ov</th>
              <th>R</th>
              <th>W</th>
              <th>Wd/Nb</th>
            </tr>
          </thead>
          <tbody>
            {bowlerList.map((bw) => (
              <tr key={bw.playerId}>
                <td>
                  {getPlayerDisplayName(roster, bw.playerId)}
                  {bw.playerId === s.bowlerId ? " *" : ""}
                </td>
                <td className="tabular-nums">
                  {Math.floor(bw.legalBalls / 6)}.{bw.legalBalls % 6}
                </td>
                <td className="tabular-nums">{bw.runsConceded}</td>
                <td className="tabular-nums">{bw.wickets}</td>
                <td className="tabular-nums">
                  {bw.wides}/{bw.noBalls}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (sport === "football") {
    const s = sportState as FootballState;
    return (
      <div className="scorer-detail-stack">
        <div className="scorer-table-title">Goals ({s.goalLog.length})</div>
        {s.goalLog.length === 0 ? (
          <p className="muted">No goals recorded yet.</p>
        ) : (
          <ul className="scorer-plain-list">
            {s.goalLog.map((g, i) => (
              <li key={i}>
                <span className="tabular-nums">{g.minute ?? 0}&apos;</span>{" "}
                <strong>{g.side === "A" ? roster.teamAName : roster.teamBName}</strong>
                {g.scorerId ? ` · ${getPlayerDisplayName(roster, g.scorerId)}` : ""}
                {g.isPenalty ? " (PEN)" : ""}
                {g.isOwnGoal ? " (OG)" : ""}
              </li>
            ))}
          </ul>
        )}
        <div className="scorer-table-title">Disciplinary Cards ({s.cardLog.length})</div>
        {s.cardLog.length === 0 ? (
          <p className="muted">No cards issued.</p>
        ) : (
          <ul className="scorer-plain-list">
            {s.cardLog.map((c, i) => (
              <li key={i}>
                <span className="tabular-nums">{c.minute ?? 0}&apos;</span>{" "}
                <strong>{c.card}</strong> ·{" "}
                {c.side === "A" ? roster.teamAName : roster.teamBName}
                {c.playerId ? ` (${getPlayerDisplayName(roster, c.playerId)})` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (sport === "volleyball") {
    const s = sportState as VolleyballState;
    return (
      <div className="scorer-detail-stack">
        <div className="scorer-table-title">Set History</div>
        <table className="scorer-mini-table">
          <thead>
            <tr>
              <th>Set</th>
              <th>{roster.teamAName}</th>
              <th>{roster.teamBName}</th>
            </tr>
          </thead>
          <tbody>
            {s.setHistory.map((h) => (
              <tr key={h.setNumber}>
                <td>Set {h.setNumber}</td>
                <td className="tabular-nums">{h.pointsA}</td>
                <td className="tabular-nums">{h.pointsB}</td>
              </tr>
            ))}
            {!s.winner && (
              <tr>
                <td>Set {s.currentSetNumber} (Live)</td>
                <td className="tabular-nums">{s.pointsA}</td>
                <td className="tabular-nums">{s.pointsB}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (sport === "badminton" || sport === "table_tennis") {
    const s = sportState as BadmintonState | TableTennisState;
    return (
      <div className="scorer-detail-stack">
        <div className="scorer-table-title">Game-by-Game Scorecard</div>
        <table className="scorer-mini-table">
          <thead>
            <tr>
              <th>Game</th>
              <th>{roster.teamAName}</th>
              <th>{roster.teamBName}</th>
            </tr>
          </thead>
          <tbody>
            {s.gameHistory.map((g) => (
              <tr key={g.gameNumber}>
                <td>Game {g.gameNumber}</td>
                <td className="tabular-nums">{g.pointsA}</td>
                <td className="tabular-nums">{g.pointsB}</td>
              </tr>
            ))}
            {!s.winner && (
              <tr>
                <td>Game {s.currentGameNumber} (Live)</td>
                <td className="tabular-nums">{s.pointsA}</td>
                <td className="tabular-nums">{s.pointsB}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (sport === "kabaddi") {
    const s = sportState as KabaddiState;
    return (
      <table className="scorer-mini-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>{roster.teamAName}</th>
            <th>{roster.teamBName}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Raid Points</td>
            <td className="tabular-nums">{s.raidPointsA}</td>
            <td className="tabular-nums">{s.raidPointsB}</td>
          </tr>
          <tr>
            <td>Tackle Points</td>
            <td className="tabular-nums">{s.tacklePointsA}</td>
            <td className="tabular-nums">{s.tacklePointsB}</td>
          </tr>
          <tr>
            <td>Bonus Points</td>
            <td className="tabular-nums">{s.bonusPointsA}</td>
            <td className="tabular-nums">{s.bonusPointsB}</td>
          </tr>
          <tr>
            <td>All-Out Points</td>
            <td className="tabular-nums">{s.allOutPointsA}</td>
            <td className="tabular-nums">{s.allOutPointsB}</td>
          </tr>
          <tr>
            <td>Super Raids / Tackles</td>
            <td className="tabular-nums">
              {s.superRaidsA} / {s.superTacklesA}
            </td>
            <td className="tabular-nums">
              {s.superRaidsB} / {s.superTacklesB}
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  if (sport === "kho_kho") {
    const s = sportState as KhoKhoState;
    return (
      <div className="scorer-detail-stack">
        <div className="scorer-table-title">Dismissal Log ({s.outLog.length})</div>
        {s.outLog.length === 0 ? (
          <p className="muted">No outs recorded yet.</p>
        ) : (
          <ul className="scorer-plain-list">
            {s.outLog.map((o, i) => (
              <li key={i}>
                Inn {o.innings} · T{o.turn} ·{" "}
                <strong>
                  {o.chaserSide === "A" ? roster.teamAName : roster.teamBName}
                </strong>{" "}
                ({o.method.replace("_", " ")})
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (sport === "carrom") {
    const s = sportState as CarromState;
    return (
      <div className="scorer-detail-stack">
        <div className="scorer-table-title">Board History</div>
        <table className="scorer-mini-table">
          <thead>
            <tr>
              <th>Board</th>
              <th>Winner</th>
              <th>Pts</th>
              <th>Queen</th>
            </tr>
          </thead>
          <tbody>
            {s.boardHistory.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  Board 1 in progress
                </td>
              </tr>
            ) : (
              s.boardHistory.map((b) => (
                <tr key={b.boardNumber}>
                  <td className="tabular-nums">#{b.boardNumber}</td>
                  <td>
                    {b.winner === "A" ? roster.teamAName : roster.teamBName}
                  </td>
                  <td className="tabular-nums">+{b.points}</td>
                  <td>{b.queenBonus ? "+3" : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // Chess
  const cs = sportState as ChessState;
  return (
    <div className="scorer-detail-stack">
      <div className="scorer-table-title">Move Sheet ({cs.moves.length} plies)</div>
      {cs.moves.length === 0 ? (
        <p className="muted">No moves played yet.</p>
      ) : (
        <div className="scorer-chess-sheet">
          {cs.moves.map((m, i) => (
            <span key={i} className="scorer-chess-ply">
              {m.side === "A" ? `${m.moveNumber}. ` : ""}
              <strong>{m.san}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function SportStatsView({
  sport,
  sportState,
  roster,
}: {
  sport: SportId;
  sportState: AnySportState;
  roster: MatchRoster;
}) {
  const rows: Array<{ label: string; a: string | number; b: string | number }> =
    [];

  if (sport === "football") {
    const s = sportState as FootballState;
    rows.push(
      { label: "Goals", a: s.scoreA, b: s.scoreB },
      { label: "Shots", a: s.shotsA, b: s.shotsB },
      { label: "Shots on Target", a: s.shotsOnTargetA, b: s.shotsOnTargetB },
      { label: "Corners", a: s.cornersA, b: s.cornersB },
      { label: "Fouls", a: s.foulsA, b: s.foulsB },
      { label: "Yellow / Red", a: `${s.yellowCardsA}/${s.redCardsA}`, b: `${s.yellowCardsB}/${s.redCardsB}` }
    );
  } else if (sport === "cricket") {
    const s = sportState as CricketState;
    const runRate =
      s.legalBalls > 0 ? ((s.runs / s.legalBalls) * 6).toFixed(2) : "0.00";
    rows.push(
      { label: "Current Score", a: `${s.runs}/${s.wickets}`, b: `${s.oversLabel} ov` },
      { label: "Run Rate", a: runRate, b: s.target ? `Target ${s.target}` : "1st Inn" },
      { label: "Wides / No-Balls", a: s.extras.wides, b: s.extras.noBalls },
      { label: "Byes / Leg-Byes", a: s.extras.byes, b: s.extras.legByes },
      { label: "Total Extras", a: s.extras.total, b: s.freeHit ? "Free Hit" : "Normal" }
    );
  } else if (sport === "volleyball") {
    const s = sportState as VolleyballState;
    rows.push(
      { label: "Sets Won", a: s.setsWonA, b: s.setsWonB },
      { label: "Kills", a: s.killsA, b: s.killsB },
      { label: "Aces", a: s.acesA, b: s.acesB },
      { label: "Blocks", a: s.blocksA, b: s.blocksB },
      { label: "Timeouts Used", a: s.timeoutsA, b: s.timeoutsB }
    );
  } else if (sport === "kabaddi") {
    const s = sportState as KabaddiState;
    rows.push(
      { label: "Total Points", a: s.scoreA, b: s.scoreB },
      { label: "Raid / Bonus", a: `${s.raidPointsA} / ${s.bonusPointsA}`, b: `${s.raidPointsB} / ${s.bonusPointsB}` },
      { label: "Tackles / Super", a: `${s.tacklePointsA} / ${s.superTacklesA}`, b: `${s.tacklePointsB} / ${s.superTacklesB}` },
      { label: "All-Outs Inflicted", a: s.allOutsInflictedA, b: s.allOutsInflictedB },
      { label: "Active Defenders", a: s.activeDefendersA, b: s.activeDefendersB }
    );
  } else if (sport === "badminton") {
    const s = sportState as BadmintonState;
    rows.push(
      { label: "Games Won", a: s.gamesWonA, b: s.gamesWonB },
      { label: "Current Points", a: s.pointsA, b: s.pointsB },
      { label: "Smashes", a: s.smashesA, b: s.smashesB },
      { label: "Service Court", a: s.servingSide === "A" ? s.serviceCourt : "—", b: s.servingSide === "B" ? s.serviceCourt : "—" }
    );
  } else if (sport === "table_tennis") {
    const s = sportState as TableTennisState;
    rows.push(
      { label: "Games Won", a: s.gamesWonA, b: s.gamesWonB },
      { label: "Current Points", a: s.pointsA, b: s.pointsB },
      { label: "Timeouts Used", a: s.timeoutsUsedA, b: s.timeoutsUsedB }
    );
  } else if (sport === "kho_kho") {
    const s = sportState as KhoKhoState;
    rows.push(
      { label: "Total Outs Scored", a: s.scoreA, b: s.scoreB },
      { label: "Current Role", a: s.chaserSide === "A" ? "Chasing" : "Defending", b: s.chaserSide === "B" ? "Chasing" : "Defending" }
    );
  } else if (sport === "carrom") {
    const s = sportState as CarromState;
    rows.push(
      { label: "Match Score", a: s.scoreA, b: s.scoreB },
      { label: "Board Coins", a: `${s.boardWhitePocketed}/9 W`, b: `${s.boardBlackPocketed}/9 B` },
      { label: "Fouls", a: s.foulsA, b: s.foulsB }
    );
  } else {
    const s = sportState as ChessState;
    rows.push(
      { label: "Clock Remaining", a: formatClockMs(s.clockMsA), b: formatClockMs(s.clockMsB) },
      { label: "Plies Played", a: s.moves.filter((m) => m.side === "A").length, b: s.moves.filter((m) => m.side === "B").length },
      { label: "Result", a: s.result, b: s.resultReason || "In Play" }
    );
  }

  return (
    <table className="scorer-mini-table">
      <thead>
        <tr>
          <th>Metric</th>
          <th>{sport === "cricket" ? "Primary" : roster.teamAName}</th>
          <th>{sport === "cricket" ? "Context" : roster.teamBName}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className="tabular-nums">{r.a}</td>
            <td className="tabular-nums">{r.b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ============================================================================
// TIMELINE + INLINE MID-MATCH EVENT EDITOR (WITH FULL REPLAY)
// ============================================================================

export function EventTimelinePanel({
  sport,
  roster,
  allEvents,
  editingEventId,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  readOnly,
}: {
  sport: SportId;
  roster: MatchRoster;
  allEvents: readonly SportEvent[];
  editingEventId: string | null;
  onStartEdit: (eventId: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (eventId: string, patch: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const [showVoided, setShowVoided] = useState(false);
  const sportDef = SPORT_REGISTRY[sport];

  const displayed = [...allEvents]
    .reverse()
    .filter((ev) => showVoided || ev.voided !== true);

  return (
    <div className="scorer-timeline-wrap">
      <div className="scorer-timeline-header">
        <span className="muted" style={{ fontSize: 12 }}>
          {allEvents.filter((e) => !e.voided).length} active ·{" "}
          {allEvents.filter((e) => e.voided).length} undone
        </span>
        <label className="scorer-void-toggle">
          <input
            type="checkbox"
            checked={showVoided}
            onChange={(e) => setShowVoided(e.target.checked)}
          />
          Show undone tombstones
        </label>
      </div>

      {displayed.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          {readOnly
            ? "No match events recorded yet."
            : "No events recorded yet. Use the live scoring pad to record match events."}
        </p>
      ) : (
        <div className="scorer-timeline-list">
          {displayed.map((ev) => {
            const isEditing = !readOnly && editingEventId === ev.eventId;
            return (
              <div
                key={ev.eventId}
                className={`scorer-event-row ${ev.voided ? "voided" : ""} ${isEditing ? "editing" : ""}`}
              >
                <div className="scorer-event-top">
                  <div className="scorer-event-meta">
                    <span className="scorer-seq tabular-nums">#{ev.seq}</span>
                    <span className="scorer-clock-tag tabular-nums">
                      {formatClockMs(ev.matchClockMs)}
                    </span>
                    <span className="scorer-event-text">
                      {sportDef.formatEventLabel(ev, roster)}
                    </span>
                  </div>
                  {!readOnly && !ev.voided && !isEditing && (
                    <button
                      type="button"
                      className="scorer-edit-link"
                      onClick={() => onStartEdit(ev.eventId)}
                    >
                      Edit
                    </button>
                  )}
                  {ev.voided && <span className="scorer-void-tag">UNDONE</span>}
                </div>

                {isEditing && !ev.voided && (
                  <InlineEventEditor
                    sport={sport}
                    event={ev}
                    roster={roster}
                    onCancel={onCancelEdit}
                    onSave={(patch) => onSaveEdit(ev.eventId, patch)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InlineEventEditor({
  sport,
  event,
  roster,
  onCancel,
  onSave,
}: {
  sport: SportId;
  event: SportEvent;
  roster: MatchRoster;
  onCancel: () => void;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const payload = event.payload as Record<string, any>;
  const [draft, setDraft] = useState<Record<string, any>>({ ...payload });

  const setField = (k: string, v: unknown) =>
    setDraft((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="scorer-inline-editor">
      {sport === "cricket" && event.type === "BALL" && (
        <div className="scorer-editor-grid">
          <label className="scorer-field">
            <span>Runs off Bat</span>
            <input
              type="number"
              min={0}
              max={6}
              value={draft.runsOffBat ?? 0}
              onChange={(e) => setField("runsOffBat", Number(e.target.value) || 0)}
            />
          </label>
          <label className="scorer-field">
            <span>Extra Type</span>
            <select
              value={draft.extraType || "NONE"}
              onChange={(e) => setField("extraType", e.target.value)}
            >
              <option value="NONE">None</option>
              <option value="WIDE">Wide</option>
              <option value="NO_BALL">No Ball</option>
              <option value="BYE">Bye</option>
              <option value="LEG_BYE">Leg Bye</option>
            </select>
          </label>
          <label className="scorer-field">
            <span>Extra Runs</span>
            <input
              type="number"
              min={0}
              max={6}
              value={draft.extraRuns ?? 0}
              onChange={(e) => setField("extraRuns", Number(e.target.value) || 0)}
            />
          </label>
          <label className="scorer-field">
            <span>Wicket</span>
            <select
              value={draft.isWicket ? "YES" : "NO"}
              onChange={(e) => setField("isWicket", e.target.value === "YES")}
            >
              <option value="NO">No</option>
              <option value="YES">Yes</option>
            </select>
          </label>
        </div>
      )}

      {sport === "football" && event.type === "GOAL" && (
        <div className="scorer-editor-grid">
          <label className="scorer-field">
            <span>Side</span>
            <select
              value={draft.side || "A"}
              onChange={(e) => setField("side", e.target.value)}
            >
              <option value="A">{roster.teamAName}</option>
              <option value="B">{roster.teamBName}</option>
            </select>
          </label>
          <label className="scorer-field">
            <span>Minute</span>
            <input
              type="number"
              min={1}
              max={130}
              value={draft.minute ?? 1}
              onChange={(e) => setField("minute", Number(e.target.value) || 1)}
            />
          </label>
          <label className="scorer-field">
            <span>Own Goal</span>
            <select
              value={draft.isOwnGoal ? "YES" : "NO"}
              onChange={(e) => setField("isOwnGoal", e.target.value === "YES")}
            >
              <option value="NO">No</option>
              <option value="YES">Yes</option>
            </select>
          </label>
          <label className="scorer-field">
            <span>Penalty</span>
            <select
              value={draft.isPenalty ? "YES" : "NO"}
              onChange={(e) => setField("isPenalty", e.target.value === "YES")}
            >
              <option value="NO">No</option>
              <option value="YES">Yes</option>
            </select>
          </label>
        </div>
      )}

      {(sport === "volleyball" ||
        sport === "badminton" ||
        sport === "table_tennis") &&
        event.type === "POINT" && (
          <div className="scorer-editor-grid">
            <label className="scorer-field">
              <span>Point Winner</span>
              <select
                value={draft.side || "A"}
                onChange={(e) => setField("side", e.target.value)}
              >
                <option value="A">{roster.teamAName}</option>
                <option value="B">{roster.teamBName}</option>
              </select>
            </label>
          </div>
        )}

      {sport === "kabaddi" && event.type === "RAID" && (
        <div className="scorer-editor-grid">
          <label className="scorer-field">
            <span>Raiding Side</span>
            <select
              value={draft.raidingSide || "A"}
              onChange={(e) => setField("raidingSide", e.target.value)}
            >
              <option value="A">{roster.teamAName}</option>
              <option value="B">{roster.teamBName}</option>
            </select>
          </label>
          <label className="scorer-field">
            <span>Touch Points</span>
            <input
              type="number"
              min={0}
              max={7}
              value={draft.touchPoints ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                setField("touchPoints", v);
                setField("emptyRaid", v === 0 && !draft.bonusPoint);
              }}
            />
          </label>
          <label className="scorer-field">
            <span>Bonus Point</span>
            <select
              value={draft.bonusPoint ? "YES" : "NO"}
              onChange={(e) => {
                const bp = e.target.value === "YES";
                setField("bonusPoint", bp);
                setField("emptyRaid", (draft.touchPoints || 0) === 0 && !bp);
              }}
            >
              <option value="NO">No</option>
              <option value="YES">Yes (+1)</option>
            </select>
          </label>
        </div>
      )}

      {sport === "kho_kho" && event.type === "OUT" && (
        <div className="scorer-editor-grid">
          <label className="scorer-field">
            <span>Chaser Side</span>
            <select
              value={draft.chaserSide || "A"}
              onChange={(e) => setField("chaserSide", e.target.value)}
            >
              <option value="A">{roster.teamAName}</option>
              <option value="B">{roster.teamBName}</option>
            </select>
          </label>
          <label className="scorer-field">
            <span>Method</span>
            <select
              value={draft.method || "TOUCH"}
              onChange={(e) => setField("method", e.target.value)}
            >
              <option value="TOUCH">Touch</option>
              <option value="POLE_DIVE">Pole Dive</option>
              <option value="OUT_OF_FIELD">Out of Field</option>
              <option value="LATE_ENTRY">Late Entry</option>
            </select>
          </label>
        </div>
      )}

      {sport === "carrom" && event.type === "END_BOARD" && (
        <div className="scorer-editor-grid">
          <label className="scorer-field">
            <span>Board Winner</span>
            <select
              value={draft.winner || "A"}
              onChange={(e) => setField("winner", e.target.value)}
            >
              <option value="A">{roster.teamAName}</option>
              <option value="B">{roster.teamBName}</option>
            </select>
          </label>
          <label className="scorer-field">
            <span>Board Points</span>
            <input
              type="number"
              min={0}
              max={12}
              value={draft.points ?? 0}
              onChange={(e) => setField("points", Number(e.target.value) || 0)}
            />
          </label>
        </div>
      )}

      {sport === "chess" && event.type === "MOVE" && (
        <div className="scorer-editor-grid">
          <label className="scorer-field">
            <span>SAN Move</span>
            <input
              value={draft.san || ""}
              onChange={(e) => setField("san", e.target.value)}
            />
          </label>
        </div>
      )}

      {!(
        (sport === "cricket" && event.type === "BALL") ||
        (sport === "football" && event.type === "GOAL") ||
        ((sport === "volleyball" ||
          sport === "badminton" ||
          sport === "table_tennis") &&
          event.type === "POINT") ||
        (sport === "kabaddi" && event.type === "RAID") ||
        (sport === "kho_kho" && event.type === "OUT") ||
        (sport === "carrom" && event.type === "END_BOARD") ||
        (sport === "chess" && event.type === "MOVE")
      ) && (
        <div className="scorer-editor-grid">
          {"side" in draft && (
            <label className="scorer-field">
              <span>Side</span>
              <select
                value={draft.side || "A"}
                onChange={(e) => setField("side", e.target.value)}
              >
                <option value="A">{roster.teamAName}</option>
                <option value="B">{roster.teamBName}</option>
              </select>
            </label>
          )}
          {"points" in draft && (
            <label className="scorer-field">
              <span>Points</span>
              <input
                type="number"
                value={draft.points ?? 1}
                onChange={(e) => setField("points", Number(e.target.value) || 0)}
              />
            </label>
          )}
        </div>
      )}

      <div className="scorer-editor-actions">
        <button
          type="button"
          className="action-btn"
          style={{ padding: "6px 12px", fontSize: 12 }}
          onClick={() => onSave(draft)}
        >
          Save &amp; Replay
        </button>
        <button
          type="button"
          className="scorer-util-btn"
          style={{ padding: "6px 12px", fontSize: 12 }}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

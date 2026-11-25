import React from "react";
import { Link } from "react-router-dom";
import { ALL_SPORT_IDS, SPORT_REGISTRY, type AnySportState } from "./reducers";
import {
  EventTimelinePanel,
  formatClockMs,
  SportActionPad,
  SportScorecardView,
  SportStatsView,
} from "./SportPads";
import type {
  ClientAction,
  MobileDrawerTab,
  PcRightTab,
  ScorerClientState,
  SportEvent,
  SportId,
} from "./types";

export interface MatchScorerShellProps {
  state: ScorerClientState<AnySportState>;
  allEvents: readonly SportEvent[];
  dispatch: (action: ClientAction<SportEvent>) => void;
  onChangeSport: (sport: SportId) => void;
  onResetMatch: () => void;
  matchClockMs: number;
  clockRunning: boolean;
  onToggleClock: () => void;
  onResetClock: () => void;
  linkedMatchLabel?: string | null;
  canEdit?: boolean;
  canPushLiveScore?: boolean;
  onPushLiveScore?: () => void;
  onCompleteMatch?: () => void;
  pushFeedback?: string | null;
  pushError?: string | null;
  saving?: boolean;
  syncStatusLabel?: string;
}

export function MatchScorerShell({
  state,
  allEvents,
  dispatch,
  onChangeSport,
  onResetMatch,
  matchClockMs,
  clockRunning,
  onToggleClock,
  onResetClock,
  linkedMatchLabel,
  canEdit = false,
  canPushLiveScore,
  onPushLiveScore,
  onCompleteMatch,
  pushFeedback,
  pushError,
  saving = false,
  syncStatusLabel,
}: MatchScorerShellProps) {
  const { derived, viewport } = state;
  const sportDef = SPORT_REGISTRY[derived.sport];
  const summary = sportDef.formatScoreSummary(
    derived.sportState,
    derived.roster
  );
  const nextSeq = allEvents.length + 1;
  const readOnly = !canEdit;

  const renderPlayerName = (p: {
    id: string;
    userId?: number | null;
    name: string;
    number?: string;
  }) => {
    const label = `${p.number ? `#${p.number} ` : ""}${p.name}`;
    if (p.userId) {
      return (
        <Link to={`/players/${p.userId}`} className="player-link">
          {label}
        </Link>
      );
    }
    return <span>{label}</span>;
  };

  // ============================================================================
  // MOBILE VIEWPORT SHELL
  // ============================================================================
  if (viewport === "mobile") {
    const { drawerOpen, activeTab, editingEventId } = state.mobileUi;

    const openTab = (tab: MobileDrawerTab) => {
      const toggleClose = drawerOpen && activeTab === tab;
      dispatch({
        type: "SET_MOBILE_UI",
        patch: { drawerOpen: !toggleClose, activeTab: tab },
      });
    };

    return (
      <div className="scorer-mobile-shell">
        <header className="scorer-mobile-header">
          <div className="scorer-mobile-toprow">
            <select
              className="scorer-sport-select"
              aria-label="Select sport"
              value={derived.sport}
              onChange={(e) => onChangeSport(e.target.value as SportId)}
            >
              {ALL_SPORT_IDS.map((id) => (
                <option key={id} value={id}>
                  {SPORT_REGISTRY[id].label}
                </option>
              ))}
            </select>

            <div className="scorer-mobile-clock-group">
              {readOnly ? (
                <span className="scorer-clock-btn tabular-nums">
                  {formatClockMs(matchClockMs)}
                </span>
              ) : (
                <button
                  type="button"
                  className="scorer-clock-btn tabular-nums"
                  onClick={onToggleClock}
                >
                  {clockRunning ? "❚❚" : "▶"} {formatClockMs(matchClockMs)}
                </button>
              )}
              <button
                type="button"
                className="scorer-viewport-switch"
                onClick={() =>
                  dispatch({ type: "SET_VIEWPORT", viewport: "pc" })
                }
              >
                PC Desk
              </button>
            </div>
          </div>

          <div className="scorer-mobile-board">
            <div className="scorer-mobile-team">
              <span className="scorer-team-name">{derived.roster.teamAName}</span>
              <strong className="scorer-big-score tabular-nums">
                {summary.scoreA}
              </strong>
            </div>
            <div className="scorer-mobile-vs">VS</div>
            <div className="scorer-mobile-team right">
              <span className="scorer-team-name">{derived.roster.teamBName}</span>
              <strong className="scorer-big-score tabular-nums">
                {summary.scoreB}
              </strong>
            </div>
          </div>
          <div className="scorer-status-strip">
            {summary.statusLine}
            {syncStatusLabel ? ` · ${syncStatusLabel}` : ""}
          </div>
        </header>

        <main className="scorer-mobile-pad-area">
          {readOnly ? (
            <div className="scorer-readonly-wrap">
              <div className="readonly-banner">
                Read-Only Spectator Scorecard — Only the assigned Match Scorer or
                Sports Admin can record or edit live events.
              </div>
              <SportScorecardView
                sport={derived.sport}
                sportState={derived.sportState}
                roster={derived.roster}
              />
            </div>
          ) : (
            <SportActionPad
              sport={derived.sport}
              sportState={derived.sportState}
              roster={derived.roster}
              nextSeq={nextSeq}
              matchClockMs={matchClockMs}
              dispatch={dispatch}
              compact={true}
            />
          )}
        </main>

        {drawerOpen && (
          <section className="scorer-mobile-drawer" aria-label="Match details">
            <div className="scorer-drawer-bar">
              <strong className="scorer-drawer-title">
                {activeTab === "scorecard"
                  ? "Scorecard"
                  : activeTab === "timeline"
                    ? readOnly
                      ? "Event Timeline"
                      : "Timeline & Event Edit"
                    : activeTab === "stats"
                      ? "Match Stats"
                      : "Match Controls"}
              </strong>
              <button
                type="button"
                className="scorer-drawer-close"
                onClick={() =>
                  dispatch({
                    type: "SET_MOBILE_UI",
                    patch: { drawerOpen: false, editingEventId: null },
                  })
                }
              >
                Close
              </button>
            </div>

            <div className="scorer-drawer-body">
              {activeTab === "scorecard" && (
                <SportScorecardView
                  sport={derived.sport}
                  sportState={derived.sportState}
                  roster={derived.roster}
                />
              )}
              {activeTab === "timeline" && (
                <EventTimelinePanel
                  sport={derived.sport}
                  roster={derived.roster}
                  allEvents={allEvents}
                  editingEventId={editingEventId}
                  readOnly={readOnly}
                  onStartEdit={(eventId) =>
                    !readOnly &&
                    dispatch({
                      type: "SET_MOBILE_UI",
                      patch: { editingEventId: eventId },
                    })
                  }
                  onCancelEdit={() =>
                    dispatch({
                      type: "SET_MOBILE_UI",
                      patch: { editingEventId: null },
                    })
                  }
                  onSaveEdit={(eventId, payloadPatch) => {
                    if (readOnly) return;
                    dispatch({ type: "EDIT_EVENT", eventId, payloadPatch });
                    dispatch({
                      type: "SET_MOBILE_UI",
                      patch: { editingEventId: null },
                    });
                  }}
                />
              )}
              {activeTab === "stats" && (
                <SportStatsView
                  sport={derived.sport}
                  sportState={derived.sportState}
                  roster={derived.roster}
                />
              )}
              {activeTab === "controls" && (
                <div className="scorer-controls-panel">
                  {linkedMatchLabel && (
                    <div className="scorer-summary-line">
                      Linked Fixture: <strong>{linkedMatchLabel}</strong>
                    </div>
                  )}
                  {readOnly ? (
                    <p className="muted" style={{ fontSize: 13 }}>
                      Controls are locked in Read-Only mode.
                    </p>
                  ) : (
                    <>
                      <div className="scorer-utility-row">
                        <button
                          type="button"
                          className="scorer-util-btn"
                          onClick={onToggleClock}
                        >
                          {clockRunning ? "Pause Clock" : "Start Clock"}
                        </button>
                        <button
                          type="button"
                          className="scorer-util-btn"
                          onClick={onResetClock}
                        >
                          Reset Clock
                        </button>
                        <button
                          type="button"
                          className="scorer-util-btn accent-crimson"
                          onClick={onResetMatch}
                        >
                          Clear Events
                        </button>
                      </div>
                      {canPushLiveScore && onPushLiveScore && (
                        <button
                          type="button"
                          className="action-btn"
                          disabled={saving}
                          style={{ width: "100%", marginTop: 10 }}
                          onClick={onPushLiveScore}
                        >
                          {saving
                            ? "Syncing..."
                            : "Save & Push Live Score"}
                        </button>
                      )}
                      {canPushLiveScore && onCompleteMatch && (
                        <button
                          type="button"
                          className="action-btn"
                          disabled={saving}
                          style={{
                            width: "100%",
                            marginTop: 8,
                            background: "#b91c1c",
                            color: "#f4efe6",
                          }}
                          onClick={onCompleteMatch}
                        >
                          Finalize Match &amp; Update Standings
                        </button>
                      )}
                    </>
                  )}
                  {pushFeedback && (
                    <p style={{ color: "#d4a038", fontSize: 13, marginTop: 8 }}>
                      {pushFeedback}
                    </p>
                  )}
                  {pushError && (
                    <p className="error-text" style={{ marginTop: 8 }}>
                      {pushError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        <footer className="scorer-mobile-bottom-bar">
          {!readOnly && (
            <button
              type="button"
              className="scorer-undo-btn"
              disabled={!derived.canUndo}
              onClick={() => dispatch({ type: "UNDO_LAST" })}
            >
              Undo Last
            </button>
          )}
          {(["scorecard", "timeline", "stats", "controls"] as MobileDrawerTab[]).map(
            (tab) => (
              <button
                key={tab}
                type="button"
                className={`scorer-tab-btn ${drawerOpen && activeTab === tab ? "active" : ""}`}
                onClick={() => openTab(tab)}
              >
                {tab === "scorecard"
                  ? "Card"
                  : tab === "timeline"
                    ? `Log (${derived.activeEvents.length})`
                    : tab === "stats"
                      ? "Stats"
                      : "More"}
              </button>
            )
          )}
        </footer>
      </div>
    );
  }

  // ============================================================================
  // PC COMMAND DESK SHELL
  // ============================================================================
  const { rightTab, editingEventId } = state.pcUi;

  return (
    <div className="scorer-pc-shell">
      <aside className="scorer-pc-left">
        <div className="scorer-desk-block">
          <div className="scorer-desk-heading-row">
            <h2 className="scorer-desk-heading">Sports (9)</h2>
            <button
              type="button"
              className="scorer-viewport-switch"
              onClick={() =>
                dispatch({ type: "SET_VIEWPORT", viewport: "mobile" })
              }
            >
              Mobile View
            </button>
          </div>
          <div className="scorer-sport-list">
            {ALL_SPORT_IDS.map((id) => {
              const def = SPORT_REGISTRY[id];
              const active = derived.sport === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`scorer-sport-item ${active ? "active" : ""}`}
                  onClick={() => onChangeSport(id)}
                >
                  <span className="scorer-sport-item-title">{def.label}</span>
                  <span className="scorer-sport-item-sub">
                    {def.shortSubtitle}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="scorer-desk-block">
          <h3 className="scorer-desk-heading">Match Roster</h3>
          <div className="scorer-roster-group">
            <div className="scorer-roster-team">{derived.roster.teamAName}</div>
            {derived.roster.playersA.map((p) => (
              <div key={p.id} className="scorer-roster-row">
                {renderPlayerName(p)}
                <span className="muted">{p.role || ""}</span>
              </div>
            ))}
          </div>
          <div className="scorer-roster-group">
            <div className="scorer-roster-team">{derived.roster.teamBName}</div>
            {derived.roster.playersB.map((p) => (
              <div key={p.id} className="scorer-roster-row">
                {renderPlayerName(p)}
                <span className="muted">{p.role || ""}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="scorer-pc-center">
        {readOnly && (
          <div className="readonly-banner" style={{ marginBottom: 14 }}>
            Read-Only Spectator Mode — Scoring controls, Undo, Reset, and Timeline
            edits are restricted to the assigned Match Scorer or Sports Admin.
          </div>
        )}

        <section className="scorer-broadcast-card">
          <div className="scorer-broadcast-meta">
            <div>
              <span className="scorer-sport-tag">{sportDef.label}</span>
              <span className="muted" style={{ marginLeft: 10, fontSize: 13 }}>
                {derived.roster.stage || "Live Fixture"} ·{" "}
                {derived.roster.venue || "IIITT Campus"}
                {syncStatusLabel ? ` · ${syncStatusLabel}` : ""}
              </span>
            </div>
            <div className="scorer-clock-controls">
              <span className="scorer-clock-readout tabular-nums">
                {formatClockMs(matchClockMs)}
              </span>
              {!readOnly && (
                <>
                  <button
                    type="button"
                    className="scorer-util-btn"
                    onClick={onToggleClock}
                  >
                    {clockRunning ? "Pause" : "Start"}
                  </button>
                  <button
                    type="button"
                    className="scorer-util-btn"
                    onClick={onResetClock}
                  >
                    Reset
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="scorer-scoreboard-grid">
            <div className="scorer-team-block">
              <div className="scorer-team-title">{derived.roster.teamAName}</div>
              <div className="scorer-score-display tabular-nums">
                {summary.scoreA}
              </div>
            </div>
            <div className="scorer-vs-divider">VS</div>
            <div className="scorer-team-block right">
              <div className="scorer-team-title">{derived.roster.teamBName}</div>
              <div className="scorer-score-display tabular-nums">
                {summary.scoreB}
              </div>
            </div>
          </div>

          <div className="scorer-broadcast-footer">
            <div>
              <div className="scorer-status-line">{summary.statusLine}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {summary.breakdown}
              </div>
            </div>
            {!readOnly && (
              <div className="scorer-primary-actions">
                <button
                  type="button"
                  className="scorer-undo-btn"
                  disabled={!derived.canUndo}
                  onClick={() => dispatch({ type: "UNDO_LAST" })}
                >
                  Undo Last ({derived.activeEvents.length})
                </button>
                <button
                  type="button"
                  className="scorer-util-btn"
                  onClick={onResetMatch}
                >
                  Reset Match
                </button>
                {canPushLiveScore && onPushLiveScore && (
                  <button
                    type="button"
                    className="action-btn"
                    disabled={saving}
                    onClick={onPushLiveScore}
                  >
                    {saving ? "Saving..." : "Save & Push Live"}
                  </button>
                )}
                {canPushLiveScore && onCompleteMatch && (
                  <button
                    type="button"
                    className="action-btn"
                    disabled={saving}
                    style={{ background: "#b91c1c", color: "#f4efe6" }}
                    onClick={onCompleteMatch}
                  >
                    Complete Match
                  </button>
                )}
              </div>
            )}
          </div>
          {pushFeedback && (
            <div style={{ color: "#d4a038", fontSize: 13, marginTop: 8 }}>
              {pushFeedback}
            </div>
          )}
          {pushError && (
            <div className="error-text" style={{ marginTop: 8 }}>
              {pushError}
            </div>
          )}
        </section>

        <section className="scorer-pad-card">
          {readOnly ? (
            <>
              <div className="scorer-pad-card-header">
                <h3 className="scorer-desk-heading">Live Scorecard</h3>
                <span className="muted" style={{ fontSize: 12 }}>
                  Read-only spectator view
                </span>
              </div>
              <SportScorecardView
                sport={derived.sport}
                sportState={derived.sportState}
                roster={derived.roster}
              />
            </>
          ) : (
            <>
              <div className="scorer-pad-card-header">
                <h3 className="scorer-desk-heading">Live Scoring Pad</h3>
                <span className="muted" style={{ fontSize: 12 }}>
                  Event-sourced · Auto-saved to server &amp; offline queue
                </span>
              </div>
              <SportActionPad
                sport={derived.sport}
                sportState={derived.sportState}
                roster={derived.roster}
                nextSeq={nextSeq}
                matchClockMs={matchClockMs}
                dispatch={dispatch}
                compact={false}
              />
            </>
          )}
        </section>
      </main>

      <aside className="scorer-pc-right">
        <div className="scorer-right-tabs">
          {(["timeline", "scorecard", "stats"] as PcRightTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`scorer-right-tab ${rightTab === tab ? "active" : ""}`}
              onClick={() =>
                dispatch({ type: "SET_PC_UI", patch: { rightTab: tab } })
              }
            >
              {tab === "timeline"
                ? `Timeline (${derived.activeEvents.length})`
                : tab === "scorecard"
                  ? "Scorecard"
                  : "Stats"}
            </button>
          ))}
        </div>

        <div className="scorer-right-body">
          {rightTab === "timeline" && (
            <EventTimelinePanel
              sport={derived.sport}
              roster={derived.roster}
              allEvents={allEvents}
              editingEventId={editingEventId}
              readOnly={readOnly}
              onStartEdit={(eventId) =>
                !readOnly &&
                dispatch({
                  type: "SET_PC_UI",
                  patch: { editingEventId: eventId },
                })
              }
              onCancelEdit={() =>
                dispatch({
                  type: "SET_PC_UI",
                  patch: { editingEventId: null },
                })
              }
              onSaveEdit={(eventId, payloadPatch) => {
                if (readOnly) return;
                dispatch({ type: "EDIT_EVENT", eventId, payloadPatch });
                dispatch({
                  type: "SET_PC_UI",
                  patch: { editingEventId: null },
                });
              }}
            />
          )}

          {rightTab === "scorecard" && (
            <SportScorecardView
              sport={derived.sport}
              sportState={derived.sportState}
              roster={derived.roster}
            />
          )}

          {rightTab === "stats" && (
            <SportStatsView
              sport={derived.sport}
              sportState={derived.sportState}
              roster={derived.roster}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

export default MatchScorerShell;

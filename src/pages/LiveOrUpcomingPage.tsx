import React from "react";
import { Link } from "react-router-dom";
import { formatLocalDateTime } from "../lib/api";
import { useLiveMatchesStream } from "../hooks/useLiveMatchesStream";

export default function LiveOrUpcomingPage({
  mode,
}: {
  mode: "LIVE" | "UPCOMING";
}) {
  const { live, upcoming, connected, loading, error } = useLiveMatchesStream();

  const list = mode === "LIVE" ? live : upcoming;

  return (
    <div className="container">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <h1 className="section-heading" style={{ marginBottom: 0 }}>
          {mode === "LIVE" ? "Live Matches" : "Upcoming Fixtures"}
        </h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {connected ? "● Live updates active" : "Reconnecting..."}
          </span>
          <Link
            to={mode === "LIVE" ? "/upcoming" : "/live"}
            className="status-tag"
            style={{ textDecoration: "none" }}
          >
            View{" "}
            {mode === "LIVE"
              ? `Upcoming (${upcoming.length})`
              : `Live (${live.length})`}
          </Link>
        </div>
      </div>

      {loading && <p className="muted">Loading matches...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && list.length === 0 ? (
        <div className="panel">
          <p className="muted" style={{ margin: 0 }}>
            {mode === "LIVE"
              ? "No matches are currently live."
              : "No upcoming fixtures are scheduled right now."}
          </p>
          {mode === "LIVE" && upcoming.length > 0 && (
            <p style={{ marginTop: 10, marginBottom: 0 }}>
              <Link to="/upcoming" style={{ color: "#d4a038" }}>
                View {upcoming.length} upcoming fixture
                {upcoming.length === 1 ? "" : "s"} →
              </Link>
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {list.map((m) => (
            <div key={m.id} className="panel" style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <span className="status-tag">
                  {m.status === "LIVE" ? "● LIVE" : "UPCOMING"} · {m.sportName}{" "}
                  · {m.stage}
                </span>
                <span className="muted">
                  {formatLocalDateTime(m.scheduledAt || m.scheduledTime)} ·{" "}
                  {m.venue}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 14,
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800 }}>
                  {m.teamA}{" "}
                  <span style={{ color: "#d4a038" }} className="tabular-nums">
                    {m.scoreA}
                  </span>{" "}
                  <span className="muted" style={{ fontSize: 14 }}>
                    vs
                  </span>{" "}
                  {m.teamB}{" "}
                  <span style={{ color: "#d4a038" }} className="tabular-nums">
                    {m.scoreB}
                  </span>
                </div>
                <Link
                  to={`/scorer?matchId=${m.id}&sport=${encodeURIComponent(m.sportName)}`}
                  className="action-btn"
                  style={{
                    textDecoration: "none",
                    fontSize: 12,
                    padding: "7px 12px",
                  }}
                >
                  Open Live Scorecard
                </Link>
              </div>

              <p style={{ margin: "8px 0 4px", color: "#d4a038" }}>
                {m.resultSummary}
              </p>
              {m.detailedBreakdown && (
                <p
                  className="muted"
                  style={{ margin: 0, whiteSpace: "pre-line" }}
                >
                  {m.detailedBreakdown}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

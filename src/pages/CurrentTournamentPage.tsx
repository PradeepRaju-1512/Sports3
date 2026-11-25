import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DemoUser } from "../App";
import { apiFetch, formatLocalDateTime, toDateTimeLocalValue } from "../lib/api";
import { useLiveMatchesStream } from "../hooks/useLiveMatchesStream";

interface RosterMember {
  id: number;
  userId?: number | null;
  playerName: string;
  playerRole: string;
  batchYear: string;
  branch: string;
}

interface StandingRow {
  id: number;
  sportName: string;
  teamName: string;
  captainUserId?: number | null;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  points: number;
  nrrOrDiff: string;
  roster?: RosterMember[];
}

interface MatchRow {
  id: number;
  sportName: string;
  stage: string;
  teamA: string;
  teamB: string;
  scoreA: string;
  scoreB: string;
  status: string;
  scheduledTime: string;
  scheduledAt?: string | null;
  venue: string;
  resultSummary: string;
  detailedBreakdown: string;
  scorerUserId: number | null;
}

interface TeamSubmissionRow {
  id: number;
  tournamentId: number;
  teamId: number | null;
  sportName: string;
  teamName: string;
  captainUserId: number;
  captainName: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "LOCKED" | "CHANGES_REQUESTED";
  players: Array<{
    userId?: number | null;
    name: string;
    role: string;
    jersey?: string;
  }>;
  reviewerNotes: string;
  updatedAt: string;
}

export default function CurrentTournamentPage({
  currentUser,
  onLiveStateChange,
}: {
  currentUser: DemoUser | null;
  onLiveStateChange: () => void;
}) {
  const [tournament, setTournament] = useState<{
    id: number;
    name: string;
    dateRange: string;
    structureNotes: string;
    sportsIncluded: string;
  } | null>(null);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [submissions, setSubmissions] = useState<TeamSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Schedule fixture form
  const [sportName, setSportName] = useState("Cricket");
  const [stage, setStage] = useState("Group Match");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [scheduledTime, setScheduledTime] = useState(() =>
    toDateTimeLocalValue(new Date(Date.now() + 3600_000).toISOString())
  );
  const [venue, setVenue] = useState("IIITT Cricket Ground");

  // Captain team-list submission form
  const [subSport, setSubSport] = useState("Cricket");
  const [subTeamName, setSubTeamName] = useState("");
  const [subPlayersText, setSubPlayersText] = useState(
    "Devansh Kulkarni | Captain / Batter | 7\nRohan Verma | All-Rounder | 18"
  );

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/tournaments/current", {
        cache: "no-store",
      });
      if (!res.ok) {
        setErrorMsg("Unable to load current tournament.");
        return;
      }
      const d = await res.json();
      setTournament(d.tournament || null);
      setStandings(d.standings || []);
      setMatches(d.matches || []);
      setSubmissions(d.teamSubmissions || []);
    } catch {
      setErrorMsg("Network error loading tournament feed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, currentUser?.id]);

  // Real-time SSE updates when any match goes live, updates score, completes, or reopens
  useLiveMatchesStream({
    onMatchUpdate: () => {
      void load();
    },
  });

  const isAdmin = Boolean(
    currentUser &&
      ["SPORTS_SECRETARY", "FACULTY_ADVISOR"].includes(currentUser.role)
  );
  const canCreateSubmission = Boolean(
    currentUser && (currentUser.role === "CAPTAIN" || isAdmin)
  );

  const canOperateMatch = (m: MatchRow) =>
    Boolean(
      currentUser &&
        (isAdmin || (m.scorerUserId && m.scorerUserId === currentUser.id))
    );

  async function handleScheduleMatch(e: React.FormEvent) {
    e.preventDefault();
    if (!tournament || !teamA.trim() || !teamB.trim()) return;
    setBusy("schedule-match");
    setFeedback(null);
    setErrorMsg(null);
    try {
      const res = await apiFetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: tournament.id,
          sportName,
          stage,
          teamA: teamA.trim(),
          teamB: teamB.trim(),
          scheduledTime: scheduledTime
            ? new Date(scheduledTime).toISOString()
            : undefined,
          venue,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(out.error || "Unable to schedule fixture.");
        return;
      }
      setTeamA("");
      setTeamB("");
      setFeedback(`Scheduled ${teamA} vs ${teamB} (${sportName}).`);
      await load();
      onLiveStateChange();
    } catch {
      setErrorMsg("Network error scheduling fixture.");
    } finally {
      setBusy(null);
    }
  }

  async function handleGoLive(matchId: number) {
    setBusy(`go-live-${matchId}`);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/matches/${matchId}/go-live`, {
        method: "POST",
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(out.error || "Unable to start match.");
        return;
      }
      setFeedback("Match is now LIVE.");
      await load();
      onLiveStateChange();
    } catch {
      setErrorMsg("Network error starting match.");
    } finally {
      setBusy(null);
    }
  }

  async function handleReopenMatch(matchId: number) {
    setBusy(`reopen-${matchId}`);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/matches/${matchId}/reopen`, {
        method: "POST",
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(out.error || "Unable to reopen match.");
        return;
      }
      setFeedback("Match reopened to LIVE and points table recalculated.");
      await load();
      onLiveStateChange();
    } catch {
      setErrorMsg("Network error reopening match.");
    } finally {
      setBusy(null);
    }
  }

  async function handleArchiveTournament() {
    if (!tournament) return;
    setBusy("archive-tournament");
    setFeedback(null);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/tournaments/${tournament.id}/archive`, {
        method: "POST",
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(out.error || "Unable to archive tournament.");
        return;
      }
      setFeedback(`Archived ${tournament.name}.`);
      await load();
      onLiveStateChange();
    } catch {
      setErrorMsg("Network error archiving tournament.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmitTeamList(submitNow: boolean) {
    if (!tournament || !subTeamName.trim()) {
      setErrorMsg("Enter a team name before saving squad submission.");
      return;
    }
    const players = subPlayersText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, role, jersey] = line.split("|").map((s) => s.trim());
        return { name: name || "", role: role || "Player", jersey: jersey || "" };
      })
      .filter((p) => p.name.length > 0);

    setBusy("create-submission");
    setFeedback(null);
    setErrorMsg(null);
    try {
      const res = await apiFetch("/api/team-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: tournament.id,
          sportName: subSport,
          teamName: subTeamName.trim(),
          players,
          submitNow,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(out.error || "Unable to save squad submission.");
        return;
      }
      setSubTeamName("");
      setFeedback(
        submitNow
          ? `Submitted ${subTeamName} (${subSport}) for Sports Secretary review.`
          : `Saved ${subTeamName} (${subSport}) as DRAFT.`
      );
      await load();
    } catch {
      setErrorMsg("Network error saving squad submission.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmissionStatus(
    subId: number,
    status: "SUBMITTED" | "APPROVED" | "LOCKED" | "CHANGES_REQUESTED",
    reviewerNotes?: string
  ) {
    setBusy(`sub-${subId}-${status}`);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/team-submissions/${subId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewerNotes }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(out.error || "Unable to update submission status.");
        return;
      }
      setFeedback(`Team submission updated to ${status}.`);
      await load();
    } catch {
      setErrorMsg("Network error updating submission.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="container">
        <p className="muted">Loading current tournament...</p>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="container">
        <div className="panel">
          <h1 className="section-heading">Current Tournament</h1>
          <p className="muted">No tournament is currently active.</p>
          <Link to="/overview" style={{ color: "#d4a038" }}>
            Browse Overview &amp; Upcoming Tournaments →
          </Link>
        </div>
      </div>
    );
  }

  const liveMatches = matches.filter((m) => m.status === "LIVE");
  const upcomingMatches = matches.filter((m) => m.status === "UPCOMING");
  const completedMatches = matches.filter((m) => m.status === "COMPLETED");

  return (
    <div className="container">
      <div className="panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, textTransform: "uppercase", color: "#d4a038" }}>
              {tournament.name}
            </h1>
            <p className="muted" style={{ margin: "6px 0" }}>
              {tournament.dateRange} · Sports: {tournament.sportsIncluded}
            </p>
            <p style={{ margin: 0 }}>{tournament.structureNotes}</p>
          </div>
          {isAdmin && (
            <button
              type="button"
              className="action-btn"
              style={{ background: "#b91c1c", color: "#f4efe6" }}
              disabled={busy !== null}
              onClick={handleArchiveTournament}
            >
              {busy === "archive-tournament"
                ? "Archiving..."
                : "Archive Tournament"}
            </button>
          )}
        </div>
        {feedback && (
          <p style={{ color: "#d4a038", marginTop: 10, marginBottom: 0 }}>
            {feedback}
          </p>
        )}
        {errorMsg && (
          <p className="error-text" style={{ marginTop: 10, marginBottom: 0 }}>
            {errorMsg}
          </p>
        )}
      </div>

      {/* ALL ACTIVE LIVE MATCHES */}
      <section className="panel">
        <h2 className="section-heading">
          Live Now ({liveMatches.length})
        </h2>
        {liveMatches.length === 0 ? (
          <p className="muted">No matches are live right now.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {liveMatches.map((m) => (
              <div key={m.id} className="notice-item">
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <span className="status-tag">
                    ● LIVE · {m.sportName} · {m.stage}
                  </span>
                  <span className="muted">{m.venue}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
                  <strong style={{ fontSize: 18 }}>
                    {m.teamA}{" "}
                    <span style={{ color: "#d4a038" }} className="tabular-nums">
                      {m.scoreA}
                    </span>{" "}
                    vs {m.teamB}{" "}
                    <span style={{ color: "#d4a038" }} className="tabular-nums">
                      {m.scoreB}
                    </span>
                  </strong>
                  <Link
                    to={`/scorer?matchId=${m.id}&sport=${encodeURIComponent(m.sportName)}`}
                    className="action-btn"
                    style={{ textDecoration: "none", fontSize: 12, padding: "6px 12px" }}
                  >
                    {canOperateMatch(m) ? "Open Live Scorer" : "View Live Scorecard"}
                  </Link>
                </div>
                <div className="muted" style={{ marginTop: 4 }}>
                  {m.resultSummary}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* STANDINGS & CLICKABLE ROSTERS */}
      <section className="panel">
        <h2 className="section-heading">Points Table &amp; Squads</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Sport</th>
              <th>Team</th>
              <th>P</th>
              <th>W</th>
              <th>L</th>
              <th>D</th>
              <th>Pts</th>
              <th>NRR / Diff</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr key={row.id}>
                <td>{row.sportName}</td>
                <td>
                  <strong>{row.teamName}</strong>
                  {row.roster && row.roster.length > 0 && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {row.roster.map((p, idx) => (
                        <React.Fragment key={p.id}>
                          {idx > 0 && ", "}
                          {p.userId ? (
                            <Link to={`/players/${p.userId}`} className="player-link">
                              {p.playerName}
                            </Link>
                          ) : (
                            p.playerName
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </td>
                <td className="tabular-nums">{row.played}</td>
                <td className="tabular-nums">{row.won}</td>
                <td className="tabular-nums">{row.lost}</td>
                <td className="tabular-nums">{row.drawn}</td>
                <td className="tabular-nums" style={{ color: "#d4a038", fontWeight: 700 }}>
                  {row.points}
                </td>
                <td className="tabular-nums">{row.nrrOrDiff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* UPCOMING FIXTURES WITH EXPLICIT GO-LIVE */}
      <section className="panel">
        <h2 className="section-heading">Upcoming Fixtures ({upcomingMatches.length})</h2>
        {upcomingMatches.length === 0 ? (
          <p className="muted">No upcoming fixtures queued.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {upcomingMatches.map((m) => (
              <div key={m.id} className="notice-item">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <strong>
                      {m.sportName} ({m.stage}): {m.teamA} vs {m.teamB}
                    </strong>
                    <div className="muted">
                      {formatLocalDateTime(m.scheduledAt || m.scheduledTime)} ·{" "}
                      {m.venue}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {canOperateMatch(m) && (
                      <button
                        type="button"
                        className="action-btn"
                        disabled={busy !== null}
                        onClick={() => handleGoLive(m.id)}
                      >
                        {busy === `go-live-${m.id}` ? "Starting..." : "Go Live"}
                      </button>
                    )}
                    <Link
                      to={`/scorer?matchId=${m.id}&sport=${encodeURIComponent(m.sportName)}`}
                      className="status-tag"
                      style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                    >
                      Scorer
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SCHEDULE NEW FIXTURE (ADMIN) */}
      {isAdmin && (
        <section className="panel">
          <h2 className="section-heading">Schedule New Match</h2>
          <form onSubmit={handleScheduleMatch} className="form-grid">
            <select
              value={sportName}
              onChange={(e) => setSportName(e.target.value)}
            >
              {[
                "Cricket",
                "Football",
                "Volleyball",
                "Kho Kho",
                "Kabaddi",
                "Badminton",
                "Table Tennis",
                "Carrom",
                "Chess",
              ].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="Group Match">Group Match</option>
              <option value="Quarter-Final">Quarter-Final</option>
              <option value="Semi-Final">Semi-Final</option>
              <option value="Final">Final</option>
            </select>
            <input
              placeholder="Team A"
              value={teamA}
              onChange={(e) => setTeamA(e.target.value)}
              required
            />
            <input
              placeholder="Team B"
              value={teamB}
              onChange={(e) => setTeamB(e.target.value)}
              required
            />
            <input
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              required
            />
            <input
              placeholder="Venue"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              required
            />
            <button
              type="submit"
              className="action-btn"
              disabled={busy !== null}
            >
              {busy === "schedule-match" ? "Scheduling..." : "Add Fixture"}
            </button>
          </form>
        </section>
      )}

      {/* CAPTAIN TEAM-LIST SUBMISSIONS (ONLY SHOWN TO CAPTAINS & AUTHORIZED OFFICIALS) */}
      {(canCreateSubmission || submissions.length > 0) && (
      <section className="panel">
        <h2 className="section-heading">
          Captain Team-List Submissions ({submissions.length})
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Captains submit official squads for non-auction events and Playing XI
          verification. Approved squads automatically feed into the Live Match Scorer.
        </p>

        {canCreateSubmission && (
          <div
            style={{
              border: "1px solid rgba(244,239,230,0.14)",
              padding: 14,
              marginBottom: 16,
            }}
          >
            <strong style={{ color: "#d4a038" }}>
              Create Squad Submission
            </strong>
            <div className="form-grid">
              <select
                value={subSport}
                onChange={(e) => setSubSport(e.target.value)}
              >
                {[
                  "Cricket",
                  "Football",
                  "Volleyball",
                  "Kho Kho",
                  "Kabaddi",
                  "Badminton",
                  "Table Tennis",
                  "Carrom",
                  "Chess",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                placeholder="Team Name (e.g., Trichy Titans)"
                value={subTeamName}
                onChange={(e) => setSubTeamName(e.target.value)}
              />
            </div>
            <label style={{ display: "block", marginTop: 10 }}>
              <span className="muted" style={{ display: "block", marginBottom: 4 }}>
                Players (one per line: Name | Role | Jersey #)
              </span>
              <textarea
                rows={4}
                style={{
                  width: "100%",
                  background: "#0d0d11",
                  color: "#f4efe6",
                  border: "1px solid rgba(244,239,230,0.2)",
                  padding: 8,
                }}
                value={subPlayersText}
                onChange={(e) => setSubPlayersText(e.target.value)}
              />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="action-btn"
                disabled={busy !== null}
                onClick={() => handleSubmitTeamList(false)}
              >
                Save Draft
              </button>
              <button
                type="button"
                className="action-btn"
                disabled={busy !== null}
                onClick={() => handleSubmitTeamList(true)}
              >
                Submit for Approval
              </button>
            </div>
          </div>
        )}

        {submissions.length === 0 ? (
          <p className="muted">No team submissions yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {submissions.map((sub) => {
              const isOwnCaptain = currentUser?.id === sub.captainUserId;
              return (
                <div key={sub.id} className="notice-item">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <strong>
                      {sub.teamName} · {sub.sportName}{" "}
                      <span className="muted">
                        (Captain:{" "}
                        <Link
                          to={`/players/${sub.captainUserId}`}
                          className="player-link"
                        >
                          {sub.captainName}
                        </Link>
                        )
                      </span>
                    </strong>
                    <span className="status-tag">{sub.status}</span>
                  </div>

                  <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                    Squad ({sub.players.length}):{" "}
                    {sub.players.map((p, i) => (
                      <React.Fragment key={`${sub.id}-${i}`}>
                        {i > 0 && ", "}
                        {p.userId ? (
                          <Link
                            to={`/players/${p.userId}`}
                            className="player-link"
                          >
                            {p.name}
                          </Link>
                        ) : (
                          p.name
                        )}{" "}
                        ({p.role}
                        {p.jersey ? ` #${p.jersey}` : ""})
                      </React.Fragment>
                    ))}
                  </div>

                  {sub.reviewerNotes && (
                    <div style={{ color: "#d4a038", fontSize: 12, marginTop: 6 }}>
                      Reviewer note: {sub.reviewerNotes}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 10,
                    }}
                  >
                    {isOwnCaptain &&
                      (sub.status === "DRAFT" ||
                        sub.status === "CHANGES_REQUESTED") && (
                        <button
                          type="button"
                          className="action-btn"
                          style={{ padding: "5px 10px", fontSize: 12 }}
                          disabled={busy !== null}
                          onClick={() =>
                            handleSubmissionStatus(sub.id, "SUBMITTED")
                          }
                        >
                          Submit to Sports Secretary
                        </button>
                      )}
                    {isAdmin && sub.status !== "LOCKED" && (
                      <>
                        <button
                          type="button"
                          className="action-btn"
                          style={{ padding: "5px 10px", fontSize: 12 }}
                          disabled={busy !== null}
                          onClick={() =>
                            handleSubmissionStatus(
                              sub.id,
                              "APPROVED",
                              "Approved for tournament play."
                            )
                          }
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="action-btn"
                          style={{
                            padding: "5px 10px",
                            fontSize: 12,
                            background: "#444",
                            color: "#f4efe6",
                          }}
                          disabled={busy !== null}
                          onClick={() =>
                            handleSubmissionStatus(
                              sub.id,
                              "CHANGES_REQUESTED",
                              "Please verify eligibility and jersey numbers."
                            )
                          }
                        >
                          Request Changes
                        </button>
                        <button
                          type="button"
                          className="action-btn"
                          style={{
                            padding: "5px 10px",
                            fontSize: 12,
                            background: "#b91c1c",
                            color: "#f4efe6",
                          }}
                          disabled={busy !== null}
                          onClick={() =>
                            handleSubmissionStatus(
                              sub.id,
                              "LOCKED",
                              "Final roster locked before fixtures."
                            )
                          }
                        >
                          Lock Squad
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {/* COMPLETED RESULTS */}
      <section className="panel">
        <h2 className="section-heading">
          Completed Results ({completedMatches.length})
        </h2>
        {completedMatches.length === 0 ? (
          <p className="muted">No completed matches yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {completedMatches.map((m) => (
              <div key={m.id} className="notice-item">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <strong>
                    {m.sportName} ({m.stage}): {m.teamA} {m.scoreA} vs {m.teamB}{" "}
                    {m.scoreB}
                  </strong>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="muted">
                      {formatLocalDateTime(m.scheduledAt || m.scheduledTime)}
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        className="operator-btn-secondary"
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        disabled={busy !== null}
                        onClick={() => handleReopenMatch(m.id)}
                      >
                        {busy === `reopen-${m.id}` ? "Reopening..." : "Reopen"}
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ color: "#d4a038", marginTop: 4 }}>
                  {m.resultSummary}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

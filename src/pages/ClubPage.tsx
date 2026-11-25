import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { DemoUser } from "../App";
import { apiFetch, formatLocalDateTime, toDateTimeLocalValue } from "../lib/api";

interface ClubMember {
  id: number;
  clubId: number;
  userId: number;
  memberRole: string;
  batchScope: string;
  status: string;
  userName: string;
  userBatch: string;
  userBranch: string;
}

interface ClubActivity {
  id: number;
  activityType: string;
  targetBatch: string;
  categoryGender: string;
  scheduledLabel: string;
  scheduledAt?: string | null;
  venue: string;
}

interface ClubDetailResponse {
  club: {
    id: number;
    slug: string;
    name: string;
    groupType: string;
    description: string;
    venue: string;
    inductionOpen: boolean;
  };
  members: ClubMember[];
  activities: ClubActivity[];
  notifications: Array<{
    id: number;
    message: string;
    isRead: boolean;
  }>;
  canManageClub: boolean;
  manageBatchScope: string;
}

export default function ClubPage({
  currentUser,
}: {
  currentUser: DemoUser | null;
}) {
  const { slug } = useParams();
  const [detail, setDetail] = useState<ClubDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [activityType, setActivityType] = useState("Practice");
  const [targetBatch, setTargetBatch] = useState("ALL");
  const [categoryGender, setCategoryGender] = useState("Open");
  const [scheduledAt, setScheduledAt] = useState(() =>
    toDateTimeLocalValue(new Date(Date.now() + 2 * 3600_000).toISOString())
  );
  const [venue, setVenue] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await apiFetch(`/api/clubs/${slug}`, { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setLoadError(err.error || "Unable to load club details.");
        setLoading(false);
        return;
      }
      const d: ClubDetailResponse = await res.json();
      setDetail(d);
      setVenue((v) => v || d.club.venue);
      if (d.manageBatchScope && d.manageBatchScope !== "ALL" && d.manageBatchScope !== "NONE") {
        setTargetBatch(d.manageBatchScope);
      }
    } catch {
      setLoadError("Network error while loading club details.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, currentUser?.id]);

  async function handleSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser || !detail) return;
    setBusyAction("schedule");
    setMessage(null);
    setErrorMsg(null);
    try {
      const iso = scheduledAt ? new Date(scheduledAt).toISOString() : undefined;
      const res = await apiFetch(`/api/clubs/${slug}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityType,
          targetBatch,
          categoryGender,
          scheduledAt: iso,
          venue: venue || detail.club.venue,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(out.error || "Unable to schedule activity.");
        return;
      }
      setMessage(
        `Scheduled ${activityType} (${targetBatch}) and notified ${out.notifiedCount ?? 0} club members.`
      );
      await load();
    } catch {
      setErrorMsg("Network error while scheduling activity.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleInduction() {
    if (!detail) return;
    setBusyAction("toggle-induction");
    setMessage(null);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/clubs/${slug}/induction-toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inductionOpen: !detail.club.inductionOpen }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(out.error || "Unable to toggle induction status.");
        return;
      }
      setMessage(
        `Club inductions are now ${!detail.club.inductionOpen ? "OPEN" : "CLOSED"}.`
      );
      await load();
    } catch {
      setErrorMsg("Network error toggling induction status.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleApplyInduction() {
    if (!currentUser) {
      setErrorMsg("Sign in to apply for club induction.");
      return;
    }
    setBusyAction("apply");
    setMessage(null);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/clubs/${slug}/induction-apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(out.error || "Unable to submit induction application.");
        return;
      }
      setMessage(
        out.message || "Induction application submitted! Check club trials schedule."
      );
      await load();
    } catch {
      setErrorMsg("Network error while submitting application.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStatusUpdate(membershipId: number, status: string) {
    setBusyAction(`mem-${membershipId}-${status}`);
    setMessage(null);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/memberships/${membershipId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(out.error || "Unable to update membership status.");
        return;
      }
      setMessage(`Applicant status updated to ${status}.`);
      await load();
    } catch {
      setErrorMsg("Network error updating applicant status.");
    } finally {
      setBusyAction(null);
    }
  }

  if (loading) {
    return (
      <div className="container">
        <p className="muted">Loading club workspace...</p>
      </div>
    );
  }

  if (loadError || !detail) {
    return (
      <div className="container">
        <div className="panel">
          <p className="error-text">{loadError || "Club not found."}</p>
        </div>
      </div>
    );
  }

  const canManage = detail.canManageClub;
  const scope = detail.manageBatchScope;
  const inductedMembers = detail.members.filter((m) => m.status === "INDUCTED");
  const pipelineApplicants = detail.members.filter(
    (m) => m.status === "APPLIED" || m.status === "TRIAL_ATTENDED"
  );
  const myMembership = currentUser
    ? detail.members.find((m) => m.userId === currentUser.id)
    : null;

  return (
    <div className="container">
      <div className="panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ margin: 0, textTransform: "uppercase", color: "#d4a038" }}>
              {detail.club.name} Club
            </h1>
            <p style={{ margin: "8px 0" }}>{detail.club.description}</p>
            <p className="muted" style={{ margin: 0 }}>
              Primary Venue: {detail.club.venue} · Inductions:{" "}
              <strong
                style={{
                  color: detail.club.inductionOpen ? "#4ade80" : "#f87171",
                }}
              >
                {detail.club.inductionOpen ? "OPEN" : "CLOSED"}
              </strong>
              {canManage && scope !== "NONE" && (
                <span> · Your Management Scope: {scope}</span>
              )}
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canManage && scope === "ALL" && (
              <>
                <button
                  type="button"
                  className="action-btn"
                  disabled={busyAction !== null}
                  onClick={handleToggleInduction}
                >
                  {busyAction === "toggle-induction"
                    ? "Updating..."
                    : detail.club.inductionOpen
                      ? "Close Inductions"
                      : "Open Inductions"}
                </button>
                <Link
                  to="/admin"
                  className="operator-btn-secondary"
                  style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                >
                  Appoint Coordinators
                </Link>
              </>
            )}
            {currentUser && !myMembership && (
              <button
                type="button"
                className="action-btn"
                disabled={!detail.club.inductionOpen || busyAction !== null}
                onClick={handleApplyInduction}
              >
                {busyAction === "apply"
                  ? "Submitting..."
                  : detail.club.inductionOpen
                    ? "Apply for Induction"
                    : "Inductions Closed"}
              </button>
            )}
            {myMembership && (
              <span className="status-tag">
                Your Status: {myMembership.status} ({myMembership.memberRole})
              </span>
            )}
          </div>
        </div>

        {message && (
          <p style={{ color: "#d4a038", marginTop: 12, marginBottom: 0 }}>
            {message}
          </p>
        )}
        {errorMsg && (
          <p className="error-text" style={{ marginTop: 12, marginBottom: 0 }}>
            {errorMsg}
          </p>
        )}
      </div>

      {canManage && (
        <section className="panel">
          <h2 className="section-heading">Schedule Practice / Trial / Induction</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {scope === "ALL"
              ? "You can schedule sessions for any batch in this club."
              : `Your coordinator scope is limited to batch ${scope} in ${detail.club.name}.`}
          </p>
          <form onSubmit={handleSchedule} className="form-grid">
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
            >
              <option value="Practice">Practice</option>
              <option value="Trial">Trial</option>
              <option value="Induction">Induction</option>
              <option value="Friendly Match">Friendly Match</option>
            </select>

            <select
              value={targetBatch}
              onChange={(e) => setTargetBatch(e.target.value)}
            >
              {scope === "ALL" ? (
                <>
                  <option value="ALL">All Batches</option>
                  <option value="1ST">1st Year</option>
                  <option value="2ND">2nd Year</option>
                  <option value="3RD">3rd Year</option>
                  <option value="4TH">4th Year</option>
                  <option value="MTECH">MTech</option>
                </>
              ) : (
                <option value={scope}>{scope} Batch</option>
              )}
            </select>

            <select
              value={categoryGender}
              onChange={(e) => setCategoryGender(e.target.value)}
            >
              <option value="Open">Open</option>
              <option value="Boys">Boys</option>
              <option value="Girls">Girls</option>
              <option value="Mixed">Mixed</option>
            </select>

            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
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
              disabled={busyAction !== null}
            >
              {busyAction === "schedule" ? "Scheduling..." : "Publish & Notify"}
            </button>
          </form>
        </section>
      )}

      <section className="panel">
        <h2 className="section-heading">Scheduled Sessions &amp; Trials</h2>
        {detail.activities.length === 0 ? (
          <p className="muted">No upcoming sessions scheduled yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {detail.activities.map((a) => (
              <div key={a.id} className="notice-item">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong>
                    {a.activityType} · {a.targetBatch} · {a.categoryGender}
                  </strong>
                  <span style={{ color: "#d4a038", fontWeight: 700 }}>
                    {formatLocalDateTime(a.scheduledAt || a.scheduledLabel)}
                  </span>
                </div>
                <div className="muted">Venue: {a.venue}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="section-heading">
          Induction Pipeline ({pipelineApplicants.length})
        </h2>
        {pipelineApplicants.length === 0 ? (
          <p className="muted">No pending induction applications.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Batch / Branch</th>
                <th>Stage</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pipelineApplicants.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link to={`/players/${m.userId}`} className="player-link">
                      {m.userName}
                    </Link>
                  </td>
                  <td>
                    {m.userBatch} · {m.userBranch}
                  </td>
                  <td>
                    <span className="status-tag">{m.status}</span>
                  </td>
                  {canManage && (
                    <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {m.status === "APPLIED" && (
                        <button
                          type="button"
                          className="action-btn"
                          style={{ padding: "5px 10px", fontSize: 12 }}
                          disabled={busyAction !== null}
                          onClick={() =>
                            handleStatusUpdate(m.id, "TRIAL_ATTENDED")
                          }
                        >
                          Mark Trial Attended
                        </button>
                      )}
                      {m.status === "TRIAL_ATTENDED" && (
                        <button
                          type="button"
                          className="action-btn"
                          style={{ padding: "5px 10px", fontSize: 12 }}
                          disabled={busyAction !== null}
                          onClick={() => handleStatusUpdate(m.id, "INDUCTED")}
                        >
                          Induct
                        </button>
                      )}
                      <button
                        type="button"
                        className="action-btn"
                        style={{
                          padding: "5px 10px",
                          fontSize: 12,
                          background: "#b91c1c",
                          color: "#f4efe6",
                        }}
                        disabled={busyAction !== null}
                        onClick={() => handleStatusUpdate(m.id, "REJECTED")}
                      >
                        Reject
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2 className="section-heading">
          Inducted Roster ({inductedMembers.length})
        </h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Role</th>
              <th>Batch</th>
              <th>Branch</th>
            </tr>
          </thead>
          <tbody>
            {inductedMembers.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link to={`/players/${m.userId}`} className="player-link">
                    {m.userName}
                  </Link>
                </td>
                <td>
                  {m.memberRole}
                  {m.memberRole === "COORDINATOR" ? ` (${m.batchScope})` : ""}
                </td>
                <td>{m.userBatch}</td>
                <td>{m.userBranch}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
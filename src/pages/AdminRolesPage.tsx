import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DemoUser, NoticeItem } from "../App";
import { apiFetch } from "../lib/api";

interface AdminUserRow {
  id: number;
  name: string;
  batch: string;
  branch: string;
  role: string;
}

interface AdminClubRow {
  id: number;
  slug: string;
  name: string;
}

interface AdminClubOfficialRow {
  id: number;
  clubId: number;
  userId: number;
  memberRole: string;
  batchScope: string;
  status: string;
}

interface AdminTeamRow {
  id: number;
  tournamentId: number;
  sportName: string;
  teamName: string;
  captainUserId: number | null;
}

interface AdminMatchRow {
  id: number;
  sportName: string;
  stage: string;
  teamA: string;
  teamB: string;
  status: string;
  scorerUserId: number | null;
}

interface AdminOperatorRow {
  id: number;
  auctionId: number;
  userId: number;
}

interface AdminOverview {
  isPlatformAdmin: boolean;
  secretaryClubIds: number[];
  users: AdminUserRow[];
  clubs: AdminClubRow[];
  clubOfficials: AdminClubOfficialRow[];
  teams: AdminTeamRow[];
  matches: AdminMatchRow[];
  auctionOperators: AdminOperatorRow[];
  activeAuctionId: number;
  siteSettings: {
    showAuctionInNav: boolean;
    showLiveAuctionInNav: boolean;
  };
  notices: NoticeItem[];
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function AdminRolesPage({
  currentUser,
  onBootstrapChange,
}: {
  currentUser: DemoUser | null;
  onBootstrapChange: () => Promise<void>;
}) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Forms
  const [secClubId, setSecClubId] = useState<string>("");
  const [secUserId, setSecUserId] = useState<string>("");

  const [coordClubId, setCoordClubId] = useState<string>("");
  const [coordUserId, setCoordUserId] = useState<string>("");
  const [coordBatchScope, setCoordBatchScope] = useState<string>("2ND");

  const [capTeamId, setCapTeamId] = useState<string>("");
  const [capUserId, setCapUserId] = useState<string>("");

  const [scorerMatchId, setScorerMatchId] = useState<string>("");
  const [scorerUserId, setScorerUserId] = useState<string>("");

  const [opUserId, setOpUserId] = useState<string>("");

  // Notices & Urgent Banner form
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeSummary, setNoticeSummary] = useState("");
  const [noticeCategory, setNoticeCategory] = useState("GENERAL");
  const [noticeUrgent, setNoticeUrgent] = useState(false);

  const load = useCallback(async () => {
    setErrorMsg(null);
    try {
      const res = await apiFetch("/api/admin/roles", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || "Unable to load role management panel.");
        setOverview(null);
        return;
      }
      setOverview(data);
      if (data.clubs?.length > 0) {
        const manageableClub = data.isPlatformAdmin
          ? data.clubs[0]
          : data.clubs.find((c: AdminClubRow) =>
              data.secretaryClubIds.includes(c.id)
            ) || data.clubs[0];
        setSecClubId((v) => v || String(data.clubs[0].id));
        setCoordClubId((v) => v || String(manageableClub.id));
      }
      if (data.users?.length > 0) {
        const firstUid = String(data.users[0].id);
        setSecUserId((v) => v || firstUid);
        setCoordUserId((v) => v || firstUid);
        setCapUserId((v) => v || firstUid);
        setScorerUserId((v) => v || firstUid);
        setOpUserId((v) => v || firstUid);
      }
      if (data.teams?.length > 0) {
        setCapTeamId((v) => v || String(data.teams[0].id));
      }
      if (data.matches?.length > 0) {
        setScorerMatchId((v) => v || String(data.matches[0].id));
      }
    } catch {
      setErrorMsg("Network error loading governance workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      setOverview(null);
      return;
    }
    setLoading(true);
    void load();
  }, [currentUser?.id, load]);

  async function runAction(
    key: string,
    url: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: Record<string, unknown>,
    successMsg = "Updated."
  ) {
    setBusy(key);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const res = await apiFetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(out.error || "Action failed.");
        return false;
      }
      setFeedback(successMsg);
      await load();
      await onBootstrapChange();
      return true;
    } catch {
      setErrorMsg("Network error while saving changes.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (!currentUser) {
    return (
      <div className="container">
        <div className="panel">
          <h1 className="section-heading">Roles &amp; Governance</h1>
          <p className="muted">
            Sign in as Sports Secretary, Faculty Advisor, or Club Secretary to
            manage role appointments, notices, and navigation settings.
          </p>
          <Link to="/login" className="action-btn" style={{ textDecoration: "none" }}>
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container">
        <p className="muted">Loading governance workspace...</p>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="container">
        <div className="panel">
          <h1 className="section-heading">Roles &amp; Governance</h1>
          <p className="error-text">{errorMsg || "Access restricted."}</p>
        </div>
      </div>
    );
  }

  const userById = new Map(overview.users.map((u) => [u.id, u]));
  const clubById = new Map(overview.clubs.map((c) => [c.id, c]));
  const coordinatorClubs = overview.isPlatformAdmin
    ? overview.clubs
    : overview.clubs.filter((c) => overview.secretaryClubIds.includes(c.id));

  const titleWordCount = countWords(noticeTitle);
  const urgentWordLimitExceeded = noticeUrgent && titleWordCount > 5;

  return (
    <div className="container">
      <div className="panel">
        <h1 className="section-heading" style={{ marginBottom: 6 }}>
          Sports Council Roles &amp; Governance
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {overview.isPlatformAdmin
            ? "Platform Admin view — appoint Club Secretaries, Coordinators, Captains, Match Scorers, event-scoped Auction Operators, manage notices, and toggle navigation links."
            : "Club Secretary view — appoint batch-scoped Coordinators for your clubs."}
        </p>
        {feedback && (
          <div className="auction-feedback-banner" style={{ marginTop: 12 }}>
            {feedback}
          </div>
        )}
        {errorMsg && (
          <div
            className="auction-feedback-banner auction-feedback-banner--error"
            style={{ marginTop: 12 }}
          >
            {errorMsg}
          </div>
        )}
      </div>

      {/* PERSISTED NAV VISIBILITY TOGGLES (PLATFORM ADMIN) */}
      {overview.isPlatformAdmin && (
        <section className="panel">
          <h2 className="section-heading">Navigation Visibility Settings</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Persisted in database and broadcast immediately to all connected
            viewers.
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <label className="toggle-chip">
              <input
                type="checkbox"
                checked={overview.siteSettings.showAuctionInNav}
                disabled={busy !== null}
                onChange={(e) =>
                  void runAction(
                    "nav-auction",
                    "/api/settings/nav",
                    "PATCH",
                    { showAuctionInNav: e.target.checked },
                    `Auction nav link ${e.target.checked ? "shown" : "hidden"}.`
                  )
                }
              />
              <span>Show Auction in Nav</span>
            </label>

            <label className="toggle-chip">
              <input
                type="checkbox"
                checked={overview.siteSettings.showLiveAuctionInNav}
                disabled={busy !== null}
                onChange={(e) =>
                  void runAction(
                    "nav-live-auction",
                    "/api/settings/nav",
                    "PATCH",
                    { showLiveAuctionInNav: e.target.checked },
                    `Live Auction nav link ${e.target.checked ? "shown" : "hidden"}.`
                  )
                }
              />
              <span>Show Live Auction in Nav</span>
            </label>
          </div>
        </section>
      )}

      {/* NOTICES & URGENT TOP BANNER (PLATFORM ADMIN) */}
      {overview.isPlatformAdmin && (
        <section className="panel">
          <h2 className="section-heading">Notices &amp; Urgent Top Banner</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Urgent banners display across the top of every page and are strictly
            capped at <strong>5 words</strong>.
          </p>
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              if (urgentWordLimitExceeded) return;
              const ok = await runAction(
                "create-notice",
                "/api/notices",
                "POST",
                {
                  title: noticeTitle.trim(),
                  summary: noticeSummary.trim(),
                  category: noticeCategory,
                  isUrgentBanner: noticeUrgent,
                },
                "Notice published."
              );
              if (ok) {
                setNoticeTitle("");
                setNoticeSummary("");
                setNoticeUrgent(false);
              }
            }}
          >
            <input
              placeholder={
                noticeUrgent
                  ? "Urgent Banner Title (max 5 words)"
                  : "Notice Title"
              }
              value={noticeTitle}
              onChange={(e) => setNoticeTitle(e.target.value)}
              required
            />
            <input
              placeholder="Summary / Details"
              value={noticeSummary}
              onChange={(e) => setNoticeSummary(e.target.value)}
            />
            <select
              value={noticeCategory}
              onChange={(e) => setNoticeCategory(e.target.value)}
            >
              <option value="GENERAL">GENERAL</option>
              <option value="TRIAL">TRIAL</option>
              <option value="TOURNAMENT">TOURNAMENT</option>
              <option value="AUCTION">AUCTION</option>
            </select>
            <label className="toggle-chip">
              <input
                type="checkbox"
                checked={noticeUrgent}
                onChange={(e) => setNoticeUrgent(e.target.checked)}
              />
              <span>
                Urgent Top Banner{" "}
                {noticeUrgent && (
                  <strong
                    style={{
                      color: urgentWordLimitExceeded ? "#f87171" : "#4ade80",
                    }}
                  >
                    ({titleWordCount}/5 words)
                  </strong>
                )}
              </span>
            </label>
            <button
              type="submit"
              className="action-btn"
              disabled={busy !== null || urgentWordLimitExceeded}
            >
              {busy === "create-notice" ? "Publishing..." : "Publish Notice"}
            </button>
          </form>

          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            {overview.notices.map((n) => (
              <div
                key={n.id}
                className="notice-item"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <strong>{n.title}</strong>{" "}
                  {n.isUrgentBanner && (
                    <span className="status-tag">URGENT BANNER</span>
                  )}
                  <div className="muted" style={{ fontSize: 13 }}>
                    {n.summary} ({n.category})
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {n.isUrgentBanner && (
                    <button
                      type="button"
                      className="operator-btn-secondary"
                      disabled={busy !== null}
                      onClick={() =>
                        void runAction(
                          `unpin-${n.id}`,
                          `/api/notices/${n.id}`,
                          "PATCH",
                          { isUrgentBanner: false },
                          "Cleared urgent top banner."
                        )
                      }
                    >
                      Clear Banner
                    </button>
                  )}
                  <button
                    type="button"
                    className="operator-btn-secondary"
                    style={{ borderColor: "#b91c1c", color: "#f87171" }}
                    disabled={busy !== null}
                    onClick={() =>
                      void runAction(
                        `del-notice-${n.id}`,
                        `/api/notices/${n.id}`,
                        "DELETE",
                        undefined,
                        "Notice deleted."
                      )
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* APPOINT BATCH-SCOPED CLUB COORDINATOR (CLUB SECRETARY OR ADMIN) */}
      {coordinatorClubs.length > 0 && (
        <section className="panel">
          <h2 className="section-heading">
            Appoint Batch-Scoped Club Coordinator
          </h2>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              void runAction(
                "appoint-coord",
                "/api/roles/club-coordinator",
                "POST",
                {
                  clubId: Number(coordClubId),
                  userId: Number(coordUserId),
                  batchScope: coordBatchScope,
                },
                "Club Coordinator appointed."
              );
            }}
          >
            <select
              value={coordClubId}
              onChange={(e) => setCoordClubId(e.target.value)}
            >
              {coordinatorClubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={coordUserId}
              onChange={(e) => setCoordUserId(e.target.value)}
            >
              {overview.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.batch} {u.branch})
                </option>
              ))}
            </select>
            <select
              value={coordBatchScope}
              onChange={(e) => setCoordBatchScope(e.target.value)}
            >
              <option value="1ST">1ST Year Scope</option>
              <option value="2ND">2ND Year Scope</option>
              <option value="3RD">3RD Year Scope</option>
              <option value="4TH">4TH Year Scope</option>
              <option value="MTECH">MTECH Scope</option>
              <option value="ALL">ALL Batches</option>
            </select>
            <button
              type="submit"
              className="action-btn"
              disabled={busy !== null}
            >
              Appoint Coordinator
            </button>
          </form>
        </section>
      )}

      {/* PLATFORM ADMIN ROLE APPOINTMENTS */}
      {overview.isPlatformAdmin && (
        <>
          <section className="panel">
            <h2 className="section-heading">Appoint Club Secretary</h2>
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                void runAction(
                  "appoint-sec",
                  "/api/roles/club-secretary",
                  "POST",
                  {
                    clubId: Number(secClubId),
                    userId: Number(secUserId),
                  },
                  "Club Secretary appointed."
                );
              }}
            >
              <select
                value={secClubId}
                onChange={(e) => setSecClubId(e.target.value)}
              >
                {overview.clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={secUserId}
                onChange={(e) => setSecUserId(e.target.value)}
              >
                {overview.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.batch} {u.branch})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="action-btn"
                disabled={busy !== null}
              >
                Appoint Secretary
              </button>
            </form>

            <table className="data-table" style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th>Club</th>
                  <th>Official</th>
                  <th>Role</th>
                  <th>Batch Scope</th>
                </tr>
              </thead>
              <tbody>
                {overview.clubOfficials.map((o) => (
                  <tr key={o.id}>
                    <td>{clubById.get(o.clubId)?.name || `Club #${o.clubId}`}</td>
                    <td>{userById.get(o.userId)?.name || `User #${o.userId}`}</td>
                    <td>{o.memberRole}</td>
                    <td>{o.batchScope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <h2 className="section-heading">Appoint Team Captain</h2>
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                void runAction(
                  "appoint-captain",
                  "/api/roles/captain",
                  "POST",
                  {
                    teamId: Number(capTeamId),
                    userId: Number(capUserId),
                  },
                  "Team Captain updated."
                );
              }}
            >
              <select
                value={capTeamId}
                onChange={(e) => setCapTeamId(e.target.value)}
              >
                {overview.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.sportName} · {t.teamName}
                  </option>
                ))}
              </select>
              <select
                value={capUserId}
                onChange={(e) => setCapUserId(e.target.value)}
              >
                {overview.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.batch} {u.branch})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="action-btn"
                disabled={busy !== null}
              >
                Assign Captain
              </button>
            </form>
          </section>

          <section className="panel">
            <h2 className="section-heading">Assign Match Scorer</h2>
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                void runAction(
                  "assign-scorer",
                  "/api/roles/match-scorer",
                  "POST",
                  {
                    matchId: Number(scorerMatchId),
                    userId: Number(scorerUserId),
                  },
                  "Match Scorer assigned."
                );
              }}
            >
              <select
                value={scorerMatchId}
                onChange={(e) => setScorerMatchId(e.target.value)}
              >
                {overview.matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    [{m.status}] {m.sportName}: {m.teamA} vs {m.teamB}
                  </option>
                ))}
              </select>
              <select
                value={scorerUserId}
                onChange={(e) => setScorerUserId(e.target.value)}
              >
                {overview.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="action-btn"
                disabled={busy !== null}
              >
                Assign Scorer
              </button>
            </form>
          </section>

          <section className="panel">
            <h2 className="section-heading">
              Event-Scoped Auction Operators (Auction #{overview.activeAuctionId})
            </h2>
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                void runAction(
                  "assign-op",
                  "/api/roles/auction-operator",
                  "POST",
                  {
                    auctionId: overview.activeAuctionId,
                    userId: Number(opUserId),
                    action: "APPOINT",
                  },
                  "Auction Operator assigned for this event."
                );
              }}
            >
              <select
                value={opUserId}
                onChange={(e) => setOpUserId(e.target.value)}
              >
                {overview.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="action-btn"
                disabled={busy !== null}
              >
                Grant Event Access
              </button>
            </form>

            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {overview.auctionOperators.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  No event-scoped auction operators assigned yet.
                </p>
              ) : (
                overview.auctionOperators.map((op) => (
                  <div
                    key={op.id}
                    className="notice-item"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>
                      <strong>
                        {userById.get(op.userId)?.name || `User #${op.userId}`}
                      </strong>{" "}
                      <span className="muted">
                        (Auction #{op.auctionId})
                      </span>
                    </span>
                    <button
                      type="button"
                      className="operator-btn-secondary"
                      style={{ borderColor: "#b91c1c", color: "#f87171" }}
                      disabled={busy !== null}
                      onClick={() =>
                        void runAction(
                          `revoke-op-${op.id}`,
                          "/api/roles/auction-operator",
                          "POST",
                          {
                            auctionId: op.auctionId,
                            userId: op.userId,
                            action: "REVOKE",
                          },
                          "Auction Operator access revoked."
                        )
                      }
                    >
                      Revoke
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

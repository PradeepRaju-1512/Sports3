import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

interface PlayerProfileResponse {
  profile: {
    id: number;
    name: string;
    batch: string;
    branch: string;
    role: string;
  };
  clubs: Array<{
    clubId: number;
    clubSlug: string;
    clubName: string;
    memberRole: string;
    status: string;
  }>;
  teamHistory: Array<{
    teamId: number;
    teamName: string;
    sportName: string;
    tournamentName: string;
    tournamentYear: number;
    placement: string | null;
    playerRole: string;
  }>;
  auctionEntries: Array<{
    id: number;
    sport: string;
    positions: string[];
    playerClass: string;
    tier: string;
    status: string;
    basePrice: number;
    soldPrice: number | null;
    soldToFranchiseName: string | null;
    statsSummary: string;
    photoUrl: string | null;
  }>;
}

export default function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PlayerProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/players/${encodeURIComponent(id || "")}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (!cancelled) {
            setError(err.error || "Unable to load player profile.");
          }
          return;
        }
        const json: PlayerProfileResponse = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Network error while loading player profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="container">
        <p className="muted">Loading player profile...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container">
        <div className="panel">
          <h2 className="section-heading">Player Profile</h2>
          <p className="error-text">{error || "Player not found."}</p>
          <Link to="/" className="action-btn" style={{ display: "inline-block", textDecoration: "none", marginTop: 10 }}>
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const primaryPhoto =
    data.auctionEntries.find((a) => a.photoUrl)?.photoUrl || null;
  const initials = data.profile.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="container">
      <div className="panel player-profile-hero">
        <div className="player-profile-avatar">
          {primaryPhoto ? (
            <img src={primaryPhoto} alt={data.profile.name} />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {data.profile.name}
          </h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {data.profile.batch} · {data.profile.branch} · {data.profile.role.replace(/_/g, " ")}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {data.clubs.map((c) => (
              <Link
                key={c.clubId}
                to={`/clubs/${c.clubSlug}`}
                className="status-tag"
                style={{ textDecoration: "none" }}
              >
                {c.clubName} ({c.memberRole})
              </Link>
            ))}
          </div>
        </div>
      </div>

      <section className="panel">
        <h2 className="section-heading">Tournament Teams &amp; Honours</h2>
        {data.teamHistory.length === 0 ? (
          <p className="muted">No tournament rosters recorded yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Tournament</th>
                <th>Sport</th>
                <th>Team</th>
                <th>Role</th>
                <th>Finish</th>
              </tr>
            </thead>
            <tbody>
              {data.teamHistory.map((item, idx) => (
                <tr key={`${item.teamId}-${idx}`}>
                  <td className="tabular-nums">{item.tournamentYear}</td>
                  <td>{item.tournamentName}</td>
                  <td>{item.sportName}</td>
                  <td>
                    <strong>{item.teamName}</strong>
                  </td>
                  <td>{item.playerRole}</td>
                  <td>
                    {item.placement && item.placement !== "NONE"
                      ? item.placement.replace(/_/g, " ")
                      : "Participant"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2 className="section-heading">Prothymos Auction Profile</h2>
        {data.auctionEntries.length === 0 ? (
          <p className="muted">No auction entries recorded for this player.</p>
        ) : (
          <div className="grid-3">
            {data.auctionEntries.map((entry) => (
              <div key={entry.id} className="panel" style={{ marginBottom: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ color: "#d4a038" }}>{entry.sport}</strong>
                  <span className="status-tag">{entry.status}</span>
                </div>
                <p className="muted" style={{ margin: "6px 0" }}>
                  {entry.positions.join(", ")} · {entry.playerClass} · {entry.tier}
                </p>
                {entry.soldToFranchiseName ? (
                  <p style={{ margin: "6px 0" }}>
                    <strong>{entry.soldToFranchiseName}</strong> ·{" "}
                    <span className="tabular-nums">
                      ₹{(entry.soldPrice || entry.basePrice).toLocaleString()}
                    </span>
                  </p>
                ) : (
                  <p className="muted" style={{ margin: "6px 0" }}>
                    Base Price: ₹{entry.basePrice.toLocaleString()}
                  </p>
                )}
                {entry.statsSummary && (
                  <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
                    {entry.statsSummary}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

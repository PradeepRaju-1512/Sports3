import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DemoUser } from "../App";
import { apiFetch } from "../lib/api";

interface TournamentItem {
  id: number;
  name: string;
  year: number;
  semester: string;
  tournamentType: string;
  competitionFormat: string;
  dateRange: string;
  structureNotes: string;
  sportsIncluded: string;
  status: string;
}

export default function OverviewPage({
  currentUser,
}: {
  currentUser: DemoUser | null;
}) {
  const [current, setCurrent] = useState<TournamentItem[]>([]);
  const [upcoming, setUpcoming] = useState<TournamentItem[]>([]);
  const [archived, setArchived] = useState<TournamentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [year, setYear] = useState(2027);
  const [semester, setSemester] = useState("EVEN");
  const [tournamentType, setTournamentType] = useState("PROTHYMOS");
  const [competitionFormat, setCompetitionFormat] = useState("LEAGUE_KNOCKOUT");
  const [dateRange, setDateRange] = useState("Mar 01 – Mar 10, 2027");
  const [sportsIncluded, setSportsIncluded] = useState(
    "Cricket,Football,Volleyball,Badminton"
  );
  const [structureNotes, setStructureNotes] = useState(
    "Evening fixtures 5:00 PM – 8:30 PM."
  );

  const load = useCallback(async () => {
    setErrorMsg(null);
    try {
      const res = await fetch("/api/tournaments/overview", { cache: "no-store" });
      if (!res.ok) {
        setErrorMsg("Unable to load tournaments overview.");
        return;
      }
      const d = await res.json();
      setCurrent(d.current || []);
      setUpcoming(d.upcoming || []);
      setArchived(d.archived || []);
    } catch {
      setErrorMsg("Network error loading tournaments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canCreate = Boolean(
    currentUser &&
      ["SPORTS_SECRETARY", "FACULTY_ADVISOR"].includes(currentUser.role)
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser || !name.trim()) return;
    setSaving(true);
    setMessage(null);
    setErrorMsg(null);
    try {
      const res = await apiFetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          year,
          semester,
          tournamentType,
          competitionFormat,
          dateRange,
          structureNotes,
          sportsIncluded,
          status: "UPCOMING",
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(out.error || "Unable to create tournament.");
        return;
      }
      setName("");
      setMessage(`Created tournament "${out.tournament?.name || name}".`);
      await load();
    } catch {
      setErrorMsg("Network error creating tournament.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(tournamentId: number, title: string) {
    setArchivingId(tournamentId);
    setMessage(null);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/tournaments/${tournamentId}/archive`, {
        method: "POST",
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(out.error || "Unable to archive tournament.");
        return;
      }
      setMessage(`Archived "${title}".`);
      await load();
    } catch {
      setErrorMsg("Network error archiving tournament.");
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <div className="container">
      <h1 className="section-heading">Tournaments Overview</h1>
      {loading && <p className="muted">Loading tournaments...</p>}
      {message && <p style={{ color: "#d4a038" }}>{message}</p>}
      {errorMsg && <p className="error-text">{errorMsg}</p>}

      <section className="panel">
        <h2 className="section-heading">Active / Current</h2>
        {current.length === 0 ? (
          <p className="muted">No active tournament right now.</p>
        ) : (
          current.map((t) => (
            <div key={t.id} className="notice-item" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <strong>
                  {t.name} ({t.year} · {t.semester} SEM)
                </strong>
                <div style={{ display: "flex", gap: 8 }}>
                  <Link to="/current-tournament" className="action-btn" style={{ textDecoration: "none", padding: "6px 10px", fontSize: 12 }}>
                    Open Live Hub
                  </Link>
                  {canCreate && (
                    <button
                      type="button"
                      className="action-btn"
                      style={{ padding: "6px 10px", fontSize: 12, background: "#b91c1c", color: "#f4efe6" }}
                      disabled={archivingId === t.id}
                      onClick={() => handleArchive(t.id, t.name)}
                    >
                      {archivingId === t.id ? "Archiving..." : "Archive"}
                    </button>
                  )}
                </div>
              </div>
              <p className="muted" style={{ margin: "6px 0" }}>
                {t.dateRange} · {t.tournamentType} · {t.competitionFormat}
              </p>
              <p style={{ margin: "4px 0" }}>{t.structureNotes}</p>
              <p className="muted" style={{ margin: 0 }}>
                Sports: {t.sportsIncluded}
              </p>
            </div>
          ))
        )}
      </section>

      <section className="panel">
        <h2 className="section-heading">Upcoming Tournaments</h2>
        {upcoming.length === 0 ? (
          <p className="muted">No upcoming tournaments scheduled.</p>
        ) : (
          upcoming.map((t) => (
            <div key={t.id} className="notice-item" style={{ marginBottom: 12 }}>
              <strong>
                {t.name} ({t.year} · {t.semester} SEM)
              </strong>
              <p className="muted" style={{ margin: "6px 0" }}>
                {t.dateRange} · {t.tournamentType} · {t.competitionFormat}
              </p>
              <p style={{ margin: "4px 0" }}>{t.structureNotes}</p>
              <p className="muted" style={{ margin: 0 }}>
                Sports: {t.sportsIncluded}
              </p>
            </div>
          ))
        )}
      </section>

      {canCreate && (
        <section className="panel">
          <h2 className="section-heading">Schedule New Tournament</h2>
          <form onSubmit={handleCreate} className="form-grid">
            <input
              placeholder="Tournament Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              required
            />
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            >
              <option value="ODD">Odd Semester</option>
              <option value="EVEN">Even Semester</option>
            </select>
            <select
              value={tournamentType}
              onChange={(e) => setTournamentType(e.target.value)}
            >
              <option value="PROTHYMOS">Prothymos</option>
              <option value="INTER_BATCH">Inter-Batch</option>
            </select>
            <select
              value={competitionFormat}
              onChange={(e) => setCompetitionFormat(e.target.value)}
            >
              <option value="LEAGUE_KNOCKOUT">League + Knockout</option>
              <option value="KNOCKOUT">Knockout</option>
              <option value="ROUND_ROBIN">Round Robin</option>
            </select>
            <input
              placeholder="Date Range"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              required
            />
            <input
              placeholder="Sports (comma separated)"
              value={sportsIncluded}
              onChange={(e) => setSportsIncluded(e.target.value)}
              required
            />
            <input
              placeholder="Schedule & Structure Notes"
              value={structureNotes}
              onChange={(e) => setStructureNotes(e.target.value)}
            />
            <button type="submit" className="action-btn" disabled={saving}>
              {saving ? "Creating..." : "Create Tournament"}
            </button>
          </form>
        </section>
      )}

      {archived.length > 0 && (
        <section className="panel">
          <h2 className="section-heading">Archived Editions</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {archived.map((t) => (
              <Link
                key={t.id}
                to={`/archive/${t.year}`}
                className="status-tag"
                style={{ textDecoration: "none" }}
              >
                {t.name} ({t.year})
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

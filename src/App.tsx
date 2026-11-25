import React, { useCallback, useEffect, useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import HomePage from "./pages/HomePage";
import ClubPage from "./pages/ClubPage";
import OverviewPage from "./pages/OverviewPage";
import ArchivePage from "./pages/ArchivePage";
import CurrentTournamentPage from "./pages/CurrentTournamentPage";
import LiveOrUpcomingPage from "./pages/LiveOrUpcomingPage";
import AuctionPage from "./pages/AuctionPage";
import LiveAuctionPage from "./pages/LiveAuctionPage";
import LiveScorerPage from "./pages/LiveScorerPage";
import PlayerProfilePage from "./pages/PlayerProfilePage";
import LoginPage from "./pages/LoginPage";
import AdminRolesPage from "./pages/AdminRolesPage";
import NotFoundPage from "./pages/NotFoundPage";
import { apiFetch, formatLocalDateTime, setAuthToken } from "./lib/api";
import {
  useLiveMatchesStream,
  type LiveNavSnapshot,
} from "./hooks/useLiveMatchesStream";

export interface DemoUser {
  id: number;
  name: string;
  email?: string;
  rollNumber?: string | null;
  batch: string;
  branch: string;
  role: string;
}

export interface NoticeItem {
  id: number;
  title: string;
  summary: string;
  category: string;
  isUrgentBanner: boolean;
}

export interface ClubItem {
  id: number;
  slug: string;
  name: string;
  groupType: string;
  description: string;
  venue: string;
  inductionOpen: boolean;
}

export interface NotificationItem {
  id: number;
  userId: number;
  clubId: number | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface BootstrapData {
  demoSwitcherEnabled: boolean;
  googleOAuthEnabled?: boolean;
  alertBanner: string | null;
  notices: NoticeItem[];
  clubs: ClubItem[];
  users: DemoUser[];
  currentUser: DemoUser | null;
  hasLiveMatches: boolean;
  archiveYears: number[];
  showAuctionInNav?: boolean;
  showLiveAuctionInNav?: boolean;
  auctionPlanned?: boolean;
  liveAuctionActive?: boolean;
  auctionStatus?: string;
}

export default function App() {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [switchingRole, setSwitchingRole] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadNotifications = useCallback(async () => {
    try {
      const res = await apiFetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }
      const d = await res.json();
      setNotifications(d.notifications || []);
      setUnreadCount(d.unreadCount || 0);
    } catch {
      // keep existing notifications on transient error
    }
  }, []);

  const refreshBootstrap = useCallback(async () => {
    try {
      const r = await apiFetch("/api/bootstrap", { cache: "no-store" });
      if (!r.ok) return;
      const d: BootstrapData = await r.json();
      setData(d);
      setCurrentUser(d.currentUser || null);
    } catch (err) {
      console.error(err);
    } finally {
      setBootstrapping(false);
    }
  }, []);

  const handleNavUpdate = useCallback((nav: LiveNavSnapshot) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            hasLiveMatches: nav.hasLiveMatches,
            auctionPlanned: nav.showAuctionInNav,
            liveAuctionActive: nav.showLiveAuctionInNav,
            auctionStatus: nav.auctionStatus,
            alertBanner: nav.alertBanner,
          }
        : prev
    );
  }, []);

  // Subscribe to real-time live match & nav state SSE updates
  useLiveMatchesStream({ onNavUpdate: handleNavUpdate });

  const signInDemoUser = useCallback(
    async (userId: number) => {
      setSwitchingRole(true);
      setAuthError(null);
      try {
        const res = await apiFetch("/api/auth/demo-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setAuthError(err.error || "Unable to switch demo persona");
          return;
        }
        const payload = await res.json();
        setAuthToken(payload.token);
        setCurrentUser(payload.user);
        await loadNotifications();
      } catch {
        setAuthError("Network error switching persona");
      } finally {
        setSwitchingRole(false);
      }
    },
    [loadNotifications]
  );

  const signOut = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore network error; clear local session state regardless
    }
    setAuthToken(null);
    setCurrentUser(null);
    setNotifications([]);
    setUnreadCount(0);
    setNotifOpen(false);
  }, []);

  const handleSignedIn = useCallback(
    async (user: DemoUser) => {
      setCurrentUser(user);
      await loadNotifications();
      await refreshBootstrap();
    },
    [loadNotifications, refreshBootstrap]
  );

  useEffect(() => {
    void refreshBootstrap();
  }, [refreshBootstrap]);

  // Refresh notifications periodically when signed in
  useEffect(() => {
    if (!currentUser) return;
    void loadNotifications();
    const id = window.setInterval(() => {
      void loadNotifications();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [currentUser, loadNotifications]);

  async function markNotificationRead(id: number) {
    try {
      const res = await apiFetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch {
      // ignore
    }
  }

  async function markAllRead() {
    try {
      const res = await apiFetch("/api/notifications/read-all", {
        method: "POST",
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch {
      // ignore
    }
  }

  if (bootstrapping) {
    return (
      <div className="bootstrap-loader">
        <div className="bootstrap-loader-card">
          <div className="bootstrap-spinner" />
          <div style={{ fontWeight: 800, letterSpacing: "0.08em", color: "#d4a038" }}>
            IIIT TRICHY SPORTS
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            Loading clubs, schedules, and live feeds...
          </div>
        </div>
      </div>
    );
  }

  const hasLive = Boolean(data?.hasLiveMatches);
  const archiveYears = data?.archiveYears || [2025, 2024];
  const auctionPlanned = Boolean(data?.auctionPlanned);
  const liveAuctionActive = Boolean(data?.liveAuctionActive);

  // Hide Match Scorer link from main nav for public guests & regular students
  // (spectators can still click any live/upcoming match card to open read-only /scorer?matchId=...)
  const showScorerInNav = Boolean(
    currentUser &&
      ["MATCH_SCORER", "SPORTS_SECRETARY", "FACULTY_ADVISOR"].includes(
        currentUser.role
      )
  );
  const showAdminInNav = Boolean(
    currentUser &&
      ["SPORTS_SECRETARY", "FACULTY_ADVISOR", "CLUB_SECRETARY"].includes(
        currentUser.role
      )
  );

  const closeMenus = () => {
    setMobileMenuOpen(false);
    setArchiveOpen(false);
  };

  return (
    <div>
      {data?.alertBanner && (
        <div className="alert-banner">{data.alertBanner}</div>
      )}

      <header className="topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="mobile-menu-toggle"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((o) => !o)}
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </button>

          <nav className={`nav-links ${mobileMenuOpen ? "open" : ""}`}>
            <Link to="/" onClick={closeMenus}>
              Home
            </Link>
            <Link to="/overview" onClick={closeMenus}>
              Overview
            </Link>

            <div className="dropdown-wrap">
              <button
                type="button"
                className="nav-pill"
                onClick={() => setArchiveOpen((o) => !o)}
              >
                Archive ▾
              </button>
              {archiveOpen && (
                <div className="dropdown-menu" onClick={closeMenus}>
                  {archiveYears.map((yr) => (
                    <Link key={yr} to={`/archive/${yr}`}>
                      {yr}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link to="/current-tournament" onClick={closeMenus}>
              Current Tournament
            </Link>

            {auctionPlanned && (
              <Link to="/auction" onClick={closeMenus}>
                Auction
              </Link>
            )}
            {liveAuctionActive && (
              <Link to="/live-auction" onClick={closeMenus}>
                Live Auction
              </Link>
            )}

            {showScorerInNav && (
              <Link to="/scorer" onClick={closeMenus}>
                Match Scorer
              </Link>
            )}

            <Link to={hasLive ? "/live" : "/upcoming"} onClick={closeMenus}>
              {hasLive ? "Live" : "Upcoming"}
            </Link>

            {showAdminInNav && (
              <Link to="/admin" onClick={closeMenus}>
                Roles &amp; Admin
              </Link>
            )}
          </nav>
        </div>

        <div className="topbar-right">
          {currentUser && (
            <div className="dropdown-wrap">
              <button
                type="button"
                className="notif-bell-btn"
                aria-label="Notifications"
                onClick={() => {
                  setNotifOpen((o) => !o);
                  if (!notifOpen) void loadNotifications();
                }}
              >
                🔔
                {unreadCount > 0 && (
                  <span className="notif-badge tabular-nums">{unreadCount}</span>
                )}
              </button>

              {notifOpen && (
                <div className="notif-dropdown">
                  <div className="notif-dropdown-header">
                    <strong>Notifications</strong>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        className="notif-mark-all"
                        onClick={markAllRead}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <p
                      className="muted"
                      style={{ padding: "10px 12px", margin: 0 }}
                    >
                      No notifications yet.
                    </p>
                  ) : (
                    <div className="notif-list">
                      {notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`notif-item ${n.isRead ? "read" : "unread"}`}
                        >
                          <div style={{ fontSize: 13 }}>{n.message}</div>
                          <div className="notif-item-footer">
                            <span className="muted" style={{ fontSize: 11 }}>
                              {formatLocalDateTime(n.createdAt)}
                            </span>
                            {!n.isRead && (
                              <button
                                type="button"
                                className="notif-read-btn"
                                onClick={() => markNotificationRead(n.id)}
                              >
                                Mark read
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {data?.demoSwitcherEnabled && (
            <div className="role-switcher-wrap">
              <span className="muted role-label">Demo:</span>
              <select
                disabled={switchingRole}
                value={currentUser ? String(currentUser.id) : "GUEST"}
                onChange={(e) => {
                  if (e.target.value === "GUEST") {
                    void signOut();
                    return;
                  }
                  void signInDemoUser(Number(e.target.value));
                }}
              >
                <option value="GUEST">Public Guest</option>
                {data.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          {currentUser ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                className="muted"
                style={{ fontSize: 12, whiteSpace: "nowrap" }}
              >
                {currentUser.name}
              </span>
              <button
                type="button"
                className="nav-pill"
                onClick={() => void signOut()}
              >
                Sign Out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="nav-pill"
              style={{ textDecoration: "none", color: "#d4a038" }}
              onClick={closeMenus}
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {authError && (
        <div className="container" style={{ paddingBottom: 0 }}>
          <div className="error-banner">{authError}</div>
        </div>
      )}

      <Routes>
        <Route
          path="/"
          element={<HomePage data={data} currentUser={currentUser} />}
        />
        <Route
          path="/login"
          element={
            <LoginPage
              currentUser={currentUser}
              googleOAuthEnabled={Boolean(data?.googleOAuthEnabled)}
              onSignedIn={handleSignedIn}
              onSignOut={signOut}
            />
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRolesPage
              currentUser={currentUser}
              onBootstrapChange={refreshBootstrap}
            />
          }
        />
        <Route
          path="/clubs/:slug"
          element={<ClubPage currentUser={currentUser} />}
        />
        <Route
          path="/overview"
          element={<OverviewPage currentUser={currentUser} />}
        />
        <Route
          path="/archive/:year"
          element={<ArchivePage archiveYears={archiveYears} />}
        />
        <Route
          path="/current-tournament"
          element={
            <CurrentTournamentPage
              currentUser={currentUser}
              onLiveStateChange={refreshBootstrap}
            />
          }
        />
        <Route path="/live" element={<LiveOrUpcomingPage mode="LIVE" />} />
        <Route
          path="/upcoming"
          element={<LiveOrUpcomingPage mode="UPCOMING" />}
        />
        <Route
          path="/auction"
          element={
            <AuctionPage
              currentUser={currentUser}
              onNavigate={(route) => navigate(route)}
            />
          }
        />
        <Route
          path="/live-auction"
          element={
            <LiveAuctionPage
              currentUser={currentUser}
              projectorModeRoute={false}
              onNavigate={(route) => navigate(route)}
            />
          }
        />
        <Route
          path="/live-auction/projector"
          element={
            <LiveAuctionPage
              currentUser={currentUser}
              projectorModeRoute={true}
              onNavigate={(route) => navigate(route)}
            />
          }
        />
        <Route
          path="/scorer"
          element={
            <LiveScorerPage
              currentUser={currentUser}
              onLiveStateChange={refreshBootstrap}
            />
          }
        />
        <Route path="/players/:id" element={<PlayerProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}
import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { DemoUser } from "../App";
import { apiFetch, setAuthToken } from "../lib/api";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_unconfigured: "Google Workspace sign-in is not configured on this server.",
  invalid_state: "Sign-in verification expired. Please try again.",
  domain_not_allowed: "Only official @iiitt.ac.in accounts are permitted to sign in.",
  token_exchange_failed: "Unable to complete Google sign-in. Please retry.",
  userinfo_failed: "Could not verify your Google profile. Please retry.",
  account_error: "Unable to load your student profile.",
  oauth_failed: "Google sign-in encountered an error. Please try again.",
};

export default function LoginPage({
  currentUser,
  googleOAuthEnabled,
  onSignedIn,
  onSignOut,
}: {
  currentUser: DemoUser | null;
  googleOAuthEnabled: boolean;
  onSignedIn: (user: DemoUser) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(() => {
    const code = searchParams.get("error");
    return code ? OAUTH_ERROR_MESSAGES[code] || "Sign-in failed." : null;
  });

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(out.error || "Invalid email or password.");
        return;
      }
      if (out.token) setAuthToken(out.token);
      if (out.user) {
        await onSignedIn(out.user);
      }
      navigate("/");
    } catch {
      setErrorMsg("Network error while signing in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 60 }}>
      <div className="panel auth-card">
        <h1 className="section-heading" style={{ marginBottom: 6 }}>
          IIIT Trichy Sports Sign In
        </h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
          Sign in with your institute credentials to register for auctions, apply
          to clubs, submit squads, or operate live scoring consoles.
        </p>

        {currentUser ? (
          <div>
            <div className="notice-item" style={{ marginBottom: 16 }}>
              <div>
                Signed in as <strong>{currentUser.name}</strong>
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {currentUser.email || ""} · {currentUser.role} ·{" "}
                {currentUser.batch} {currentUser.branch}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link
                to="/"
                className="action-btn"
                style={{ textDecoration: "none" }}
              >
                Go to Home
              </Link>
              <button
                type="button"
                className="operator-btn-secondary"
                onClick={() => void onSignOut()}
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <>
            {errorMsg && <div className="error-banner">{errorMsg}</div>}

            {googleOAuthEnabled && (
              <div style={{ marginBottom: 18 }}>
                <a
                  href="/api/auth/google"
                  className="action-btn"
                  style={{
                    display: "block",
                    textAlign: "center",
                    textDecoration: "none",
                    width: "100%",
                  }}
                >
                  Continue with @iiitt.ac.in Google Account
                </a>
                <div className="auth-divider">
                  <span>or sign in with email &amp; password</span>
                </div>
              </div>
            )}

            <form onSubmit={handleLogin} style={{ display: "grid", gap: 12 }}>
              <label className="auth-field">
                <span className="muted">Institute Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="name@iiitt.ac.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>

              <label className="auth-field">
                <span className="muted">Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>

              <button
                type="submit"
                className="action-btn"
                disabled={busy}
                style={{ marginTop: 4 }}
              >
                {busy ? "Signing in..." : "Sign In"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

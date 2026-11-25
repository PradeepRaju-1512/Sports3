import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DemoUser } from "../App";
import { useAuctionSync } from "../hooks/useAuctionSync";
import type { AuctionRegistration, FranchiseSummary } from "../types/auction";

interface OutcomeOverlayState {
  eventId: string;
  kind: "SOLD" | "UNSOLD";
  playerName: string;
  franchiseName: string;
  amount: number;
}

const CONFETTI_PARTICLES = [
  { tx: "-220px", ty: "-150px", rot: "-140deg", delay: "0.02s", size: 8, color: "#d4a038" },
  { tx: "-165px", ty: "-190px", rot: "160deg", delay: "0.05s", size: 6, color: "#f4efe6" },
  { tx: "-90px", ty: "-210px", rot: "-95deg", delay: "0.01s", size: 9, color: "#d4a038" },
  { tx: "-25px", ty: "-195px", rot: "120deg", delay: "0.06s", size: 7, color: "#e5b84b" },
  { tx: "35px", ty: "-215px", rot: "-170deg", delay: "0.03s", size: 8, color: "#d4a038" },
  { tx: "110px", ty: "-185px", rot: "145deg", delay: "0.04s", size: 6, color: "#f4efe6" },
  { tx: "185px", ty: "-155px", rot: "-115deg", delay: "0.02s", size: 9, color: "#d4a038" },
  { tx: "235px", ty: "-90px", rot: "190deg", delay: "0.07s", size: 7, color: "#b91c1c" },
  { tx: "-235px", ty: "-65px", rot: "-190deg", delay: "0.08s", size: 7, color: "#b91c1c" },
  { tx: "-190px", ty: "95px", rot: "130deg", delay: "0.04s", size: 6, color: "#d4a038" },
  { tx: "195px", ty: "85px", rot: "-135deg", delay: "0.05s", size: 6, color: "#e5b84b" },
  { tx: "-120px", ty: "135px", rot: "90deg", delay: "0.09s", size: 7, color: "#f4efe6" },
  { tx: "125px", ty: "130px", rot: "-110deg", delay: "0.06s", size: 8, color: "#d4a038" },
  { tx: "0px", ty: "-230px", rot: "210deg", delay: "0.03s", size: 7, color: "#f4efe6" },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "PL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function GavelIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m14.5 12.5-8 8a2.119 2.119 0 1 1-3-3l8-8" />
      <path d="m16 16 6-6" />
      <path d="m8 8 6-6" />
      <path d="m9 7 8 8" />
      <path d="m21 11-8-8" />
    </svg>
  );
}

export default function LiveAuctionPage({
  currentUser,
  projectorModeRoute = false,
  onNavigate,
}: {
  currentUser: DemoUser | null;
  projectorModeRoute?: boolean;
  onNavigate: (route: string) => void;
}) {
  const { snapshot, connected, error, refreshSnapshot } = useAuctionSync(1800);
  const [fullScreenProjector, setFullScreenProjector] =
    useState(projectorModeRoute);
  const [showOperatorControlsInProjector, setShowOperatorControlsInProjector] =
    useState(false);
  const [jumpBidAmount, setJumpBidAmount] = useState("");
  const [jumpFranchiseId, setJumpFranchiseId] = useState<number | "">("");
  const [pullPlayerId, setPullPlayerId] = useState<number | "">("");

  // Collapsible Live Override mini-drawer state
  const [showLiveOverride, setShowLiveOverride] = useState(false);
  const [overrideInc, setOverrideInc] = useState("");
  const [overrideBasePrice, setOverrideBasePrice] = useState("");
  const [overridePurseFranchiseId, setOverridePurseFranchiseId] = useState<
    number | ""
  >("");
  const [overridePurseValue, setOverridePurseValue] = useState("");

  const [feedback, setFeedback] = useState("");
  const [portraitFailed, setPortraitFailed] = useState(false);
  const [activeOverlay, setActiveOverlay] =
    useState<OutcomeOverlayState | null>(null);
  const [recentSoldPlayerId, setRecentSoldPlayerId] = useState<number | null>(
    null
  );

  const lastHandledOutcomeIdRef = useRef<string | null>(null);
  const initializedHistoryRef = useRef(false);

  useEffect(() => {
    setFullScreenProjector(projectorModeRoute);
    if (projectorModeRoute) {
      setShowOperatorControlsInProjector(false);
    }
  }, [projectorModeRoute]);

  const canOperate = Boolean(
    currentUser &&
      [
        "AUCTION_OPERATOR",
        "AUCTIONEER",
        "SPORTS_SECRETARY",
        "FACULTY_ADVISOR",
      ].includes(currentUser.role)
  );

  // Show Top-Right Operator Controls for authorized operators in console mode,
  // and hide them for spectators and projector-only mode (unless operator explicitly toggles them on).
  const showOperatorPanel =
    canOperate && (!fullScreenProjector || showOperatorControlsInProjector);

  const auction = snapshot?.auction || null;
  const rounds = snapshot?.rounds || [];
  const registrations = snapshot?.registrations || [];
  const allFranchises = snapshot?.franchises || [];
  const bidHistory = snapshot?.bidHistory || [];

  // Strictly scope franchises to the currently active sport (separate purses & squads per sport)
  const activeSportFranchises: FranchiseSummary[] = useMemo(() => {
    if (!auction) return [];
    const targetSport = auction.activeSport.toLowerCase();
    return allFranchises
      .filter((f) => f.sport.toLowerCase() === targetSport)
      .sort((a, b) => a.slotNumber - b.slotNumber || a.id - b.id);
  }, [allFranchises, auction]);

  const activePlayer: AuctionRegistration | null = useMemo(() => {
    if (!auction?.currentPlayerId) return null;
    const found =
      registrations.find((p) => p.id === auction.currentPlayerId) || null;
    if (
      found &&
      found.sport.toLowerCase() !== auction.activeSport.toLowerCase()
    ) {
      return null;
    }
    return found;
  }, [auction?.currentPlayerId, auction?.activeSport, registrations]);

  const sportPoolPlayers = useMemo(() => {
    if (!auction) return [];
    return registrations.filter(
      (r) =>
        r.sport.toLowerCase() === auction.activeSport.toLowerCase() &&
        r.status !== "SOLD" &&
        r.id !== activePlayer?.id
    );
  }, [registrations, auction, activePlayer?.id]);

  // Reset jump team selection & override inputs when active sport or active player changes
  useEffect(() => {
    setJumpFranchiseId("");
    setPullPlayerId("");
    setOverridePurseFranchiseId("");
    setOverridePurseValue("");
  }, [auction?.activeSport]);

  useEffect(() => {
    setPortraitFailed(false);
    setOverrideBasePrice(activePlayer ? String(activePlayer.basePrice) : "");
  }, [activePlayer?.id, activePlayer?.photoUrl, activePlayer?.basePrice]);

  useEffect(() => {
    if (auction) {
      setOverrideInc(String(auction.defaultIncrement));
    }
  }, [auction?.defaultIncrement]);

  const currentHighestBid = useMemo(() => {
    if (!activePlayer || !auction) return 0;
    const playerBids = bidHistory.filter(
      (b) =>
        b.playerId === activePlayer.id &&
        (b.kind === "BID" || b.kind === "JUMP_BID")
    );
    if (playerBids.length === 0) return activePlayer.basePrice;
    return Math.max(...playerBids.map((b) => b.amount));
  }, [activePlayer, auction, bidHistory]);

  const leadingFranchise: FranchiseSummary | null = useMemo(() => {
    if (!activePlayer) return null;
    const lastBid = [...bidHistory]
      .reverse()
      .find(
        (b) =>
          b.playerId === activePlayer.id &&
          (b.kind === "BID" || b.kind === "JUMP_BID")
      );
    if (!lastBid) return null;
    return (
      activeSportFranchises.find((f) => f.id === lastBid.franchiseId) || null
    );
  }, [activePlayer, bidHistory, activeSportFranchises]);

  const nextStandardBid = useMemo(() => {
    if (!activePlayer || !auction) return 0;
    const hasBids = bidHistory.some(
      (b) =>
        b.playerId === activePlayer.id &&
        (b.kind === "BID" || b.kind === "JUMP_BID")
    );
    return hasBids
      ? currentHighestBid + auction.defaultIncrement
      : activePlayer.basePrice;
  }, [activePlayer, auction, bidHistory, currentHighestBid]);

  // Detect new SOLD / UNSOLD events across synced devices and trigger broadcast stamp overlay
  useEffect(() => {
    if (!snapshot) return;
    const latestOutcome = [...bidHistory]
      .reverse()
      .find((ev) => ev.kind === "SOLD" || ev.kind === "UNSOLD");

    if (!initializedHistoryRef.current) {
      initializedHistoryRef.current = true;
      lastHandledOutcomeIdRef.current = latestOutcome?.id || null;
      return;
    }

    if (
      latestOutcome &&
      latestOutcome.id !== lastHandledOutcomeIdRef.current
    ) {
      lastHandledOutcomeIdRef.current = latestOutcome.id;
      setActiveOverlay({
        eventId: latestOutcome.id,
        kind: latestOutcome.kind === "SOLD" ? "SOLD" : "UNSOLD",
        playerName: latestOutcome.playerName,
        franchiseName: latestOutcome.franchiseName,
        amount: latestOutcome.amount,
      });

      if (latestOutcome.kind === "SOLD") {
        setRecentSoldPlayerId(latestOutcome.playerId);
      }

      const timer = window.setTimeout(
        () => {
          setActiveOverlay((curr) =>
            curr?.eventId === latestOutcome.id ? null : curr
          );
        },
        latestOutcome.kind === "SOLD" ? 2600 : 1900
      );
      return () => window.clearTimeout(timer);
    }
  }, [bidHistory, snapshot]);

  const sendCommand = useCallback(
    async (
      endpoint: string,
      payload: Record<string, unknown> = {},
      method: "POST" | "PATCH" = "POST",
      fallbackMessage = "Updated"
    ) => {
      if (!currentUser || !canOperate) return;
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorUserId: currentUser.id, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFeedback(json.error || "Operator command rejected");
        return;
      }
      setFeedback(json.message || fallbackMessage);
      await refreshSnapshot();
    },
    [currentUser, canOperate, refreshSnapshot]
  );

  const handleFranchiseBid = useCallback(
    async (franchise: FranchiseSummary) => {
      if (!activePlayer || !auction) return;
      if (activePlayer.status === "SOLD" || activePlayer.status === "UNSOLD") {
        setFeedback("Load the next player [N] before placing new bids.");
        return;
      }
      if (
        !franchise.isEligibleToBid ||
        nextStandardBid > franchise.maxAllowedBid
      ) {
        setFeedback(
          franchise.lockReason ||
            `${franchise.name} blocked by purse/quota guardrail (Max: ₹${franchise.maxAllowedBid.toLocaleString()})`
        );
        return;
      }
      await sendCommand("/api/auction/bid", {
        playerId: activePlayer.id,
        franchiseId: franchise.id,
        amount: nextStandardBid,
        kind: "BID",
      });
    },
    [activePlayer, auction, nextStandardBid, sendCommand]
  );

  const handleNextPlayer = useCallback(async () => {
    setActiveOverlay(null);
    await sendCommand("/api/auction/next-player", {
      sport: auction?.activeSport,
      roundId: auction?.activeRoundId,
    });
  }, [sendCommand, auction?.activeSport, auction?.activeRoundId]);

  const handleMarkSold = useCallback(async () => {
    if (!activePlayer || !leadingFranchise) {
      setFeedback("Need a leading franchise bid before marking SOLD.");
      return;
    }
    await sendCommand("/api/auction/outcome", {
      playerId: activePlayer.id,
      outcome: "SOLD",
      franchiseId: leadingFranchise.id,
      amount: currentHighestBid,
    });
  }, [activePlayer, leadingFranchise, currentHighestBid, sendCommand]);

  const handleMarkUnsold = useCallback(async () => {
    if (!activePlayer) return;
    await sendCommand("/api/auction/outcome", {
      playerId: activePlayer.id,
      outcome: "UNSOLD",
    });
  }, [activePlayer, sendCommand]);

  const handleUndo = useCallback(async () => {
    setActiveOverlay(null);
    await sendCommand("/api/auction/undo");
  }, [sendCommand]);

  const handleTriggerRtm = useCallback(async () => {
    if (!activePlayer) return;
    await sendCommand("/api/auction/rtm", { playerId: activePlayer.id });
  }, [activePlayer, sendCommand]);

  // Keyboard shortcuts for single operator (scoped strictly to activeSportFranchises)
  useEffect(() => {
    if (!canOperate) return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)
      ) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (e.key >= "1" && e.key <= "8") {
        const slot = Number(e.key);
        const f = activeSportFranchises.find(
          (item) => item.slotNumber === slot
        );
        if (f) {
          e.preventDefault();
          handleFranchiseBid(f);
        }
        return;
      }
      switch (e.key.toLowerCase()) {
        case "u":
          e.preventDefault();
          handleUndo();
          break;
        case "s":
          e.preventDefault();
          handleMarkSold();
          break;
        case "x":
          e.preventDefault();
          handleMarkUnsold();
          break;
        case "n":
          e.preventDefault();
          handleNextPlayer();
          break;
        case "r":
          e.preventDefault();
          handleTriggerRtm();
          break;
        case " ":
          e.preventDefault();
          sendCommand("/api/auction/projector", {
            mode: auction?.projectorMode === "PAUSED" ? "STAGE" : "PAUSED",
          });
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    canOperate,
    activeSportFranchises,
    handleFranchiseBid,
    handleUndo,
    handleMarkSold,
    handleMarkUnsold,
    handleNextPlayer,
    handleTriggerRtm,
    sendCommand,
    auction?.projectorMode,
  ]);

  if (!auction) {
    return (
      <div className="container">
        <section className="panel">
          <h1 className="section-heading">Live Auction</h1>
          <p className="muted">
            {error
              ? `Unable to load auction state (${error}).`
              : "Connecting to live auction stage..."}
          </p>
        </section>
      </div>
    );
  }

  const activeRoundName =
    rounds.find((r) => r.id === auction.activeRoundId)?.name || "Round 1";

  return (
    <div
      className={
        fullScreenProjector
          ? "auction-stage-shell auction-stage-shell--projector"
          : "auction-stage-shell"
      }
    >
      {/* Dramatic SOLD Gavel-Stamp & UNSOLD Stamp Overlays */}
      {activeOverlay && (
        <div
          className="auction-stamp-overlay"
          onClick={() => setActiveOverlay(null)}
          role="dialog"
          aria-live="assertive"
        >
          <div
            className={
              activeOverlay.kind === "SOLD"
                ? "auction-stamp-card"
                : "auction-stamp-card auction-stamp-card--unsold"
            }
          >
            {activeOverlay.kind === "SOLD" && (
              <div className="confetti-layer" aria-hidden="true">
                {CONFETTI_PARTICLES.map((p, idx) => (
                  <span
                    key={idx}
                    className="confetti-spark"
                    style={
                      {
                        "--tx": p.tx,
                        "--ty": p.ty,
                        "--rot": p.rot,
                        width: p.size,
                        height: p.size,
                        background: p.color,
                        animationDelay: p.delay,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </div>
            )}

            <div
              className={
                activeOverlay.kind === "SOLD"
                  ? "stamp-seal"
                  : "stamp-seal stamp-seal--unsold"
              }
            >
              {activeOverlay.kind === "SOLD" && <GavelIcon />}
              <span>{activeOverlay.kind}</span>
            </div>

            <div className="stamp-player-name">{activeOverlay.playerName}</div>

            {activeOverlay.kind === "SOLD" ? (
              <div className="stamp-team-price tabular-nums">
                {activeOverlay.franchiseName} · ₹
                {activeOverlay.amount.toLocaleString()}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 15, marginTop: 8 }}>
                Returned to Unsold Pool
              </div>
            )}
          </div>
        </div>
      )}

      {/* Compact Broadcast Header Bar */}
      <div className="auction-broadcast-bar">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <strong
            style={{
              color: "#d4a038",
              fontSize: 16,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {auction.name}
          </strong>
          <span className="muted tabular-nums">
            {auction.activeSport} · {activeRoundName} · Inc ₹
            {auction.defaultIncrement.toLocaleString()} ·{" "}
            {connected ? "Live Sync" : "Polling"} · Updated{" "}
            {auction.lastUpdatedAt}
          </span>
        </div>

        <div className="auction-context-tabs">
          {showOperatorPanel && (
            <>
              {auction.sports.map((sp) => (
                <button
                  key={sp}
                  type="button"
                  className={
                    auction.activeSport === sp
                      ? "action-btn"
                      : "operator-btn-secondary"
                  }
                  style={{ padding: "5px 10px", fontSize: 11 }}
                  onClick={() =>
                    sendCommand("/api/auction/context", { activeSport: sp })
                  }
                >
                  {sp}
                </button>
              ))}
              {rounds.length > 0 && (
                <select
                  aria-label="Active Auction Round"
                  value={auction.activeRoundId ?? ""}
                  onChange={(e) =>
                    sendCommand("/api/auction/context", {
                      activeRoundId: Number(e.target.value),
                    })
                  }
                  style={{ padding: "4px 8px", fontSize: 11 }}
                >
                  {rounds.map((rd) => (
                    <option key={rd.id} value={rd.id}>
                      #{rd.roundNumber} {rd.name}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}

          {fullScreenProjector ? (
            <>
              {canOperate && (
                <button
                  type="button"
                  className="operator-btn-secondary"
                  style={{ padding: "5px 10px", fontSize: 11 }}
                  onClick={() =>
                    setShowOperatorControlsInProjector((prev) => !prev)
                  }
                >
                  {showOperatorControlsInProjector
                    ? "Hide Controls"
                    : "Operator Controls"}
                </button>
              )}
              <button
                type="button"
                className="operator-btn-secondary"
                style={{ padding: "5px 10px", fontSize: 11 }}
                onClick={() => {
                  setFullScreenProjector(false);
                  if (projectorModeRoute) onNavigate("/live-auction");
                }}
              >
                Exit Projection
              </button>
            </>
          ) : (
            <button
              type="button"
              className="action-btn"
              style={{ padding: "6px 12px", fontSize: 12 }}
              onClick={() => {
                setFullScreenProjector(true);
                setShowOperatorControlsInProjector(false);
                onNavigate("/live-auction/projector");
              }}
            >
              16:9 Projection View
            </button>
          )}
        </div>
      </div>

      {/* ZONE 1 — TOP ROW: 3-Column Grid (Photo | Bio + Current Bid | Operator Controls) */}
      <section
        className={
          showOperatorPanel
            ? "auction-top-row"
            : "auction-top-row auction-top-row--spectator"
        }
      >
        {/* TOP-LEFT: Framed Player Photo + CLUB/NON_CLUB Badge + Base Price */}
        <div
          key={`portrait-${activePlayer?.id ?? "none"}`}
          className="auction-zone-card auction-portrait-panel player-stage-enter"
        >
          <div className="auction-portrait-frame">
            {activePlayer?.photoUrl && !portraitFailed ? (
              <img
                src={activePlayer.photoUrl}
                alt={activePlayer.playerName}
                referrerPolicy="no-referrer"
                className="auction-portrait-img"
                onError={() => setPortraitFailed(true)}
              />
            ) : (
              <div className="photo-initials-fallback auction-portrait-initials">
                {activePlayer ? getInitials(activePlayer.playerName) : "IIITT"}
              </div>
            )}
          </div>

          <div className="auction-portrait-meta">
            <span
              className={
                activePlayer?.playerClass === "NON_CLUB"
                  ? "class-tag class-tag--nonclub"
                  : "class-tag"
              }
            >
              {activePlayer ? activePlayer.playerClass : "STANDBY"}
            </span>

            <div className="base-price-block tabular-nums">
              <span>Base Price</span>
              <strong>
                {activePlayer
                  ? `₹${activePlayer.basePrice.toLocaleString()}`
                  : "—"}
              </strong>
            </div>
          </div>
        </div>

        {/* TOP-MIDDLE: Roll Number, Full Name, Year, Branch, Positions + Giant Current Bid & Leading Team */}
        <div
          key={`bio-${activePlayer?.id ?? "none"}`}
          className="auction-zone-card auction-center-panel player-stage-enter"
        >
          {activePlayer ? (
            <>
              <div>
                <div className="player-roll-kicker tabular-nums">
                  {activePlayer.rollNumber} · {activePlayer.sport} ·{" "}
                  {activePlayer.status.replace("_", " ")}
                </div>
                <h1 className="player-stage-name">{activePlayer.playerName}</h1>
                <div className="player-bio-line">
                  <span>{activePlayer.yearLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activePlayer.branch}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activePlayer.tier.replace("_", " ")}</span>
                </div>
                <div className="player-positions-line">
                  Positions:{" "}
                  <strong>{activePlayer.positions.join(" / ")}</strong>
                </div>
                {activePlayer.statsSummary && (
                  <p className="muted" style={{ margin: "8px 0 0" }}>
                    {activePlayer.statsSummary}
                  </p>
                )}
              </div>

              <div className="bid-spotlight-box">
                <div>
                  <div className="bid-label">
                    {activePlayer.status === "SOLD"
                      ? "Final Sold Price"
                      : "Current Bid"}
                  </div>
                  <div
                    key={`bid-${activePlayer.id}-${currentHighestBid}`}
                    className="bid-giant-amount tabular-nums bid-amount-pop"
                  >
                    ₹{currentHighestBid.toLocaleString()}
                  </div>
                </div>

                <div className="leading-team-badge">
                  <span className="bid-label">
                    {activePlayer.status === "SOLD"
                      ? "Acquired By"
                      : "Leading Team"}
                  </span>
                  {leadingFranchise ? (
                    <span
                      className="leading-team-name"
                      style={{ borderColor: leadingFranchise.accentColor }}
                    >
                      <span
                        className="team-swatch"
                        style={{ background: leadingFranchise.accentColor }}
                      />
                      {leadingFranchise.name}
                    </span>
                  ) : (
                    <span className="muted" style={{ fontSize: 14 }}>
                      Opening Bid · No bids yet
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div style={{ margin: "auto 0" }}>
              <div className="player-roll-kicker">{auction.activeSport}</div>
              <h1 className="player-stage-name">Waiting for Next Player</h1>
              <p className="muted">
                No {auction.activeSport} player is currently on the auction
                block.
              </p>
              {canOperate && (
                <button
                  type="button"
                  className="action-btn"
                  style={{ marginTop: 12 }}
                  onClick={handleNextPlayer}
                >
                  Pull Next Player [N]
                </button>
              )}
            </div>
          )}
        </div>

        {/* TOP-RIGHT: Operator Controls (Scoped to Active Sport Franchises) */}
        {showOperatorPanel && (
          <div className="auction-zone-card auction-operator-panel">
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <strong
                  style={{
                    fontSize: 13,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#d4a038",
                  }}
                >
                  Operator Controls ({auction.activeSport})
                </strong>
                <button
                  type="button"
                  className="operator-btn-secondary"
                  style={{ padding: "3px 8px", fontSize: 11 }}
                  onClick={() => setShowLiveOverride((prev) => !prev)}
                >
                  {showLiveOverride ? "Hide Override" : "Live Override"}
                </button>
              </div>

              {feedback && (
                <div className="operator-feedback-inline">{feedback}</div>
              )}

              <div className="operator-hotkey-grid">
                {activeSportFranchises.map((f) => {
                  const isLead = leadingFranchise?.id === f.id;
                  const disabled =
                    !activePlayer ||
                    activePlayer.status === "SOLD" ||
                    activePlayer.status === "UNSOLD" ||
                    !f.isEligibleToBid ||
                    nextStandardBid > f.maxAllowedBid;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className={
                        isLead
                          ? "operator-bid-btn operator-bid-btn--leading tabular-nums"
                          : "operator-bid-btn tabular-nums"
                      }
                      disabled={disabled}
                      onClick={() => handleFranchiseBid(f)}
                      title={
                        f.lockReason ||
                        `${f.name} · Max Bid ₹${f.maxAllowedBid.toLocaleString()}`
                      }
                    >
                      <span>
                        [{f.slotNumber}] {f.shortCode}
                      </span>
                      <span>₹{nextStandardBid.toLocaleString()}</span>
                    </button>
                  );
                })}
                {activeSportFranchises.length === 0 && (
                  <div className="muted" style={{ fontSize: 12, gridColumn: "1 / -1" }}>
                    No franchises configured for {auction.activeSport}. Add teams
                    in Auction Settings.
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="operator-actions-row">
                <button
                  type="button"
                  className="operator-btn-sold"
                  onClick={handleMarkSold}
                >
                  SOLD [S]
                </button>
                <button
                  type="button"
                  className="operator-btn-secondary"
                  onClick={handleMarkUnsold}
                >
                  UNSOLD [X]
                </button>
                <button
                  type="button"
                  className="operator-btn-secondary"
                  onClick={handleUndo}
                >
                  Undo [U]
                </button>
                <button
                  type="button"
                  className="operator-btn-secondary"
                  onClick={handleTriggerRtm}
                >
                  RTM [R]
                </button>
                <button
                  type="button"
                  className="action-btn"
                  style={{ padding: "8px 12px", fontSize: 12 }}
                  onClick={handleNextPlayer}
                >
                  Next [N]
                </button>
              </div>

              {activePlayer && activeSportFranchises.length > 0 && (
                <div className="operator-jump-row">
                  <select
                    value={jumpFranchiseId}
                    onChange={(e) =>
                      setJumpFranchiseId(
                        e.target.value ? Number(e.target.value) : ""
                      )
                    }
                  >
                    <option value="">Jump Bid Team...</option>
                    {activeSportFranchises.map((f) => (
                      <option key={f.id} value={f.id}>
                        [{f.slotNumber}] {f.shortCode} (Max ₹
                        {f.maxAllowedBid.toLocaleString()})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder={`₹ (+${auction.jumpIncrement.toLocaleString()})`}
                    value={jumpBidAmount}
                    onChange={(e) => setJumpBidAmount(e.target.value)}
                  />
                  <button
                    type="button"
                    className="operator-btn-secondary"
                    onClick={() => {
                      if (!jumpFranchiseId || !jumpBidAmount) return;
                      sendCommand("/api/auction/bid", {
                        playerId: activePlayer.id,
                        franchiseId: jumpFranchiseId,
                        amount: Number(jumpBidAmount),
                        kind: "JUMP_BID",
                      });
                      setJumpBidAmount("");
                    }}
                  >
                    Jump
                  </button>
                </div>
              )}

              {/* Pull Specific Player onto the Block */}
              {sportPoolPlayers.length > 0 && (
                <div className="operator-pull-row">
                  <select
                    value={pullPlayerId}
                    onChange={(e) =>
                      setPullPlayerId(
                        e.target.value ? Number(e.target.value) : ""
                      )
                    }
                  >
                    <option value="">Pull {auction.activeSport} Player...</option>
                    {sportPoolPlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.playerName} ({p.playerClass} · ₹
                        {p.basePrice.toLocaleString()} · {p.status})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="operator-btn-secondary"
                    disabled={!pullPlayerId}
                    onClick={() => {
                      if (!pullPlayerId) return;
                      setActiveOverlay(null);
                      sendCommand("/api/auction/context", {
                        currentPlayerId: pullPlayerId,
                      });
                      setPullPlayerId("");
                    }}
                  >
                    Pull
                  </button>
                </div>
              )}

              {/* Collapsible Quick Live Override Drawer */}
              {showLiveOverride && (
                <div className="live-override-drawer">
                  <div className="live-override-row">
                    <span>Bid Inc (₹)</span>
                    <input
                      type="number"
                      min={100}
                      step={100}
                      value={overrideInc}
                      onChange={(e) => setOverrideInc(e.target.value)}
                      className="tabular-nums"
                    />
                    <button
                      type="button"
                      className="operator-btn-secondary"
                      onClick={() =>
                        sendCommand(
                          "/api/auction/config",
                          {
                            defaultIncrement: Number(overrideInc),
                            jumpIncrement: Math.max(
                              auction.jumpIncrement,
                              Number(overrideInc)
                            ),
                          },
                          "PATCH",
                          `Updated bid increment to ₹${Number(overrideInc).toLocaleString()}.`
                        )
                      }
                    >
                      Set
                    </button>
                  </div>

                  {activePlayer && (
                    <div className="live-override-row">
                      <span>Base (₹)</span>
                      <input
                        type="number"
                        min={0}
                        step={500}
                        value={overrideBasePrice}
                        onChange={(e) => setOverrideBasePrice(e.target.value)}
                        className="tabular-nums"
                      />
                      <button
                        type="button"
                        className="operator-btn-secondary"
                        onClick={() =>
                          sendCommand(
                            `/api/auction/registrations/${activePlayer.id}`,
                            { basePrice: Number(overrideBasePrice) },
                            "PATCH",
                            `Updated ${activePlayer.playerName}'s base price to ₹${Number(overrideBasePrice).toLocaleString()}.`
                          )
                        }
                      >
                        Set
                      </button>
                    </div>
                  )}

                  {activeSportFranchises.length > 0 && (
                    <div className="live-override-row live-override-row--purse">
                      <select
                        value={overridePurseFranchiseId}
                        onChange={(e) => {
                          const fid = e.target.value
                            ? Number(e.target.value)
                            : "";
                          setOverridePurseFranchiseId(fid);
                          const found = activeSportFranchises.find(
                            (x) => x.id === fid
                          );
                          if (found)
                            setOverridePurseValue(String(found.startingPurse));
                        }}
                      >
                        <option value="">Purse Team...</option>
                        {activeSportFranchises.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.shortCode} (₹{f.startingPurse.toLocaleString()})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        step={5000}
                        placeholder="Starting ₹"
                        value={overridePurseValue}
                        onChange={(e) => setOverridePurseValue(e.target.value)}
                        className="tabular-nums"
                      />
                      <button
                        type="button"
                        className="operator-btn-secondary"
                        disabled={!overridePurseFranchiseId || !overridePurseValue}
                        onClick={() => {
                          if (!overridePurseFranchiseId || !overridePurseValue)
                            return;
                          sendCommand(
                            `/api/auction/franchises/${overridePurseFranchiseId}`,
                            { startingPurse: Number(overridePurseValue) },
                            "PATCH",
                            `Updated franchise purse to ₹${Number(overridePurseValue).toLocaleString()}.`
                          );
                        }}
                      >
                        Set
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ZONE 2 — MIDDLE-TO-BOTTOM: Responsive Multi-Column Grid of Active Sport Franchises & Bought Players */}
      <section className="auction-franchises-zone">
        <div className="auction-franchises-grid">
          {activeSportFranchises.map((f) => {
            const isLead = leadingFranchise?.id === f.id;
            const bought = f.purchasedPlayers || [];

            return (
              <article
                key={f.id}
                className={[
                  "franchise-card",
                  isLead ? "franchise-card--leading" : "",
                  !f.isEligibleToBid ? "franchise-card--locked" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <header className="franchise-card-header">
                  <div className="franchise-header-top">
                    <div>
                      <div className="franchise-name-row">
                        <span
                          className="team-swatch"
                          style={{ background: f.accentColor }}
                        />
                        <span>{f.name}</span>
                      </div>
                      <div className="franchise-captain">
                        Captain: {f.captainName || "TBD"} · {f.sport}
                      </div>
                    </div>

                    <div className="franchise-purse-block tabular-nums">
                      <div className="bid-label" style={{ fontSize: 10 }}>
                        Remaining Purse
                      </div>
                      <div className="franchise-purse-amount">
                        ₹{f.remainingPurse.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="franchise-header-stats tabular-nums">
                    <span>
                      Squad: <strong>{f.squadCount}</strong>/{f.maxSquadSize}
                    </span>
                    <span>
                      C: <strong>{f.clubCount}</strong>/{f.minClubPlayers} · NC:{" "}
                      <strong>{f.nonClubCount}</strong>/{f.minNonClubPlayers}
                    </span>
                    <span>
                      Max Bid: <strong>₹{f.maxAllowedBid.toLocaleString()}</strong>
                    </span>
                    {f.lockReason && (
                      <span style={{ color: "#f87171" }}>{f.lockReason}</span>
                    )}
                  </div>
                </header>

                <ul className="franchise-roster-list">
                  {bought.length === 0 ? (
                    <li
                      className="muted"
                      style={{ padding: "14px 4px", fontSize: 12 }}
                    >
                      No {f.sport} players acquired yet.
                    </li>
                  ) : (
                    bought.map((pl) => (
                      <li
                        key={pl.id}
                        className={
                          recentSoldPlayerId === pl.id
                            ? "franchise-roster-item franchise-roster-item--new"
                            : "franchise-roster-item"
                        }
                      >
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ color: "#f4efe6", display: "block" }}>
                            {pl.playerName}
                          </strong>
                          <span className="muted" style={{ fontSize: 12 }}>
                            {pl.positions.join(", ")} · {pl.playerClass}
                          </span>
                        </div>
                        <span className="franchise-roster-price tabular-nums">
                          ₹{pl.soldPrice.toLocaleString()}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </article>
            );
          })}

          {activeSportFranchises.length === 0 && (
            <div className="panel" style={{ gridColumn: "1 / -1" }}>
              <p className="muted">
                No franchises have been configured for{" "}
                <strong>{auction.activeSport}</strong> yet. The Sports Secretary
                can add {auction.activeSport} teams and purses in the Auction
                Settings panel.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
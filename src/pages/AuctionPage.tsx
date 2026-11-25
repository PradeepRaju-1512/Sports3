import React, { useEffect, useMemo, useRef, useState } from "react";
import type { DemoUser } from "../App";
import type {
  AuctionConfig,
  AuctionPlayerStatus,
  AuctionRegistration,
  AuctionRound,
  FranchiseSummary,
  PlayerClass,
  SportBasePriceOverride,
} from "../types/auction";

const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year", "MTech"];
const BRANCHES = ["CSE", "ECE", "MECH", "EEE", "IT"];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "PL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getEffectiveSportBasePrice(
  auction: AuctionConfig,
  sport: string,
  playerClass: PlayerClass
): number {
  const override = auction.sportBasePrices?.[sport];
  if (override) {
    return playerClass === "CLUB"
      ? override.clubBasePrice
      : override.nonClubBasePrice;
  }
  return playerClass === "CLUB"
    ? auction.clubBasePrice
    : auction.nonClubBasePrice;
}

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.onload = () => {
      const rawUrl = String(reader.result || "");
      const img = new Image();
      img.onerror = () => resolve(rawUrl);
      img.onload = () => {
        const maxDim = 640;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(rawUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}

function RosterThumbnail({
  photoUrl,
  name,
}: {
  photoUrl?: string | null;
  name: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [photoUrl]);

  return (
    <div className="roster-avatar">
      {photoUrl && !failed ? (
        <img
          src={photoUrl}
          alt={name}
          referrerPolicy="no-referrer"
          className="photo-preview-img"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="photo-initials-fallback" style={{ fontSize: 13 }}>
          {getInitials(name)}
        </div>
      )}
    </div>
  );
}

type ConfigTab = "pricing" | "franchises" | "rounds";

export default function AuctionPage({
  currentUser,
  onNavigate,
}: {
  currentUser: DemoUser | null;
  onNavigate: (route: string) => void;
}) {
  const [auction, setAuction] = useState<AuctionConfig | null>(null);
  const [rounds, setRounds] = useState<AuctionRound[]>([]);
  const [registrations, setRegistrations] = useState<AuctionRegistration[]>([]);
  const [franchises, setFranchises] = useState<FranchiseSummary[]>([]);
  const [inductedSports, setInductedSports] = useState<string[]>([]);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Student single-sport enrollment state (1 registration per sport; multiple positions allowed)
  const [yearLabel, setYearLabel] = useState(currentUser?.batch || "3rd Year");
  const [branch, setBranch] = useState(currentUser?.branch || "CSE");
  const [selectedSport, setSelectedSport] = useState("");
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [statsSummary, setStatsSummary] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string>("");
  const [photoFileName, setPhotoFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sports Secretary Configuration & Management Panel State
  const [activeConfigTab, setActiveConfigTab] = useState<ConfigTab>("pricing");
  const [cfgName, setCfgName] = useState("");
  const [cfgDeadline, setCfgDeadline] = useState("");
  const [cfgClubBase, setCfgClubBase] = useState("");
  const [cfgNonClubBase, setCfgNonClubBase] = useState("");
  const [cfgDefaultInc, setCfgDefaultInc] = useState("");
  const [cfgJumpInc, setCfgJumpInc] = useState("");
  const [cfgMinSquad, setCfgMinSquad] = useState("");
  const [cfgMaxSquad, setCfgMaxSquad] = useState("");
  const [cfgMinClub, setCfgMinClub] = useState("");
  const [cfgMinNonClub, setCfgMinNonClub] = useState("");
  const [cfgTiersText, setCfgTiersText] = useState("");
  const [cfgSportsText, setCfgSportsText] = useState("");
  const [cfgSportOverrides, setCfgSportOverrides] = useState<
    Record<string, { club: string; nonClub: string }>
  >({});
  const [cfgPositionsText, setCfgPositionsText] = useState<
    Record<string, string>
  >({});

  // Franchise Management State (per-sport)
  const [franchiseSportFilter, setFranchiseSportFilter] = useState("Cricket");
  const [newFrSport, setNewFrSport] = useState("Cricket");
  const [newFrName, setNewFrName] = useState("");
  const [newFrCode, setNewFrCode] = useState("");
  const [newFrColor, setNewFrColor] = useState("#d4a038");
  const [newFrCaptain, setNewFrCaptain] = useState("");
  const [newFrPurse, setNewFrPurse] = useState("150000");

  const [editingFrId, setEditingFrId] = useState<number | null>(null);
  const [editFrName, setEditFrName] = useState("");
  const [editFrCode, setEditFrCode] = useState("");
  const [editFrColor, setEditFrColor] = useState("#d4a038");
  const [editFrCaptain, setEditFrCaptain] = useState("");
  const [editFrSport, setEditFrSport] = useState("");
  const [editFrPurse, setEditFrPurse] = useState("");
  const [editFrSlot, setEditFrSlot] = useState("");

  // Rounds Management State
  const [newRoundName, setNewRoundName] = useState("");
  const [newRoundNum, setNewRoundNum] = useState("");
  const [editingRoundId, setEditingRoundId] = useState<number | null>(null);
  const [editRoundName, setEditRoundName] = useState("");
  const [editRoundNum, setEditRoundNum] = useState("");
  const [editRoundStatus, setEditRoundStatus] =
    useState<AuctionRound["status"]>("PENDING");
  const [unsoldMoveSport, setUnsoldMoveSport] = useState("ALL");

  // Roster Search, Sort & Inline Edit State
  const [rosterSportTab, setRosterSportTab] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"year" | "branch" | "position">("year");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPlayerName, setEditPlayerName] = useState("");
  const [editRollNumber, setEditRollNumber] = useState("");
  const [editYear, setEditYear] = useState("");
  const [editBranch, setEditBranch] = useState("");
  const [editPositions, setEditPositions] = useState("");
  const [editPlayerClass, setEditPlayerClass] = useState<PlayerClass>("CLUB");
  const [editBasePrice, setEditBasePrice] = useState("");
  const [editTier, setEditTier] = useState("");
  const [editRoundId, setEditRoundId] = useState<number>(1);
  const [editStatus, setEditStatus] = useState<AuctionPlayerStatus>("ELIGIBLE");

  const isSecretary = Boolean(
    currentUser &&
      ["SPORTS_SECRETARY", "FACULTY_ADVISOR"].includes(currentUser.role)
  );

  const isRegistrationClosed = Boolean(
    auction &&
      ["FROZEN", "LIVE", "COMPLETED", "PUBLISHED"].includes(auction.status)
  );

  function syncConfigForm(cfg: AuctionConfig) {
    setCfgName(cfg.name);
    setCfgDeadline(cfg.registrationDeadline);
    setCfgClubBase(String(cfg.clubBasePrice));
    setCfgNonClubBase(String(cfg.nonClubBasePrice));
    setCfgDefaultInc(String(cfg.defaultIncrement));
    setCfgJumpInc(String(cfg.jumpIncrement));
    setCfgMinSquad(String(cfg.minSquadSize));
    setCfgMaxSquad(String(cfg.maxSquadSize));
    setCfgMinClub(String(cfg.minClubPlayers));
    setCfgMinNonClub(String(cfg.minNonClubPlayers));
    setCfgTiersText((cfg.playerTiers || []).join(", "));
    setCfgSportsText((cfg.sports || []).join(", "));

    const ov: Record<string, { club: string; nonClub: string }> = {};
    const posMap: Record<string, string> = {};
    for (const sp of cfg.sports || []) {
      const existing = cfg.sportBasePrices?.[sp];
      ov[sp] = {
        club: existing ? String(existing.clubBasePrice) : "",
        nonClub: existing ? String(existing.nonClubBasePrice) : "",
      };
      posMap[sp] = (cfg.positionsBySport?.[sp] || []).join(", ");
    }
    setCfgSportOverrides(ov);
    setCfgPositionsText(posMap);
  }

  async function loadAuctionData() {
    const query = currentUser ? `?userId=${currentUser.id}` : "";
    const res = await fetch(`/api/auction${query}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const cfg: AuctionConfig | null = data.auction || null;
    setAuction(cfg);
    setRounds(data.rounds || []);
    setRegistrations(data.registrations || []);
    setFranchises(data.franchises || []);
    setInductedSports(data.inductedSports || []);
    if (cfg) {
      syncConfigForm(cfg);
      if (cfg.sports?.length) {
        setSelectedSport((prev) =>
          prev && cfg.sports.includes(prev) ? prev : cfg.sports[0]
        );
        setRosterSportTab((prev) =>
          prev && cfg.sports.includes(prev) ? prev : cfg.sports[0]
        );
        setFranchiseSportFilter((prev) =>
          prev === "ALL" || (prev && cfg.sports.includes(prev))
            ? prev
            : cfg.sports[0]
        );
        setNewFrSport((prev) =>
          prev && cfg.sports.includes(prev) ? prev : cfg.sports[0]
        );
      }
    }
  }

  useEffect(() => {
    loadAuctionData();
  }, [currentUser?.id]);

  // Keep positions valid from database-backed positionsBySport when switching sport
  useEffect(() => {
    if (!auction || !selectedSport) return;
    const allowed = auction.positionsBySport?.[selectedSport] || ["Player"];
    setSelectedPositions((prev) => {
      const filtered = prev.filter((p) => allowed.includes(p));
      return filtered.length ? filtered : [allowed[0]];
    });
  }, [selectedSport, auction]);

  const currentPlayerClass: PlayerClass = inductedSports.includes(selectedSport)
    ? "CLUB"
    : "NON_CLUB";

  const previewBasePrice = auction
    ? getEffectiveSportBasePrice(auction, selectedSport, currentPlayerClass)
    : 0;

  const alreadyEnrolledInSport = useMemo(
    () =>
      registrations.some(
        (r) =>
          currentUser &&
          r.userId === currentUser.id &&
          r.sport.toLowerCase() === selectedSport.toLowerCase()
      ),
    [registrations, currentUser, selectedSport]
  );

  function showMessage(msg: string, isError = false) {
    if (isError) {
      setErrorMsg(msg);
      setStatusMsg("");
    } else {
      setStatusMsg(msg);
      setErrorMsg("");
    }
  }

  function togglePosition(pos: string) {
    setSelectedPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showMessage("Please select a valid image file (PNG, JPG, or WebP).", true);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showMessage("Image must be smaller than 8 MB.", true);
      return;
    }
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setPhotoDataUrl(dataUrl);
      setPhotoFileName(file.name);
      setErrorMsg("");
    } catch {
      showMessage("Failed to process image preview. Please try another photo.", true);
    }
  }

  function handleClearPhoto() {
    setPhotoDataUrl("");
    setPhotoFileName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleEnrollSport(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) {
      showMessage("Please select or sign in with a user account first.", true);
      return;
    }
    if (selectedPositions.length === 0) {
      showMessage("Select at least one playing position for this sport.", true);
      return;
    }

    const res = await fetch("/api/auction/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: currentUser.id,
        yearLabel,
        branch,
        sport: selectedSport,
        positions: selectedPositions,
        statsSummary,
        photoUrl: photoDataUrl || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      showMessage(json.error || "Could not submit sport registration.", true);
      return;
    }
    setStatsSummary("");
    handleClearPhoto();
    showMessage(
      `Enrolled in ${selectedSport} (${json.registration?.playerClass || currentPlayerClass}) at ₹${Number(json.registration?.basePrice || previewBasePrice).toLocaleString()} with positions: ${selectedPositions.join(", ")}.`
    );
    await loadAuctionData();
  }

  async function handleAdminAction(
    path: string,
    body: Record<string, unknown>,
    successText: string,
    method: "POST" | "PATCH" | "DELETE" = "POST"
  ) {
    if (!currentUser) return false;
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorUserId: currentUser.id, ...body }),
    });
    const json = await res.json();
    if (!res.ok) {
      showMessage(json.error || "Action failed", true);
      return false;
    }
    showMessage(successText);
    await loadAuctionData();
    return true;
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser || !auction) return;

    const sportsList = cfgSportsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const tiersList = cfgTiersText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const sportBasePrices: Record<string, SportBasePriceOverride> = {};
    const positionsBySport: Record<string, string[]> = {
      ...(auction.positionsBySport || {}),
    };

    for (const sp of sportsList) {
      const ov = cfgSportOverrides[sp];
      if (ov && (ov.club.trim() !== "" || ov.nonClub.trim() !== "")) {
        sportBasePrices[sp] = {
          clubBasePrice: Number(ov.club !== "" ? ov.club : cfgClubBase),
          nonClubBasePrice: Number(
            ov.nonClub !== "" ? ov.nonClub : cfgNonClubBase
          ),
        };
      }
      const posLine = cfgPositionsText[sp];
      if (posLine !== undefined) {
        const parsed = posLine
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);
        if (parsed.length > 0) positionsBySport[sp] = parsed;
      }
    }

    await handleAdminAction(
      "/api/auction/config",
      {
        name: cfgName,
        registrationDeadline: cfgDeadline,
        sports: sportsList,
        clubBasePrice: Number(cfgClubBase),
        nonClubBasePrice: Number(cfgNonClubBase),
        sportBasePrices,
        defaultIncrement: Number(cfgDefaultInc),
        jumpIncrement: Number(cfgJumpInc),
        minSquadSize: Number(cfgMinSquad),
        maxSquadSize: Number(cfgMaxSquad),
        minClubPlayers: Number(cfgMinClub),
        minNonClubPlayers: Number(cfgMinNonClub),
        playerTiers: tiersList,
        positionsBySport,
      },
      "Saved auction pricing, quotas, increments, and sport rules. Eligible player base prices updated.",
      "PATCH"
    );
  }

  async function handleAddFranchise(e: React.FormEvent) {
    e.preventDefault();
    const ok = await handleAdminAction(
      "/api/auction/franchises",
      {
        sport: newFrSport,
        name: newFrName,
        shortCode: newFrCode,
        accentColor: newFrColor,
        captainName: newFrCaptain,
        startingPurse: Number(newFrPurse),
      },
      `Added ${newFrSport} franchise "${newFrName}" with ₹${Number(newFrPurse).toLocaleString()} purse.`,
      "POST"
    );
    if (ok) {
      setNewFrName("");
      setNewFrCode("");
      setNewFrCaptain("");
    }
  }

  function startEditFranchise(f: FranchiseSummary) {
    setEditingFrId(f.id);
    setEditFrName(f.name);
    setEditFrCode(f.shortCode);
    setEditFrColor(f.accentColor);
    setEditFrCaptain(f.captainName);
    setEditFrSport(f.sport);
    setEditFrPurse(String(f.startingPurse));
    setEditFrSlot(String(f.slotNumber));
  }

  async function saveEditFranchise(id: number) {
    const ok = await handleAdminAction(
      `/api/auction/franchises/${id}`,
      {
        name: editFrName,
        shortCode: editFrCode,
        accentColor: editFrColor,
        captainName: editFrCaptain,
        sport: editFrSport,
        startingPurse: Number(editFrPurse),
        slotNumber: Number(editFrSlot),
      },
      `Updated franchise "${editFrName}".`,
      "PATCH"
    );
    if (ok) setEditingFrId(null);
  }

  async function deleteFranchise(f: FranchiseSummary) {
    await handleAdminAction(
      `/api/auction/franchises/${f.id}`,
      {},
      `Deleted franchise "${f.name}" (${f.sport}).`,
      "DELETE"
    );
  }

  async function handleAddRound(e: React.FormEvent) {
    e.preventDefault();
    const ok = await handleAdminAction(
      "/api/auction/rounds",
      {
        name: newRoundName,
        roundNumber: newRoundNum ? Number(newRoundNum) : undefined,
      },
      `Created round "${newRoundName}".`,
      "POST"
    );
    if (ok) {
      setNewRoundName("");
      setNewRoundNum("");
    }
  }

  function startEditRound(rd: AuctionRound) {
    setEditingRoundId(rd.id);
    setEditRoundName(rd.name);
    setEditRoundNum(String(rd.roundNumber));
    setEditRoundStatus(rd.status);
  }

  async function saveEditRound(id: number) {
    const ok = await handleAdminAction(
      `/api/auction/rounds/${id}`,
      {
        name: editRoundName,
        roundNumber: Number(editRoundNum),
        status: editRoundStatus,
      },
      `Updated round "${editRoundName}".`,
      "PATCH"
    );
    if (ok) setEditingRoundId(null);
  }

  function startEditRow(reg: AuctionRegistration) {
    setEditingId(reg.id);
    setEditPlayerName(reg.playerName);
    setEditRollNumber(reg.rollNumber);
    setEditYear(reg.yearLabel);
    setEditBranch(reg.branch);
    setEditPositions(reg.positions.join(", "));
    setEditPlayerClass(reg.playerClass);
    setEditBasePrice(String(reg.basePrice));
    setEditTier(reg.tier);
    setEditRoundId(reg.roundId);
    setEditStatus(reg.status);
  }

  async function saveEditRow(id: number) {
    const ok = await handleAdminAction(
      `/api/auction/registrations/${id}`,
      {
        playerName: editPlayerName,
        rollNumber: editRollNumber,
        yearLabel: editYear,
        branch: editBranch,
        positions: editPositions
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        playerClass: editPlayerClass,
        basePrice: Number(editBasePrice),
        tier: editTier,
        roundId: editRoundId,
        status: editStatus,
      },
      `Updated player registration for ${editPlayerName}.`,
      "PATCH"
    );
    if (ok) setEditingId(null);
  }

  const filteredSportRoster = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = registrations.filter((r) => {
      if (rosterSportTab && r.sport !== rosterSportTab) return false;
      if (!q) return true;
      return (
        r.playerName.toLowerCase().includes(q) ||
        r.rollNumber.toLowerCase().includes(q) ||
        r.branch.toLowerCase().includes(q) ||
        r.yearLabel.toLowerCase().includes(q) ||
        r.positions.some((p) => p.toLowerCase().includes(q)) ||
        r.playerClass.toLowerCase().includes(q) ||
        r.tier.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === "year") return a.yearLabel.localeCompare(b.yearLabel);
      if (sortBy === "branch") return a.branch.localeCompare(b.branch);
      return (a.positions[0] || "").localeCompare(b.positions[0] || "");
    });
  }, [registrations, rosterSportTab, searchQuery, sortBy]);

  const visibleFranchises = useMemo(() => {
    const list =
      franchiseSportFilter === "ALL"
        ? franchises
        : franchises.filter(
            (f) => f.sport.toLowerCase() === franchiseSportFilter.toLowerCase()
          );
    return [...list].sort(
      (a, b) =>
        a.sport.localeCompare(b.sport) ||
        a.slotNumber - b.slotNumber ||
        a.id - b.id
    );
  }, [franchises, franchiseSportFilter]);

  if (!auction) {
    return (
      <div className="container">
        <section className="panel">
          <h1 className="section-heading">Prothymos Auction</h1>
          <p className="muted">
            No auction is currently planned. Once the Sports Secretary schedules
            an auction, student enrollment and live auction controls will appear
            here.
          </p>
        </section>
      </div>
    );
  }

  const availablePositions = auction.positionsBySport?.[selectedSport] || [
    "Player",
  ];
  const unsoldCount = registrations.filter((r) => r.status === "UNSOLD").length;

  return (
    <div className="container">
      {/* Auction Overview & Lifecycle Header */}
      <section className="panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1 className="section-heading">{auction.name}</h1>
            <p className="muted tabular-nums">
              Status: <strong>{auction.status}</strong> · Deadline:{" "}
              {auction.registrationDeadline} · Global Base:{" "}
              <strong>₹{auction.clubBasePrice.toLocaleString()}</strong> CLUB /{" "}
              <strong>₹{auction.nonClubBasePrice.toLocaleString()}</strong>{" "}
              NON-CLUB · Inc:{" "}
              <strong>₹{auction.defaultIncrement.toLocaleString()}</strong> ·
              Squad:{" "}
              <strong>
                {auction.minSquadSize}–{auction.maxSquadSize}
              </strong>
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="action-btn"
              onClick={() => onNavigate("/live-auction")}
            >
              Open Live Auction Console
            </button>
            <button
              type="button"
              className="operator-btn-secondary"
              onClick={() => onNavigate("/live-auction/projector")}
            >
              Projector View
            </button>
          </div>
        </div>

        {statusMsg && (
          <div className="auction-feedback-banner">{statusMsg}</div>
        )}
        {errorMsg && (
          <div className="auction-feedback-banner auction-feedback-banner--error">
            {errorMsg}
          </div>
        )}

        {/* Multi-Round Overview */}
        <div
          style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}
        >
          {rounds.map((rd) => (
            <div
              key={rd.id}
              className="list-item-row"
              style={{
                padding: "8px 12px",
                borderColor:
                  rd.id === auction.activeRoundId ? "#d4a038" : undefined,
              }}
            >
              <strong>
                #{rd.roundNumber} {rd.name}
              </strong>{" "}
              <span className="muted">({rd.status})</span>
              {isSecretary && rd.id !== auction.activeRoundId && (
                <button
                  type="button"
                  className="operator-btn-secondary"
                  style={{ marginLeft: 8, padding: "2px 8px", fontSize: 11 }}
                  onClick={() =>
                    handleAdminAction(
                      "/api/auction/round",
                      { roundId: rd.id },
                      `Switched active round to ${rd.name}`
                    )
                  }
                >
                  Set Active
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Sports Secretary Lifecycle Controls */}
        {isSecretary && (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginTop: 12,
            }}
          >
            <button
              type="button"
              className="operator-btn-secondary"
              onClick={() =>
                handleAdminAction(
                  "/api/auction/status",
                  { status: "REGISTRATION_OPEN" },
                  "Registration opened for students."
                )
              }
            >
              Open Registration
            </button>
            <button
              type="button"
              className="operator-btn-secondary"
              onClick={() =>
                handleAdminAction(
                  "/api/auction/status",
                  { status: "FROZEN" },
                  "Registration closed & roster frozen for Sports Secretary review."
                )
              }
            >
              Close Registration (Freeze)
            </button>
            <button
              type="button"
              className="action-btn"
              onClick={() =>
                handleAdminAction(
                  "/api/auction/status",
                  { status: "LIVE" },
                  "Auction is now LIVE across all logged-in devices."
                )
              }
            >
              Start Live Auction
            </button>
            <button
              type="button"
              className="operator-btn-secondary"
              onClick={() =>
                handleAdminAction(
                  "/api/auction/status",
                  { status: "COMPLETED" },
                  "Auction marked COMPLETED."
                )
              }
            >
              Mark Completed
            </button>
          </div>
        )}
      </section>

      {/* Sports Secretary Configuration & Management Panel (Zero Hardcoding) */}
      {isSecretary && (
        <section className="panel config-panel">
          <div className="config-panel-header">
            <div>
              <h2 className="section-heading">
                Sports Secretary Auction Settings
              </h2>
              <p className="muted" style={{ marginTop: 2 }}>
                Every rule, base price, increment, round, franchise, captain,
                and per-sport purse is editable live and persisted.
              </p>
            </div>
            <div className="config-tab-bar" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeConfigTab === "pricing"}
                className={
                  activeConfigTab === "pricing"
                    ? "action-btn"
                    : "operator-btn-secondary"
                }
                onClick={() => setActiveConfigTab("pricing")}
              >
                Pricing, Quotas &amp; Increments
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeConfigTab === "franchises"}
                className={
                  activeConfigTab === "franchises"
                    ? "action-btn"
                    : "operator-btn-secondary"
                }
                onClick={() => setActiveConfigTab("franchises")}
              >
                Franchises, Captains &amp; Per-Sport Purses ({franchises.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeConfigTab === "rounds"}
                className={
                  activeConfigTab === "rounds"
                    ? "action-btn"
                    : "operator-btn-secondary"
                }
                onClick={() => setActiveConfigTab("rounds")}
              >
                Rounds &amp; Pool ({rounds.length})
              </button>
            </div>
          </div>

          {/* TAB 1: PRICING, QUOTAS & INCREMENTS */}
          {activeConfigTab === "pricing" && (
            <form onSubmit={handleSaveConfig} className="config-form-stack">
              <div className="config-grid">
                <label className="config-field">
                  <span>Auction Title</span>
                  <input
                    value={cfgName}
                    onChange={(e) => setCfgName(e.target.value)}
                    required
                  />
                </label>
                <label className="config-field">
                  <span>Registration Deadline</span>
                  <input
                    value={cfgDeadline}
                    onChange={(e) => setCfgDeadline(e.target.value)}
                  />
                </label>
                <label className="config-field">
                  <span>Global CLUB Base Price (₹)</span>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={cfgClubBase}
                    onChange={(e) => setCfgClubBase(e.target.value)}
                    className="tabular-nums"
                  />
                </label>
                <label className="config-field">
                  <span>Global NON_CLUB Base Price (₹)</span>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={cfgNonClubBase}
                    onChange={(e) => setCfgNonClubBase(e.target.value)}
                    className="tabular-nums"
                  />
                </label>
                <label className="config-field">
                  <span>Default Bid Increment (₹)</span>
                  <input
                    type="number"
                    min={100}
                    step={100}
                    value={cfgDefaultInc}
                    onChange={(e) => setCfgDefaultInc(e.target.value)}
                    className="tabular-nums"
                  />
                </label>
                <label className="config-field">
                  <span>Jump Bid Increment (₹)</span>
                  <input
                    type="number"
                    min={100}
                    step={500}
                    value={cfgJumpInc}
                    onChange={(e) => setCfgJumpInc(e.target.value)}
                    className="tabular-nums"
                  />
                </label>
                <label className="config-field">
                  <span>Min Squad Size (Per Sport)</span>
                  <input
                    type="number"
                    min={1}
                    value={cfgMinSquad}
                    onChange={(e) => setCfgMinSquad(e.target.value)}
                    className="tabular-nums"
                  />
                </label>
                <label className="config-field">
                  <span>Max Squad Size (Per Sport)</span>
                  <input
                    type="number"
                    min={1}
                    value={cfgMaxSquad}
                    onChange={(e) => setCfgMaxSquad(e.target.value)}
                    className="tabular-nums"
                  />
                </label>
                <label className="config-field">
                  <span>Min CLUB Quota</span>
                  <input
                    type="number"
                    min={0}
                    value={cfgMinClub}
                    onChange={(e) => setCfgMinClub(e.target.value)}
                    className="tabular-nums"
                  />
                </label>
                <label className="config-field">
                  <span>Min NON_CLUB Quota</span>
                  <input
                    type="number"
                    min={0}
                    value={cfgMinNonClub}
                    onChange={(e) => setCfgMinNonClub(e.target.value)}
                    className="tabular-nums"
                  />
                </label>
                <label className="config-field">
                  <span>Player Tiers (comma-separated)</span>
                  <input
                    value={cfgTiersText}
                    onChange={(e) => setCfgTiersText(e.target.value)}
                    placeholder="MARQUEE, TIER_1, TIER_2, UNCAPPED"
                  />
                </label>
                <label className="config-field">
                  <span>Auction Sports (comma-separated)</span>
                  <input
                    value={cfgSportsText}
                    onChange={(e) => setCfgSportsText(e.target.value)}
                    placeholder="Cricket, Football, Volleyball, Badminton, Kabaddi"
                  />
                </label>
              </div>

              <div className="config-subblock">
                <div className="config-subblock-title">
                  Per-Sport Base Price Overrides &amp; Playing Positions
                </div>
                <p className="muted" style={{ marginBottom: 10 }}>
                  Leave sport base prices blank to inherit the Global CLUB (₹
                  {Number(cfgClubBase || 0).toLocaleString()}) / NON_CLUB (₹
                  {Number(cfgNonClubBase || 0).toLocaleString()}) defaults.
                </p>
                <div className="sport-override-list">
                  {auction.sports.map((sp) => {
                    const ov = cfgSportOverrides[sp] || {
                      club: "",
                      nonClub: "",
                    };
                    return (
                      <div key={sp} className="sport-override-row">
                        <strong style={{ color: "#f4efe6" }}>{sp}</strong>
                        <input
                          type="number"
                          min={0}
                          step={500}
                          placeholder={`CLUB (₹${cfgClubBase})`}
                          value={ov.club}
                          onChange={(e) =>
                            setCfgSportOverrides((prev) => ({
                              ...prev,
                              [sp]: {
                                ...ov,
                                club: e.target.value,
                              },
                            }))
                          }
                          className="tabular-nums"
                        />
                        <input
                          type="number"
                          min={0}
                          step={500}
                          placeholder={`NON_CLUB (₹${cfgNonClubBase})`}
                          value={ov.nonClub}
                          onChange={(e) =>
                            setCfgSportOverrides((prev) => ({
                              ...prev,
                              [sp]: {
                                ...ov,
                                nonClub: e.target.value,
                              },
                            }))
                          }
                          className="tabular-nums"
                        />
                        <input
                          placeholder="Positions (comma-separated)"
                          value={cfgPositionsText[sp] ?? ""}
                          onChange={(e) =>
                            setCfgPositionsText((prev) => ({
                              ...prev,
                              [sp]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="submit" className="action-btn">
                  Save Pricing, Quotas &amp; Sport Rules
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: FRANCHISES, CAPTAINS & PER-SPORT PURSES */}
          {activeConfigTab === "franchises" && (
            <div className="config-form-stack">
              <div className="muted" style={{ fontSize: 13 }}>
                Each sport has its own isolated franchises, captains, purses,
                and squads. Buying a player in Cricket never affects Football
                purses or squads.
              </div>

              {/* Add Franchise Form */}
              <form onSubmit={handleAddFranchise} className="config-subblock">
                <div className="config-subblock-title">Add Franchise</div>
                <div className="config-grid">
                  <label className="config-field">
                    <span>Sport</span>
                    <select
                      value={newFrSport}
                      onChange={(e) => setNewFrSport(e.target.value)}
                    >
                      {auction.sports.map((sp) => (
                        <option key={sp} value={sp}>
                          {sp}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="config-field">
                    <span>Franchise Name</span>
                    <input
                      value={newFrName}
                      onChange={(e) => setNewFrName(e.target.value)}
                      placeholder="e.g. Rockfort Strikers"
                      required
                    />
                  </label>
                  <label className="config-field">
                    <span>Short Code</span>
                    <input
                      value={newFrCode}
                      onChange={(e) => setNewFrCode(e.target.value)}
                      placeholder="e.g. RS"
                      maxLength={4}
                    />
                  </label>
                  <label className="config-field">
                    <span>Captain Name</span>
                    <input
                      value={newFrCaptain}
                      onChange={(e) => setNewFrCaptain(e.target.value)}
                      placeholder="Captain Full Name"
                    />
                  </label>
                  <label className="config-field">
                    <span>Starting Purse (₹)</span>
                    <input
                      type="number"
                      min={0}
                      step={5000}
                      value={newFrPurse}
                      onChange={(e) => setNewFrPurse(e.target.value)}
                      className="tabular-nums"
                      required
                    />
                  </label>
                  <label className="config-field">
                    <span>Team Color</span>
                    <input
                      type="color"
                      value={newFrColor}
                      onChange={(e) => setNewFrColor(e.target.value)}
                      style={{ height: 38, padding: 2, cursor: "pointer" }}
                    />
                  </label>
                </div>
                <div style={{ marginTop: 10 }}>
                  <button type="submit" className="action-btn">
                    Add {newFrSport} Franchise
                  </button>
                </div>
              </form>

              {/* Sport Filter for Franchise List */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={
                    franchiseSportFilter === "ALL"
                      ? "action-btn"
                      : "operator-btn-secondary"
                  }
                  onClick={() => setFranchiseSportFilter("ALL")}
                >
                  All Sports ({franchises.length})
                </button>
                {auction.sports.map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    className={
                      franchiseSportFilter === sp
                        ? "action-btn"
                        : "operator-btn-secondary"
                    }
                    onClick={() => setFranchiseSportFilter(sp)}
                  >
                    {sp} (
                    {
                      franchises.filter(
                        (f) => f.sport.toLowerCase() === sp.toLowerCase()
                      ).length
                    }
                    )
                  </button>
                ))}
              </div>

              <ul className="list-clean">
                {visibleFranchises.map((f) => (
                  <li key={f.id} className="list-item-row">
                    {editingFrId === f.id ? (
                      <div className="config-grid" style={{ width: "100%" }}>
                        <label className="config-field">
                          <span>Sport</span>
                          <select
                            value={editFrSport}
                            onChange={(e) => setEditFrSport(e.target.value)}
                          >
                            {auction.sports.map((sp) => (
                              <option key={sp} value={sp}>
                                {sp}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="config-field">
                          <span>Name</span>
                          <input
                            value={editFrName}
                            onChange={(e) => setEditFrName(e.target.value)}
                          />
                        </label>
                        <label className="config-field">
                          <span>Code</span>
                          <input
                            value={editFrCode}
                            onChange={(e) => setEditFrCode(e.target.value)}
                            maxLength={4}
                          />
                        </label>
                        <label className="config-field">
                          <span>Captain</span>
                          <input
                            value={editFrCaptain}
                            onChange={(e) => setEditFrCaptain(e.target.value)}
                          />
                        </label>
                        <label className="config-field">
                          <span>Starting Purse (₹)</span>
                          <input
                            type="number"
                            min={f.spentPurse}
                            step={5000}
                            value={editFrPurse}
                            onChange={(e) => setEditFrPurse(e.target.value)}
                            className="tabular-nums"
                          />
                        </label>
                        <label className="config-field">
                          <span>Hotkey Slot #</span>
                          <input
                            type="number"
                            min={1}
                            max={8}
                            value={editFrSlot}
                            onChange={(e) => setEditFrSlot(e.target.value)}
                          />
                        </label>
                        <label className="config-field">
                          <span>Color</span>
                          <input
                            type="color"
                            value={editFrColor}
                            onChange={(e) => setEditFrColor(e.target.value)}
                            style={{ height: 38, padding: 2 }}
                          />
                        </label>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-end",
                            gap: 8,
                          }}
                        >
                          <button
                            type="button"
                            className="action-btn"
                            onClick={() => saveEditFranchise(f.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="operator-btn-secondary"
                            onClick={() => setEditingFrId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="franchise-admin-row">
                        <div style={{ minWidth: 220 }}>
                          <div className="franchise-name-row">
                            <span
                              className="team-swatch"
                              style={{ background: f.accentColor }}
                            />
                            <strong>
                              [{f.slotNumber}] {f.name} ({f.shortCode})
                            </strong>
                            <span className="muted" style={{ fontSize: 12 }}>
                              · {f.sport}
                            </span>
                          </div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                            Captain: <strong>{f.captainName || "TBD"}</strong>
                          </div>
                        </div>

                        <div className="franchise-admin-metrics tabular-nums">
                          <span>
                            Purse:{" "}
                            <strong>₹{f.startingPurse.toLocaleString()}</strong>
                          </span>
                          <span>
                            Spent:{" "}
                            <strong>₹{f.spentPurse.toLocaleString()}</strong>
                          </span>
                          <span>
                            Remaining:{" "}
                            <strong style={{ color: "#d4a038" }}>
                              ₹{f.remainingPurse.toLocaleString()}
                            </strong>
                          </span>
                          <span>
                            Squad:{" "}
                            <strong>
                              {f.squadCount}/{f.maxSquadSize}
                            </strong>
                          </span>
                          <span>
                            Max Bid:{" "}
                            <strong>₹{f.maxAllowedBid.toLocaleString()}</strong>
                          </span>
                        </div>

                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            className="operator-btn-secondary"
                            onClick={() => startEditFranchise(f)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="operator-btn-secondary"
                            disabled={f.squadCount > 0}
                            title={
                              f.squadCount > 0
                                ? "Cannot delete franchise with SOLD players"
                                : "Delete franchise"
                            }
                            onClick={() => deleteFranchise(f)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
                {visibleFranchises.length === 0 && (
                  <li className="muted">
                    No franchises configured for {franchiseSportFilter} yet. Add
                    one above.
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* TAB 3: ROUNDS & POOL MANAGEMENT */}
          {activeConfigTab === "rounds" && (
            <div className="config-form-stack">
              <form onSubmit={handleAddRound} className="config-subblock">
                <div className="config-subblock-title">Add Auction Round</div>
                <div className="config-grid">
                  <label className="config-field">
                    <span>Round Name</span>
                    <input
                      value={newRoundName}
                      onChange={(e) => setNewRoundName(e.target.value)}
                      placeholder="e.g. Round 4 · Supplementary"
                      required
                    />
                  </label>
                  <label className="config-field">
                    <span>Order # (optional)</span>
                    <input
                      type="number"
                      min={1}
                      value={newRoundNum}
                      onChange={(e) => setNewRoundNum(e.target.value)}
                      placeholder={String(rounds.length + 1)}
                    />
                  </label>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <button type="submit" className="action-btn">
                      Add Round
                    </button>
                  </div>
                </div>
              </form>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  fontSize: 13,
                }}
              >
                <span className="muted">
                  Unsold pool ({unsoldCount} players) target sport when moving:
                </span>
                <select
                  value={unsoldMoveSport}
                  onChange={(e) => setUnsoldMoveSport(e.target.value)}
                >
                  <option value="ALL">All Sports</option>
                  {auction.sports.map((sp) => (
                    <option key={sp} value={sp}>
                      {sp} Only
                    </option>
                  ))}
                </select>
              </div>

              <ul className="list-clean">
                {rounds.map((rd) => {
                  const playerCount = registrations.filter(
                    (r) => r.roundId === rd.id
                  ).length;
                  return (
                    <li key={rd.id} className="list-item-row">
                      {editingRoundId === rd.id ? (
                        <div className="config-grid" style={{ width: "100%" }}>
                          <label className="config-field">
                            <span>Round Name</span>
                            <input
                              value={editRoundName}
                              onChange={(e) => setEditRoundName(e.target.value)}
                            />
                          </label>
                          <label className="config-field">
                            <span>Order #</span>
                            <input
                              type="number"
                              min={1}
                              value={editRoundNum}
                              onChange={(e) => setEditRoundNum(e.target.value)}
                            />
                          </label>
                          <label className="config-field">
                            <span>Status</span>
                            <select
                              value={editRoundStatus}
                              onChange={(e) =>
                                setEditRoundStatus(
                                  e.target.value as AuctionRound["status"]
                                )
                              }
                            >
                              <option value="PENDING">PENDING</option>
                              <option value="ACTIVE">ACTIVE</option>
                              <option value="COMPLETED">COMPLETED</option>
                            </select>
                          </label>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-end",
                              gap: 8,
                            }}
                          >
                            <button
                              type="button"
                              className="action-btn"
                              onClick={() => saveEditRound(rd.id)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="operator-btn-secondary"
                              onClick={() => setEditingRoundId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="franchise-admin-row">
                          <div>
                            <strong style={{ color: "#f4efe6" }}>
                              #{rd.roundNumber} · {rd.name}
                            </strong>
                            <div className="muted tabular-nums" style={{ fontSize: 12 }}>
                              Status: <strong>{rd.status}</strong> ·{" "}
                              {playerCount} assigned players
                            </div>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            {rd.id !== auction.activeRoundId && (
                              <button
                                type="button"
                                className="action-btn"
                                style={{ padding: "5px 10px", fontSize: 12 }}
                                onClick={() =>
                                  handleAdminAction(
                                    `/api/auction/rounds/${rd.id}`,
                                    { status: "ACTIVE" },
                                    `Activated ${rd.name}.`,
                                    "PATCH"
                                  )
                                }
                              >
                                Activate
                              </button>
                            )}
                            <button
                              type="button"
                              className="operator-btn-secondary"
                              disabled={unsoldCount === 0}
                              onClick={() =>
                                handleAdminAction(
                                  `/api/auction/rounds/${rd.id}`,
                                  {
                                    moveUnsoldHere: true,
                                    sport:
                                      unsoldMoveSport === "ALL"
                                        ? undefined
                                        : unsoldMoveSport,
                                  },
                                  `Moved UNSOLD players into ${rd.name} for re-auction.`,
                                  "PATCH"
                                )
                              }
                            >
                              Move Unsold Here
                            </button>
                            <button
                              type="button"
                              className="operator-btn-secondary"
                              onClick={() => startEditRound(rd)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="operator-btn-secondary"
                              disabled={
                                rd.id === auction.activeRoundId ||
                                rounds.length <= 1
                              }
                              onClick={() =>
                                handleAdminAction(
                                  `/api/auction/rounds/${rd.id}`,
                                  {},
                                  `Deleted ${rd.name}.`,
                                  "DELETE"
                                )
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* 1 Registration Per Sport Form (Multiple Positions Within That Sport + Player Photo Upload) */}
      {!isRegistrationClosed && (
        <section className="panel">
          <h2 className="section-heading">
            Enroll in Auction (1 Registration Per Sport)
          </h2>
          <p className="muted">
            Each submission registers you for <strong>one sport</strong> with
            one or more playing positions and your broadcast portrait photo. To
            enroll in another sport, submit a separate registration.
          </p>

          <form
            onSubmit={handleEnrollSport}
            className="form-grid"
            style={{ marginTop: 12 }}
          >
            <select
              value={selectedSport}
              onChange={(e) => setSelectedSport(e.target.value)}
            >
              {auction.sports.map((sp) => (
                <option key={sp} value={sp}>
                  Sport: {sp}
                </option>
              ))}
            </select>

            <select
              value={yearLabel}
              onChange={(e) => setYearLabel(e.target.value)}
            >
              {YEARS.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>

            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            >
              {BRANCHES.map((br) => (
                <option key={br} value={br}>
                  {br}
                </option>
              ))}
            </select>

            <input
              placeholder="Past experience / key stats (optional)"
              value={statsSummary}
              onChange={(e) => setStatsSummary(e.target.value)}
            />

            {/* Player Photo Upload with Live Thumbnail Preview */}
            <div className="photo-upload-row">
              <div className="photo-preview-frame">
                {photoDataUrl ? (
                  <img
                    src={photoDataUrl}
                    alt={currentUser?.name || "Player preview"}
                    referrerPolicy="no-referrer"
                    className="photo-preview-img"
                  />
                ) : (
                  <div
                    className="photo-initials-fallback"
                    style={{ fontSize: 22 }}
                  >
                    {getInitials(currentUser?.name || "PL")}
                  </div>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 210 }}>
                <label
                  htmlFor="auction-player-photo"
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 700,
                    marginBottom: 6,
                    color: "#f4efe6",
                  }}
                >
                  Player Portrait Photo (Displayed on Live Auction Stage)
                </label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    id="auction-player-photo"
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    style={{ maxWidth: 280 }}
                  />
                  {photoDataUrl && (
                    <button
                      type="button"
                      className="operator-btn-secondary"
                      onClick={handleClearPhoto}
                    >
                      Remove Photo
                    </button>
                  )}
                </div>
                <div className="muted" style={{ marginTop: 4 }}>
                  {photoFileName
                    ? `Selected: ${photoFileName} (ready to upload)`
                    : "Optional JPG/PNG/WebP headshot. Styled initials are used if omitted."}
                </div>
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                <strong>Positions in {selectedSport}</strong> (select one or
                more):
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {availablePositions.map((pos) => {
                  const active = selectedPositions.includes(pos);
                  return (
                    <button
                      key={pos}
                      type="button"
                      className={
                        active ? "action-btn" : "operator-btn-secondary"
                      }
                      onClick={() => togglePosition(pos)}
                    >
                      {pos}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                gridColumn: "1 / -1",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div style={{ fontSize: 13 }} className="tabular-nums">
                Class for <strong>{selectedSport}</strong>:{" "}
                <strong style={{ color: "#d4a038" }}>
                  {currentPlayerClass}
                </strong>{" "}
                · Base Price:{" "}
                <strong>₹{previewBasePrice.toLocaleString()}</strong>
                {alreadyEnrolledInSport && (
                  <span style={{ color: "#d4a038", marginLeft: 10 }}>
                    (Already enrolled in {selectedSport})
                  </span>
                )}
              </div>

              <button
                type="submit"
                className="action-btn"
                disabled={alreadyEnrolledInSport}
              >
                {alreadyEnrolledInSport
                  ? `Already Enrolled in ${selectedSport}`
                  : `Enroll in ${selectedSport}`}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Per-Sport Enrolled Roster + Sports Secretary Search, Sort & Full Inline Edit */}
      <section className="panel">
        <h2 className="section-heading">
          {isRegistrationClosed && isSecretary
            ? "Post-Deadline Enrolled Roster (By Sport)"
            : "Enrolled Players by Sport"}
        </h2>

        <div
          style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}
        >
          {auction.sports.map((sp) => (
            <button
              key={sp}
              type="button"
              className={
                rosterSportTab === sp ? "action-btn" : "operator-btn-secondary"
              }
              onClick={() => setRosterSportTab(sp)}
            >
              {sp} ({registrations.filter((r) => r.sport === sp).length})
            </button>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginTop: 12,
          }}
        >
          <input
            placeholder="Search player, roll no, year, branch, position, tier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ minWidth: 260 }}
          />
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
            }}
          >
            Sort by:
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "year" | "branch" | "position")
              }
            >
              <option value="year">Year</option>
              <option value="branch">Branch</option>
              <option value="position">Position</option>
            </select>
          </label>
        </div>

        <ul className="list-clean" style={{ marginTop: 14 }}>
          {filteredSportRoster.map((reg) => {
            const roundLabel =
              rounds.find((rd) => rd.id === reg.roundId)?.name ||
              `Round ${reg.roundId}`;
            return (
              <li key={reg.id} className="list-item-row">
                {editingId === reg.id ? (
                  <div className="config-grid" style={{ width: "100%" }}>
                    <label className="config-field">
                      <span>Player Name</span>
                      <input
                        value={editPlayerName}
                        onChange={(e) => setEditPlayerName(e.target.value)}
                      />
                    </label>
                    <label className="config-field">
                      <span>Roll Number</span>
                      <input
                        value={editRollNumber}
                        onChange={(e) => setEditRollNumber(e.target.value)}
                      />
                    </label>
                    <label className="config-field">
                      <span>Year</span>
                      <input
                        value={editYear}
                        onChange={(e) => setEditYear(e.target.value)}
                      />
                    </label>
                    <label className="config-field">
                      <span>Branch</span>
                      <input
                        value={editBranch}
                        onChange={(e) => setEditBranch(e.target.value)}
                      />
                    </label>
                    <label className="config-field">
                      <span>Positions (comma-separated)</span>
                      <input
                        value={editPositions}
                        onChange={(e) => setEditPositions(e.target.value)}
                      />
                    </label>
                    <label className="config-field">
                      <span>Class</span>
                      <select
                        value={editPlayerClass}
                        onChange={(e) => {
                          const nextClass = e.target.value as PlayerClass;
                          setEditPlayerClass(nextClass);
                          setEditBasePrice(
                            String(
                              getEffectiveSportBasePrice(
                                auction,
                                reg.sport,
                                nextClass
                              )
                            )
                          );
                        }}
                      >
                        <option value="CLUB">CLUB</option>
                        <option value="NON_CLUB">NON_CLUB</option>
                      </select>
                    </label>
                    <label className="config-field">
                      <span>Base Price (₹)</span>
                      <input
                        type="number"
                        min={0}
                        step={500}
                        value={editBasePrice}
                        onChange={(e) => setEditBasePrice(e.target.value)}
                        className="tabular-nums"
                      />
                    </label>
                    <label className="config-field">
                      <span>Tier</span>
                      <select
                        value={editTier}
                        onChange={(e) => setEditTier(e.target.value)}
                      >
                        {(auction.playerTiers || []).map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="config-field">
                      <span>Assigned Round</span>
                      <select
                        value={editRoundId}
                        onChange={(e) => setEditRoundId(Number(e.target.value))}
                      >
                        {rounds.map((rd) => (
                          <option key={rd.id} value={rd.id}>
                            #{rd.roundNumber} {rd.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="config-field">
                      <span>Status</span>
                      <select
                        value={editStatus}
                        onChange={(e) =>
                          setEditStatus(e.target.value as AuctionPlayerStatus)
                        }
                      >
                        <option value="REGISTERED">REGISTERED</option>
                        <option value="ELIGIBLE">ELIGIBLE</option>
                        <option value="IN_AUCTION">IN_AUCTION</option>
                        <option value="INELIGIBLE">INELIGIBLE</option>
                        <option value="UNSOLD">UNSOLD</option>
                        <option value="RE_AUCTIONED">RE_AUCTIONED</option>
                        <option value="SOLD">SOLD</option>
                      </select>
                    </label>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-end",
                        gap: 8,
                      }}
                    >
                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => saveEditRow(reg.id)}
                      >
                        Save Fix
                      </button>
                      <button
                        type="button"
                        className="operator-btn-secondary"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      width: "100%",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        minWidth: 0,
                      }}
                    >
                      <RosterThumbnail
                        photoUrl={reg.photoUrl}
                        name={reg.playerName}
                      />
                      <div>
                        <strong style={{ color: "#d4a038" }}>
                          {reg.playerName}
                        </strong>{" "}
                        <span className="muted">
                          · {reg.rollNumber} · {reg.yearLabel} · {reg.branch} ·{" "}
                          {reg.sport}
                        </span>
                        <div
                          style={{ fontSize: 13, marginTop: 2 }}
                          className="tabular-nums"
                        >
                          Positions:{" "}
                          <strong>{reg.positions.join(", ")}</strong> · Class:{" "}
                          <strong>{reg.playerClass}</strong> · Base:{" "}
                          <strong>₹{reg.basePrice.toLocaleString()}</strong> ·{" "}
                          Tier: <strong>{reg.tier}</strong> · {roundLabel} ·{" "}
                          <span>{reg.status}</span>
                        </div>
                      </div>
                    </div>

                    {isSecretary && (
                      <button
                        type="button"
                        className="operator-btn-secondary"
                        onClick={() => startEditRow(reg)}
                      >
                        Edit Entry
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {filteredSportRoster.length === 0 && (
            <li className="muted">No enrolled players match this filter.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
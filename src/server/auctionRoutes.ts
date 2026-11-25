import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  auctionBidEvents,
  auctionFranchises,
  auctionIdempotencyKeys,
  auctionOperators,
  auctionRegistrations,
  auctionRounds,
  auctions,
  clubMemberships,
  playerPhotos,
  sportsClubs,
  users,
} from "../db/schema.js";
import {
  auctionState,
  buildLiveAuctionDelta,
  buildLiveAuctionSnapshot,
  computeFranchiseSummaries,
  DEFAULT_POSITIONS_BY_SPORT,
  demoStore,
  getEffectiveBasePrice,
  sanitizeAuctionDeltaForViewer,
  sanitizeAuctionSnapshotForViewer,
} from "./demoStore.js";
import { requireAuth, type AuthUserRecord } from "./auth.js";
import {
  detectImageMimeFromBuffer,
  sendServerError,
} from "./security.js";
import type {
  AuctionRegistration,
  AuctionStatus,
  BidEvent,
} from "../types/auction.js";

export interface AuctionRouteDeps {
  useDb: () => boolean;
  sseClients: Set<Response>;
  persistPhotoFromDataUrl: (
    dataUrl: string,
    uploadedByUserId: number
  ) => Promise<string | null>;
  broadcastNavUpdate?: () => Promise<void>;
}

const VALID_AUCTION_STATUSES: AuctionStatus[] = [
  "DRAFT",
  "REGISTRATION_OPEN",
  "FROZEN",
  "LIVE",
  "COMPLETED",
  "PUBLISHED",
];

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getIdempotencyKey(req: Request): string | null {
  const hdr = req.headers["x-idempotency-key"];
  if (typeof hdr === "string" && hdr.trim().length > 0 && hdr.trim().length <= 128) {
    return hdr.trim();
  }
  if (
    req.body &&
    typeof req.body.idempotencyKey === "string" &&
    req.body.idempotencyKey.trim().length > 0 &&
    req.body.idempotencyKey.trim().length <= 128
  ) {
    return req.body.idempotencyKey.trim();
  }
  return null;
}

function isAuctionAdmin(actor: AuthUserRecord | null | undefined): boolean {
  return Boolean(
    actor &&
      (actor.role === "SPORTS_SECRETARY" || actor.role === "FACULTY_ADVISOR")
  );
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function hydrateAuctionFromDb(useDb: () => boolean) {
  if (!useDb() || !db) return;
  try {
    const [cfgRow] = await db.select().from(auctions).limit(1);
    if (!cfgRow) return;

    const roundRows = await db
      .select()
      .from(auctionRounds)
      .where(eq(auctionRounds.auctionId, cfgRow.id))
      .orderBy(asc(auctionRounds.roundNumber), asc(auctionRounds.id));

    const franchiseRows = await db
      .select()
      .from(auctionFranchises)
      .where(eq(auctionFranchises.auctionId, cfgRow.id))
      .orderBy(asc(auctionFranchises.sport), asc(auctionFranchises.slotNumber));

    const regRows = await db
      .select()
      .from(auctionRegistrations)
      .where(eq(auctionRegistrations.auctionId, cfgRow.id))
      .orderBy(asc(auctionRegistrations.id));

    const bidRows = await db
      .select()
      .from(auctionBidEvents)
      .where(eq(auctionBidEvents.auctionId, cfgRow.id))
      .orderBy(desc(auctionBidEvents.id))
      .limit(120);

    const parsedSports = safeJsonParse<string[]>(cfgRow.sportsJson, [
      "Cricket",
      "Football",
      "Volleyball",
      "Badminton",
      "Kabaddi",
    ]);

    const deadlineIso = cfgRow.registrationDeadlineAt
      ? cfgRow.registrationDeadlineAt.toISOString()
      : cfgRow.registrationDeadline || "";

    const activeRoundFallback =
      roundRows.find((r) => r.id === cfgRow.activeRoundId)?.id ??
      roundRows.find((r) => r.status === "ACTIVE")?.id ??
      roundRows[0]?.id ??
      1;
    const activePlayerFallback =
      regRows.find((r) => r.id === cfgRow.currentPlayerId)?.id ??
      regRows.find((r) => r.status === "IN_AUCTION")?.id ??
      null;
    const activePlayerRow = activePlayerFallback
      ? regRows.find((r) => r.id === activePlayerFallback)
      : null;

    auctionState.auction = {
      id: cfgRow.id,
      name: cfgRow.name,
      seasonYear: cfgRow.seasonYear,
      sports: parsedSports,
      status: cfgRow.status as AuctionStatus,
      registrationDeadline: deadlineIso,
      registrationDeadlineAt: cfgRow.registrationDeadlineAt
        ? cfgRow.registrationDeadlineAt.toISOString()
        : null,
      clubBasePrice: cfgRow.clubBasePrice,
      nonClubBasePrice: cfgRow.nonClubBasePrice,
      sportBasePrices: safeJsonParse(cfgRow.sportBasePricesJson, {}),
      defaultIncrement: cfgRow.defaultIncrement,
      jumpIncrement: cfgRow.jumpIncrement,
      minSquadSize: cfgRow.minSquadSize,
      maxSquadSize: cfgRow.maxSquadSize,
      minClubPlayers: cfgRow.minClubPlayers,
      minNonClubPlayers: cfgRow.minNonClubPlayers,
      playerTiers: safeJsonParse(cfgRow.playerTiersJson, [
        "MARQUEE",
        "TIER_1",
        "TIER_2",
        "UNCAPPED",
      ]),
      positionsBySport: safeJsonParse(cfgRow.positionsBySportJson, {
        ...DEFAULT_POSITIONS_BY_SPORT,
      }),
      activeRoundId: activeRoundFallback,
      activeSport:
        cfgRow.activeSport ||
        activePlayerRow?.sport ||
        parsedSports[0] ||
        "Cricket",
      currentPlayerId: activePlayerFallback,
      projectorMode:
        (cfgRow.projectorMode as
          | "STAGE"
          | "SOLD"
          | "UNSOLD"
          | "STANDINGS"
          | "PAUSED") || "STAGE",
      version: cfgRow.version || 1,
      lastUpdatedAt: cfgRow.updatedAt
        ? cfgRow.updatedAt.toISOString()
        : new Date().toISOString(),
    };

    if (roundRows.length > 0) {
      auctionState.rounds = roundRows.map((r) => ({
        id: r.id,
        auctionId: r.auctionId,
        roundNumber: r.roundNumber,
        name: r.name,
        status: r.status as "PENDING" | "ACTIVE" | "COMPLETED",
      }));
    }

    if (franchiseRows.length > 0) {
      auctionState.franchises = franchiseRows.map((f) => ({
        id: f.id,
        auctionId: f.auctionId,
        sport: f.sport,
        slotNumber: f.slotNumber,
        name: f.name,
        shortCode: f.shortCode,
        accentColor: f.accentColor,
        captainName: f.captainName,
        captainUserId: f.captainUserId ?? null,
        startingPurse: f.startingPurse,
        minSquadSize: f.minSquadSize,
        maxSquadSize: f.maxSquadSize,
        minClubPlayers: f.minClubPlayers,
        minNonClubPlayers: f.minNonClubPlayers,
      }));
    }

    auctionState.registrations = regRows.map((r) => ({
      id: r.id,
      auctionId: r.auctionId,
      userId: r.userId,
      playerName: r.playerName,
      rollNumber: r.rollNumber,
      yearLabel: r.yearLabel,
      branch: r.branch,
      sport: r.sport,
      positions: safeJsonParse<string[]>(r.positionsJson, []),
      playerClass: r.playerClass as "CLUB" | "NON_CLUB",
      basePrice: r.basePrice,
      tier: r.tier,
      roundId: r.roundId,
      status: r.status as AuctionRegistration["status"],
      soldToFranchiseId: r.soldToFranchiseId ?? null,
      soldPrice: r.soldPrice ?? null,
      statsSummary: r.statsSummary,
      photoUrl: r.photoUrl ?? null,
    }));

    auctionState.bidHistory = bidRows
      .filter((b) => !b.isUndone)
      .map((b) => ({
        id: b.eventKey,
        auctionId: b.auctionId,
        roundId: b.roundId || auctionState.auction.activeRoundId || 1,
        playerId: b.playerId,
        playerName: b.playerName,
        franchiseId: b.franchiseId || 0,
        franchiseName: b.franchiseName || "",
        amount: b.amount,
        kind: b.kind as BidEvent["kind"],
        timestamp: b.createdAt.toISOString(),
      }));
  } catch (err) {
    console.error("Failed to hydrate auction from PostgreSQL:", err);
  }
}

export function registerAuctionRoutes(app: Express, deps: AuctionRouteDeps) {
  const { useDb, sseClients, persistPhotoFromDataUrl, broadcastNavUpdate } = deps;
  const sseClientPrivileged = new WeakMap<Response, boolean>();

  // Event-scoped AUCTION_OPERATOR check (admins override; operators must be assigned to this auctionId)
  async function isAssignedAuctionOperator(
    actor: AuthUserRecord | null | undefined,
    auctionId = auctionState.auction.id
  ): Promise<boolean> {
    if (!actor) return false;
    if (isAuctionAdmin(actor)) return true;
    if (useDb() && db) {
      const [row] = await db
        .select({ id: auctionOperators.id })
        .from(auctionOperators)
        .where(
          and(
            eq(auctionOperators.auctionId, auctionId),
            eq(auctionOperators.userId, actor.id)
          )
        );
      return Boolean(row);
    }
    return demoStore.auctionOperators.some(
      (op) => op.auctionId === auctionId && op.userId === actor.id
    );
  }

  // Persisted idempotency key lookup & recording (PostgreSQL table with expiry, or demoStore fallback)
  async function lookupIdempotency(
    key: string
  ): Promise<{ status: number; body: unknown } | null> {
    const now = Date.now();
    if (useDb() && db) {
      const [row] = await db
        .select()
        .from(auctionIdempotencyKeys)
        .where(eq(auctionIdempotencyKeys.key, key));
      if (!row) return null;
      if (row.expiresAt.getTime() <= now) {
        await db
          .delete(auctionIdempotencyKeys)
          .where(eq(auctionIdempotencyKeys.key, key))
          .catch(() => {});
        return null;
      }
      return {
        status: row.statusCode,
        body: safeJsonParse(row.responseJson, {}),
      };
    }
    const cached = demoStore.auctionIdempotencyKeys.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= now) {
      demoStore.auctionIdempotencyKeys.delete(key);
      return null;
    }
    return { status: cached.statusCode, body: cached.body };
  }

  async function recordIdempotency(
    key: string,
    statusCode: number,
    body: unknown
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);
    if (useDb() && db) {
      try {
        await db
          .insert(auctionIdempotencyKeys)
          .values({
            key,
            auctionId: auctionState.auction.id,
            statusCode,
            responseJson: JSON.stringify(body),
            expiresAt,
          })
          .onConflictDoNothing();
        // Opportunistic expired-key cleanup
        await db
          .delete(auctionIdempotencyKeys)
          .where(lt(auctionIdempotencyKeys.expiresAt, new Date()));
      } catch {
        // non-fatal
      }
      return;
    }
    if (demoStore.auctionIdempotencyKeys.size >= 1000) {
      const now = Date.now();
      for (const [k, v] of demoStore.auctionIdempotencyKeys.entries()) {
        if (v.expiresAt <= now || demoStore.auctionIdempotencyKeys.size >= 1000) {
          demoStore.auctionIdempotencyKeys.delete(k);
        }
      }
    }
    demoStore.auctionIdempotencyKeys.set(key, {
      statusCode,
      body,
      expiresAt: expiresAt.getTime(),
    });
  }

  function broadcastDelta(opts?: {
    updatedRegistration?: AuctionRegistration | null;
    removedRegistrationId?: number | null;
    latestBidEvent?: BidEvent | null;
    includeRounds?: boolean;
  }) {
    const rawDelta = buildLiveAuctionDelta(opts);
    const publicPayload = `event: delta\ndata: ${JSON.stringify(
      sanitizeAuctionDeltaForViewer(rawDelta, false)
    )}\n\n`;
    const privilegedPayload = `event: delta\ndata: ${JSON.stringify(
      sanitizeAuctionDeltaForViewer(rawDelta, true)
    )}\n\n`;

    for (const client of sseClients) {
      try {
        const isPriv = sseClientPrivileged.get(client) === true;
        client.write(isPriv ? privilegedPayload : publicPayload);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  function broadcastFullSnapshot() {
    const rawSnap = buildLiveAuctionSnapshot();
    const publicPayload = `event: snapshot\ndata: ${JSON.stringify(
      sanitizeAuctionSnapshotForViewer(rawSnap, false)
    )}\n\n`;
    const privilegedPayload = `event: snapshot\ndata: ${JSON.stringify(
      sanitizeAuctionSnapshotForViewer(rawSnap, true)
    )}\n\n`;

    for (const client of sseClients) {
      try {
        const isPriv = sseClientPrivileged.get(client) === true;
        client.write(isPriv ? privilegedPayload : publicPayload);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  function checkExpectedVersion(
    req: Request,
    res: Response,
    required = true
  ): boolean {
    const raw = req.body?.expectedVersion;
    if (raw === undefined || raw === null || raw === "") {
      if (required) {
        res.status(400).json({
          error: "expectedVersion is required for auction state mutations",
          currentVersion: auctionState.auction.version,
        });
        return false;
      }
      return true;
    }
    const expected = Number(raw);
    if (!Number.isInteger(expected)) {
      res.status(400).json({
        error: "expectedVersion must be an integer",
        currentVersion: auctionState.auction.version,
      });
      return false;
    }
    if (expected !== auctionState.auction.version) {
      res.status(409).json({
        error: "Auction state was updated by another operator. Please retry.",
        currentVersion: auctionState.auction.version,
      });
      return false;
    }
    return true;
  }

  // GET /api/auction (registration & management overview, derives inductedSports from verified session)
  app.get("/api/auction", async (req, res) => {
    try {
      const actor = req.authUser || null;
      const isPriv = await isAssignedAuctionOperator(actor);
      const snap = sanitizeAuctionSnapshotForViewer(
        buildLiveAuctionSnapshot(),
        isPriv,
        actor?.id ?? null
      );
      let inductedSports: string[] = [];
      const actorId = actor?.id ?? null;

      if (actorId) {
        if (useDb() && db) {
          const rows = await db
            .select({ clubName: sportsClubs.name })
            .from(clubMemberships)
            .innerJoin(sportsClubs, eq(clubMemberships.clubId, sportsClubs.id))
            .where(
              and(
                eq(clubMemberships.userId, actorId),
                eq(clubMemberships.status, "INDUCTED")
              )
            );
          inductedSports = rows.map((r) => r.clubName);
        } else {
          const inductedClubIds = new Set(
            demoStore.memberships
              .filter((m) => m.userId === actorId && m.status === "INDUCTED")
              .map((m) => m.clubId)
          );
          inductedSports = demoStore.clubs
            .filter((c) => inductedClubIds.has(c.id))
            .map((c) => c.name);
        }
      }

      res.json({
        ...snap,
        inductedSports,
        canOperateAuction: isPriv,
      });
    } catch (err) {
      sendServerError(res, "GET /api/auction", err);
    }
  });

  // GET live snapshot — strips rollNumber and userId for public/spectator callers
  app.get("/api/auction/live-state", async (req, res) => {
    try {
      const isPriv = await isAssignedAuctionOperator(req.authUser);
      const snap = sanitizeAuctionSnapshotForViewer(
        buildLiveAuctionSnapshot(),
        isPriv,
        req.authUser?.id ?? null
      );
      res.json({ ...snap, canOperateAuction: isPriv });
    } catch (err) {
      sendServerError(res, "GET /api/auction/live-state", err);
    }
  });

  // SSE stream: sends sanitized snapshot on connect, then compact deltas on mutations
  app.get("/api/auction/stream", async (req, res) => {
    const isPriv = await isAssignedAuctionOperator(req.authUser);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const snap = sanitizeAuctionSnapshotForViewer(
      buildLiveAuctionSnapshot(),
      isPriv,
      req.authUser?.id ?? null
    );
    sseClientPrivileged.set(res, isPriv);
    res.write(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`);
    sseClients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 20_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // PATCH auction config (Sports Secretary / Faculty Advisor; Operator can update stage controls)
  app.patch("/api/auction/config", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser!;
      const body = req.body || {};

      const isAdminOnlyEdit =
        body.name !== undefined ||
        body.seasonYear !== undefined ||
        body.sports !== undefined ||
        body.registrationDeadline !== undefined ||
        body.registrationDeadlineAt !== undefined ||
        body.clubBasePrice !== undefined ||
        body.nonClubBasePrice !== undefined ||
        body.sportBasePrices !== undefined ||
        body.minSquadSize !== undefined ||
        body.maxSquadSize !== undefined ||
        body.minClubPlayers !== undefined ||
        body.minNonClubPlayers !== undefined ||
        body.playerTiers !== undefined ||
        body.positionsBySport !== undefined;

      if (isAdminOnlyEdit && !isAuctionAdmin(actor)) {
        return res.status(403).json({
          error:
            "Only Sports Secretary or Faculty Advisor can modify auction rules and base prices",
        });
      }
      if (!(await isAssignedAuctionOperator(actor))) {
        return res.status(403).json({
          error:
            "Only an assigned Auction Operator, Sports Secretary, or Faculty Advisor can update auction configuration",
        });
      }

      const nextCfg = { ...auctionState.auction };

      if (typeof body.name === "string" && body.name.trim()) {
        nextCfg.name = body.name.trim();
      }
      if (body.seasonYear !== undefined) {
        const yr = Number(body.seasonYear);
        if (Number.isInteger(yr) && yr >= 2020 && yr <= 2100) {
          nextCfg.seasonYear = yr;
        }
      }
      if (Array.isArray(body.sports) && body.sports.length > 0) {
        nextCfg.sports = body.sports
          .map((s: unknown) => String(s).trim())
          .filter(Boolean);
      }
      if (
        typeof body.status === "string" &&
        VALID_AUCTION_STATUSES.includes(body.status as AuctionStatus)
      ) {
        nextCfg.status = body.status as AuctionStatus;
      }
      if (body.registrationDeadlineAt !== undefined || body.registrationDeadline !== undefined) {
        const rawDl = String(
          body.registrationDeadlineAt ?? body.registrationDeadline ?? ""
        ).trim();
        const parsed = rawDl ? new Date(rawDl) : null;
        if (parsed && !Number.isNaN(parsed.getTime())) {
          nextCfg.registrationDeadline = parsed.toISOString();
          nextCfg.registrationDeadlineAt = parsed.toISOString();
        } else if (rawDl === "") {
          nextCfg.registrationDeadline = "";
          nextCfg.registrationDeadlineAt = null;
        } else {
          return res.status(400).json({
            error: "registrationDeadline must be a valid ISO timestamp",
          });
        }
      }
      if (body.clubBasePrice !== undefined) {
        const v = Number(body.clubBasePrice);
        if (!Number.isFinite(v) || v < 0) {
          return res.status(400).json({ error: "Invalid clubBasePrice" });
        }
        nextCfg.clubBasePrice = Math.round(v);
      }
      if (body.nonClubBasePrice !== undefined) {
        const v = Number(body.nonClubBasePrice);
        if (!Number.isFinite(v) || v < 0) {
          return res.status(400).json({ error: "Invalid nonClubBasePrice" });
        }
        nextCfg.nonClubBasePrice = Math.round(v);
      }
      if (body.sportBasePrices && typeof body.sportBasePrices === "object") {
        nextCfg.sportBasePrices = body.sportBasePrices;
      }
      if (body.defaultIncrement !== undefined) {
        const v = Number(body.defaultIncrement);
        if (!Number.isFinite(v) || v <= 0) {
          return res.status(400).json({ error: "defaultIncrement must be > 0" });
        }
        nextCfg.defaultIncrement = Math.round(v);
      }
      if (body.jumpIncrement !== undefined) {
        const v = Number(body.jumpIncrement);
        if (!Number.isFinite(v) || v <= 0) {
          return res.status(400).json({ error: "jumpIncrement must be > 0" });
        }
        nextCfg.jumpIncrement = Math.round(v);
      }
      if (body.minSquadSize !== undefined) {
        const v = Number(body.minSquadSize);
        if (Number.isInteger(v) && v >= 1) nextCfg.minSquadSize = v;
      }
      if (body.maxSquadSize !== undefined) {
        const v = Number(body.maxSquadSize);
        if (Number.isInteger(v) && v >= nextCfg.minSquadSize) {
          nextCfg.maxSquadSize = v;
        }
      }
      if (body.minClubPlayers !== undefined) {
        const v = Number(body.minClubPlayers);
        if (Number.isInteger(v) && v >= 0) nextCfg.minClubPlayers = v;
      }
      if (body.minNonClubPlayers !== undefined) {
        const v = Number(body.minNonClubPlayers);
        if (Number.isInteger(v) && v >= 0) nextCfg.minNonClubPlayers = v;
      }
      if (Array.isArray(body.playerTiers) && body.playerTiers.length > 0) {
        nextCfg.playerTiers = body.playerTiers
          .map((t: unknown) => String(t).trim())
          .filter(Boolean);
      }
      if (body.positionsBySport && typeof body.positionsBySport === "object") {
        nextCfg.positionsBySport = body.positionsBySport;
      }
      if (body.activeRoundId !== undefined) {
        nextCfg.activeRoundId = Number(body.activeRoundId) || null;
      }
      if (typeof body.activeSport === "string" && body.activeSport.trim()) {
        nextCfg.activeSport = body.activeSport.trim();
      }
      if (body.currentPlayerId !== undefined) {
        nextCfg.currentPlayerId =
          body.currentPlayerId === null ? null : Number(body.currentPlayerId);
      }
      if (
        typeof body.projectorMode === "string" &&
        ["STAGE", "SOLD", "UNSOLD", "STANDINGS", "PAUSED"].includes(
          body.projectorMode
        )
      ) {
        nextCfg.projectorMode = body.projectorMode as
          | "STAGE"
          | "SOLD"
          | "UNSOLD"
          | "STANDINGS"
          | "PAUSED";
      }

      const nextVersion = (nextCfg.version || 1) + 1;
      const updatedIso = new Date().toISOString();
      nextCfg.version = nextVersion;
      nextCfg.lastUpdatedAt = updatedIso;

      const pricingChanged =
        body.clubBasePrice !== undefined ||
        body.nonClubBasePrice !== undefined ||
        body.sportBasePrices !== undefined;

      // DB-first commit
      if (useDb() && db) {
        await db.transaction(async (tx) => {
          await tx
            .update(auctions)
            .set({
              name: nextCfg.name,
              seasonYear: nextCfg.seasonYear,
              sportsJson: JSON.stringify(nextCfg.sports),
              status: nextCfg.status,
              registrationDeadline: nextCfg.registrationDeadline,
              registrationDeadlineAt: nextCfg.registrationDeadlineAt
                ? new Date(nextCfg.registrationDeadlineAt)
                : null,
              clubBasePrice: nextCfg.clubBasePrice,
              nonClubBasePrice: nextCfg.nonClubBasePrice,
              sportBasePricesJson: JSON.stringify(nextCfg.sportBasePrices),
              defaultIncrement: nextCfg.defaultIncrement,
              jumpIncrement: nextCfg.jumpIncrement,
              minSquadSize: nextCfg.minSquadSize,
              maxSquadSize: nextCfg.maxSquadSize,
              minClubPlayers: nextCfg.minClubPlayers,
              minNonClubPlayers: nextCfg.minNonClubPlayers,
              playerTiersJson: JSON.stringify(nextCfg.playerTiers),
              positionsBySportJson: JSON.stringify(nextCfg.positionsBySport),
              activeRoundId: nextCfg.activeRoundId,
              activeSport: nextCfg.activeSport,
              currentPlayerId: nextCfg.currentPlayerId,
              projectorMode: nextCfg.projectorMode,
              version: nextVersion,
              updatedAt: new Date(updatedIso),
            })
            .where(eq(auctions.id, nextCfg.id));

          if (pricingChanged) {
            for (const reg of auctionState.registrations) {
              if (reg.status === "REGISTERED" || reg.status === "ELIGIBLE") {
                const newBase = getEffectiveBasePrice(
                  nextCfg,
                  reg.sport,
                  reg.playerClass
                );
                await tx
                  .update(auctionRegistrations)
                  .set({ basePrice: newBase })
                  .where(eq(auctionRegistrations.id, reg.id));
              }
            }
          }
        });
      }

      auctionState.auction = nextCfg;
      if (pricingChanged) {
        for (const reg of auctionState.registrations) {
          if (reg.status === "REGISTERED" || reg.status === "ELIGIBLE") {
            reg.basePrice = getEffectiveBasePrice(
              nextCfg,
              reg.sport,
              reg.playerClass
            );
          }
        }
        broadcastFullSnapshot();
      } else {
        broadcastDelta();
      }
      res.json(buildLiveAuctionSnapshot());
    } catch (err) {
      sendServerError(res, "PATCH /api/auction/config", err);
    }
  });

  // POST /api/auction/status (Sports Secretary / Faculty Advisor lifecycle transition)
  app.post("/api/auction/status", requireAuth, async (req, res) => {
    try {
      if (!isAuctionAdmin(req.authUser)) {
        return res.status(403).json({
          error: "Only Sports Secretary or Faculty Advisor can change auction status",
        });
      }
      const nextStatus = String(req.body?.status || "").toUpperCase() as AuctionStatus;
      if (!VALID_AUCTION_STATUSES.includes(nextStatus)) {
        return res.status(400).json({ error: "Invalid auction status" });
      }
      const nextVersion = (auctionState.auction.version || 1) + 1;
      const nowIso = new Date().toISOString();

      if (useDb() && db) {
        await db.transaction(async (tx) => {
          await tx
            .update(auctions)
            .set({
              status: nextStatus,
              version: nextVersion,
              updatedAt: new Date(nowIso),
            })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      auctionState.auction.status = nextStatus;
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = nowIso;
      broadcastDelta();
      if (broadcastNavUpdate) await broadcastNavUpdate();
      res.json({
        ...buildLiveAuctionSnapshot(),
        message: `Auction status changed to ${nextStatus}`,
      });
    } catch (err) {
      sendServerError(res, "POST /api/auction/status", err);
    }
  });

  // POST /api/auction/round (switch active round)
  app.post("/api/auction/round", requireAuth, async (req, res) => {
    try {
      if (!(await isAssignedAuctionOperator(req.authUser))) {
        return res.status(403).json({ error: "Assigned Auction Operator permission required" });
      }
      const roundId = Number(req.body?.roundId);
      const target = auctionState.rounds.find((r) => r.id === roundId);
      if (!target) return res.status(404).json({ error: "Round not found" });

      const nextVersion = (auctionState.auction.version || 1) + 1;
      const nowIso = new Date().toISOString();

      if (useDb() && db) {
        await db.transaction(async (tx) => {
          await tx
            .update(auctionRounds)
            .set({ status: "ACTIVE" })
            .where(eq(auctionRounds.id, roundId));
          await tx
            .update(auctions)
            .set({
              activeRoundId: roundId,
              version: nextVersion,
              updatedAt: new Date(nowIso),
            })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      target.status = "ACTIVE";
      auctionState.auction.activeRoundId = roundId;
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = nowIso;
      broadcastDelta({ includeRounds: true });
      res.json({
        ...buildLiveAuctionSnapshot(),
        message: `Switched active round to ${target.name}`,
      });
    } catch (err) {
      sendServerError(res, "POST /api/auction/round", err);
    }
  });

  // POST /api/auction/context (switch activeSport, activeRoundId, or pull specific currentPlayerId)
  app.post("/api/auction/context", requireAuth, async (req, res) => {
    try {
      if (!(await isAssignedAuctionOperator(req.authUser))) {
        return res.status(403).json({ error: "Assigned Auction Operator permission required" });
      }
      if (!checkExpectedVersion(req, res, false)) return;

      const body = req.body || {};
      let nextSport = auctionState.auction.activeSport;
      let nextRoundId = auctionState.auction.activeRoundId;
      let nextPlayerId = auctionState.auction.currentPlayerId;
      let pulledPlayer: AuctionRegistration | null = null;
      let prevOnStage: AuctionRegistration | null = null;

      if (typeof body.activeSport === "string" && body.activeSport.trim()) {
        nextSport = body.activeSport.trim();
        const curr = auctionState.registrations.find(
          (r) => r.id === nextPlayerId
        );
        if (curr && curr.sport.toLowerCase() !== nextSport.toLowerCase()) {
          nextPlayerId = null;
        }
      }
      if (body.activeRoundId !== undefined && Number(body.activeRoundId) > 0) {
        nextRoundId = Number(body.activeRoundId);
      }
      if (body.currentPlayerId !== undefined && body.currentPlayerId !== null) {
        const pid = Number(body.currentPlayerId);
        const found = auctionState.registrations.find((r) => r.id === pid);
        if (!found) {
          return res.status(404).json({ error: "Selected player not found" });
        }
        if (found.status === "SOLD") {
          return res.status(400).json({ error: "Player is already SOLD" });
        }
        pulledPlayer = found;
        nextSport = found.sport;
        nextRoundId = found.roundId;
        nextPlayerId = found.id;
        prevOnStage =
          auctionState.registrations.find(
            (r) => r.status === "IN_AUCTION" && r.id !== found.id
          ) || null;
      }

      const nextVersion = (auctionState.auction.version || 1) + 1;
      const nowIso = new Date().toISOString();

      if (useDb() && db) {
        await db.transaction(async (tx) => {
          if (prevOnStage) {
            await tx
              .update(auctionRegistrations)
              .set({ status: "ELIGIBLE" })
              .where(eq(auctionRegistrations.id, prevOnStage.id));
          }
          if (pulledPlayer) {
            await tx
              .update(auctionRegistrations)
              .set({ status: "IN_AUCTION" })
              .where(eq(auctionRegistrations.id, pulledPlayer.id));
          }
          await tx
            .update(auctions)
            .set({
              activeSport: nextSport,
              activeRoundId: nextRoundId,
              currentPlayerId: nextPlayerId,
              projectorMode: "STAGE",
              version: nextVersion,
              updatedAt: new Date(nowIso),
            })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      if (prevOnStage) prevOnStage.status = "ELIGIBLE";
      if (pulledPlayer) pulledPlayer.status = "IN_AUCTION";
      auctionState.auction.activeSport = nextSport;
      auctionState.auction.activeRoundId = nextRoundId;
      auctionState.auction.currentPlayerId = nextPlayerId;
      auctionState.auction.projectorMode = "STAGE";
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = nowIso;

      if (pulledPlayer || prevOnStage) {
        broadcastFullSnapshot();
      } else {
        broadcastDelta();
      }
      res.json({
        ...buildLiveAuctionSnapshot(),
        message: pulledPlayer
          ? `Brought ${pulledPlayer.playerName} onto stage`
          : `Updated stage context (${nextSport})`,
      });
    } catch (err) {
      sendServerError(res, "POST /api/auction/context", err);
    }
  });

  // POST /api/auction/projector (toggle projector display mode)
  app.post("/api/auction/projector", requireAuth, async (req, res) => {
    try {
      if (!(await isAssignedAuctionOperator(req.authUser))) {
        return res.status(403).json({ error: "Assigned Auction Operator permission required" });
      }
      const mode = String(req.body?.mode || "STAGE").toUpperCase();
      if (!["STAGE", "SOLD", "UNSOLD", "STANDINGS", "PAUSED"].includes(mode)) {
        return res.status(400).json({ error: "Invalid projector mode" });
      }
      const nextVersion = (auctionState.auction.version || 1) + 1;
      const nowIso = new Date().toISOString();

      if (useDb() && db) {
        await db.transaction(async (tx) => {
          await tx
            .update(auctions)
            .set({
              projectorMode: mode,
              version: nextVersion,
              updatedAt: new Date(nowIso),
            })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      auctionState.auction.projectorMode = mode as
        | "STAGE"
        | "SOLD"
        | "UNSOLD"
        | "STANDINGS"
        | "PAUSED";
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = nowIso;
      broadcastDelta();
      res.json({
        ...buildLiveAuctionSnapshot(),
        message: `Projector mode set to ${mode}`,
      });
    } catch (err) {
      sendServerError(res, "POST /api/auction/projector", err);
    }
  });

  // POST /api/auction/rtm (Right-to-Match marker on current player)
  app.post("/api/auction/rtm", requireAuth, async (req, res) => {
    try {
      if (!(await isAssignedAuctionOperator(req.authUser))) {
        return res.status(403).json({ error: "Assigned Auction Operator permission required" });
      }
      if (!checkExpectedVersion(req, res, true)) return;
      const player = auctionState.registrations.find(
        (r) => r.id === auctionState.auction.currentPlayerId
      );
      if (!player) {
        return res.status(400).json({ error: "No active player on stage" });
      }
      const latestBid = auctionState.bidHistory.find(
        (b) =>
          b.playerId === player.id &&
          (b.kind === "BID" || b.kind === "JUMP_BID")
      );
      const nowIso = new Date().toISOString();
      const nextVersion = (auctionState.auction.version || 1) + 1;
      const roundId = auctionState.auction.activeRoundId || player.roundId || 1;
      const eventKey = `rtm-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      const rtmEvent: BidEvent = {
        id: eventKey,
        auctionId: auctionState.auction.id,
        roundId,
        playerId: player.id,
        playerName: player.playerName,
        franchiseId: latestBid?.franchiseId || 0,
        franchiseName: latestBid?.franchiseName || "RTM Triggered",
        amount: latestBid?.amount || player.basePrice,
        kind: "RTM",
        timestamp: nowIso,
      };

      if (useDb() && db) {
        await db.transaction(async (tx) => {
          await tx.insert(auctionBidEvents).values({
            eventKey,
            auctionId: auctionState.auction.id,
            roundId,
            playerId: player.id,
            playerName: player.playerName,
            franchiseId: latestBid?.franchiseId || null,
            franchiseName: rtmEvent.franchiseName,
            amount: rtmEvent.amount,
            kind: "RTM",
            isUndone: false,
            createdByUserId: req.authUser!.id,
            createdAt: new Date(nowIso),
          });
          await tx
            .update(auctions)
            .set({ version: nextVersion, updatedAt: new Date(nowIso) })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      auctionState.bidHistory.unshift(rtmEvent);
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = nowIso;
      broadcastDelta({ latestBidEvent: rtmEvent });
      res.json({
        ...buildLiveAuctionSnapshot(),
        message: `RTM card triggered for ${player.playerName}`,
      });
    } catch (err) {
      sendServerError(res, "POST /api/auction/rtm", err);
    }
  });

  // POST /api/auction/rounds
  app.post("/api/auction/rounds", requireAuth, async (req, res) => {
    try {
      if (!(await isAssignedAuctionOperator(req.authUser))) {
        return res.status(403).json({ error: "Not authorized to manage rounds" });
      }
      const name = String(req.body?.name || "").trim();
      if (!name) {
        return res.status(400).json({ error: "Round name is required" });
      }
      const nextNum =
        Math.max(0, ...auctionState.rounds.map((r) => r.roundNumber)) + 1;
      const status = (req.body?.status || "PENDING") as
        | "PENDING"
        | "ACTIVE"
        | "COMPLETED";

      let createdId =
        Math.max(0, ...auctionState.rounds.map((r) => r.id)) + 1;
      const nextVersion = (auctionState.auction.version || 1) + 1;

      if (useDb() && db) {
        await db.transaction(async (tx) => {
          const [row] = await tx
            .insert(auctionRounds)
            .values({
              auctionId: auctionState.auction.id,
              roundNumber: nextNum,
              name,
              status,
            })
            .returning();
          if (row) createdId = row.id;
          await tx
            .update(auctions)
            .set({ version: nextVersion, updatedAt: new Date() })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      auctionState.rounds.push({
        id: createdId,
        auctionId: auctionState.auction.id,
        roundNumber: nextNum,
        name,
        status,
      });
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = new Date().toISOString();
      broadcastDelta({ includeRounds: true });
      res.status(201).json(buildLiveAuctionSnapshot());
    } catch (err) {
      sendServerError(res, "POST /api/auction/rounds", err);
    }
  });

  // PATCH /api/auction/rounds/:id (edit round or move UNSOLD players into this round)
  app.patch("/api/auction/rounds/:id", requireAuth, async (req, res) => {
    try {
      if (!(await isAssignedAuctionOperator(req.authUser))) {
        return res.status(403).json({ error: "Not authorized to update rounds" });
      }
      const id = Number(req.params.id);
      const round = auctionState.rounds.find((r) => r.id === id);
      if (!round) return res.status(404).json({ error: "Round not found" });

      const nextName =
        typeof req.body?.name === "string" && req.body.name.trim()
          ? req.body.name.trim()
          : round.name;
      const nextRoundNum =
        req.body?.roundNumber !== undefined && Number(req.body.roundNumber) >= 1
          ? Math.round(Number(req.body.roundNumber))
          : round.roundNumber;
      const nextStatus = ["PENDING", "ACTIVE", "COMPLETED"].includes(
        req.body?.status
      )
        ? (req.body.status as "PENDING" | "ACTIVE" | "COMPLETED")
        : round.status;
      const moveUnsoldHere = Boolean(req.body?.moveUnsoldHere);
      const sportFilter =
        typeof req.body?.sport === "string" ? req.body.sport.trim() : "";
      const nextVersion = (auctionState.auction.version || 1) + 1;

      const toRequeue = moveUnsoldHere
        ? auctionState.registrations.filter(
            (r) =>
              r.status === "UNSOLD" &&
              (!sportFilter ||
                r.sport.toLowerCase() === sportFilter.toLowerCase())
          )
        : [];

      if (useDb() && db) {
        await db.transaction(async (tx) => {
          await tx
            .update(auctionRounds)
            .set({
              name: nextName,
              roundNumber: nextRoundNum,
              status: nextStatus,
            })
            .where(eq(auctionRounds.id, id));
          for (const p of toRequeue) {
            await tx
              .update(auctionRegistrations)
              .set({ status: "RE_AUCTIONED", roundId: id })
              .where(eq(auctionRegistrations.id, p.id));
          }
          await tx
            .update(auctions)
            .set({
              version: nextVersion,
              activeRoundId:
                nextStatus === "ACTIVE" ? id : auctionState.auction.activeRoundId,
              updatedAt: new Date(),
            })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      round.name = nextName;
      round.roundNumber = nextRoundNum;
      round.status = nextStatus;
      for (const p of toRequeue) {
        p.status = "RE_AUCTIONED";
        p.roundId = id;
      }
      if (nextStatus === "ACTIVE") {
        auctionState.auction.activeRoundId = id;
      }
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = new Date().toISOString();
      if (toRequeue.length > 0) {
        broadcastFullSnapshot();
      } else {
        broadcastDelta({ includeRounds: true });
      }
      res.json(buildLiveAuctionSnapshot());
    } catch (err) {
      sendServerError(res, "PATCH /api/auction/rounds/:id", err);
    }
  });

  // DELETE /api/auction/rounds/:id
  app.delete("/api/auction/rounds/:id", requireAuth, async (req, res) => {
    try {
      if (!isAuctionAdmin(req.authUser)) {
        return res.status(403).json({ error: "Not authorized to delete rounds" });
      }
      const id = Number(req.params.id);
      if (auctionState.rounds.length <= 1) {
        return res
          .status(400)
          .json({ error: "At least one auction round is required" });
      }
      const nextVersion = (auctionState.auction.version || 1) + 1;
      const fallbackRoundId =
        auctionState.rounds.find((r) => r.id !== id)?.id || null;

      if (useDb() && db) {
        await db.transaction(async (tx) => {
          await tx.delete(auctionRounds).where(eq(auctionRounds.id, id));
          if (auctionState.auction.activeRoundId === id) {
            await tx
              .update(auctions)
              .set({
                activeRoundId: fallbackRoundId,
                version: nextVersion,
                updatedAt: new Date(),
              })
              .where(eq(auctions.id, auctionState.auction.id));
          } else {
            await tx
              .update(auctions)
              .set({ version: nextVersion, updatedAt: new Date() })
              .where(eq(auctions.id, auctionState.auction.id));
          }
        });
      }

      auctionState.rounds = auctionState.rounds.filter((r) => r.id !== id);
      if (auctionState.auction.activeRoundId === id) {
        auctionState.auction.activeRoundId = fallbackRoundId;
      }
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = new Date().toISOString();
      broadcastDelta({ includeRounds: true });
      res.json(buildLiveAuctionSnapshot());
    } catch (err) {
      sendServerError(res, "DELETE /api/auction/rounds/:id", err);
    }
  });

  // POST /api/auction/franchises (add per-sport franchise)
  app.post("/api/auction/franchises", requireAuth, async (req, res) => {
    try {
      if (!isAuctionAdmin(req.authUser)) {
        return res
          .status(403)
          .json({ error: "Only Sports Secretary or Faculty Advisor can add teams" });
      }
      const sport = String(req.body?.sport || auctionState.auction.activeSport).trim();
      const name = String(req.body?.name || "").trim();
      const shortCode = String(req.body?.shortCode || name.slice(0, 3))
        .trim()
        .toUpperCase()
        .slice(0, 5);
      const accentColor = String(req.body?.accentColor || "#d4a038").trim();
      const captainName = String(req.body?.captainName || "").trim();
      const captainUserId = req.body?.captainUserId
        ? Number(req.body.captainUserId)
        : null;
      const startingPurse = Math.max(0, Number(req.body?.startingPurse) || 100000);

      if (!sport || !name) {
        return res.status(400).json({ error: "Sport and franchise name are required" });
      }
      const sportFranchises = auctionState.franchises.filter(
        (f) => f.sport.toLowerCase() === sport.toLowerCase()
      );
      if (sportFranchises.length >= 8) {
        return res
          .status(400)
          .json({ error: "Maximum 8 franchises per sport for [1]-[8] operator keys" });
      }

      const slotNumber =
        Math.max(0, ...sportFranchises.map((f) => f.slotNumber)) + 1;
      let createdId =
        Math.max(0, ...auctionState.franchises.map((f) => f.id)) + 1;
      const nextVersion = (auctionState.auction.version || 1) + 1;

      if (useDb() && db) {
        await db.transaction(async (tx) => {
          const [row] = await tx
            .insert(auctionFranchises)
            .values({
              auctionId: auctionState.auction.id,
              sport,
              slotNumber,
              name,
              shortCode,
              accentColor,
              captainName,
              captainUserId,
              startingPurse,
              minSquadSize: req.body?.minSquadSize ?? null,
              maxSquadSize: req.body?.maxSquadSize ?? null,
              minClubPlayers: req.body?.minClubPlayers ?? null,
              minNonClubPlayers: req.body?.minNonClubPlayers ?? null,
            })
            .returning();
          if (row) createdId = row.id;
          await tx
            .update(auctions)
            .set({ version: nextVersion, updatedAt: new Date() })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      auctionState.franchises.push({
        id: createdId,
        auctionId: auctionState.auction.id,
        sport,
        slotNumber,
        name,
        shortCode,
        accentColor,
        captainName,
        captainUserId,
        startingPurse,
        minSquadSize: req.body?.minSquadSize ?? null,
        maxSquadSize: req.body?.maxSquadSize ?? null,
        minClubPlayers: req.body?.minClubPlayers ?? null,
        minNonClubPlayers: req.body?.minNonClubPlayers ?? null,
      });
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = new Date().toISOString();
      broadcastDelta();
      res.status(201).json(buildLiveAuctionSnapshot());
    } catch (err) {
      sendServerError(res, "POST /api/auction/franchises", err);
    }
  });

  // PATCH /api/auction/franchises/:id
  app.patch("/api/auction/franchises/:id", requireAuth, async (req, res) => {
    try {
      if (!isAuctionAdmin(req.authUser)) {
        return res
          .status(403)
          .json({ error: "Only Sports Secretary or Faculty Advisor can edit teams" });
      }
      const id = Number(req.params.id);
      const franchise = auctionState.franchises.find((f) => f.id === id);
      if (!franchise) {
        return res.status(404).json({ error: "Franchise not found" });
      }

      const updated = { ...franchise };
      if (typeof req.body?.sport === "string" && req.body.sport.trim()) {
        updated.sport = req.body.sport.trim();
      }
      if (req.body?.slotNumber !== undefined) {
        const s = Number(req.body.slotNumber);
        if (Number.isInteger(s) && s >= 1 && s <= 8) {
          updated.slotNumber = s;
        }
      }
      if (typeof req.body?.name === "string" && req.body.name.trim()) {
        updated.name = req.body.name.trim();
      }
      if (typeof req.body?.shortCode === "string" && req.body.shortCode.trim()) {
        updated.shortCode = req.body.shortCode.trim().toUpperCase().slice(0, 5);
      }
      if (typeof req.body?.accentColor === "string" && req.body.accentColor.trim()) {
        updated.accentColor = req.body.accentColor.trim();
      }
      if (typeof req.body?.captainName === "string") {
        updated.captainName = req.body.captainName.trim();
      }
      if (req.body?.captainUserId !== undefined) {
        updated.captainUserId = req.body.captainUserId
          ? Number(req.body.captainUserId)
          : null;
      }
      if (req.body?.startingPurse !== undefined) {
        const p = Number(req.body.startingPurse);
        if (!Number.isFinite(p) || p < 0) {
          return res.status(400).json({ error: "Invalid startingPurse" });
        }
        updated.startingPurse = Math.round(p);
      }
      if (req.body?.minSquadSize !== undefined) {
        updated.minSquadSize =
          req.body.minSquadSize === null || req.body.minSquadSize === ""
            ? null
            : Number(req.body.minSquadSize);
      }
      if (req.body?.maxSquadSize !== undefined) {
        updated.maxSquadSize =
          req.body.maxSquadSize === null || req.body.maxSquadSize === ""
            ? null
            : Number(req.body.maxSquadSize);
      }
      if (req.body?.minClubPlayers !== undefined) {
        updated.minClubPlayers =
          req.body.minClubPlayers === null || req.body.minClubPlayers === ""
            ? null
            : Number(req.body.minClubPlayers);
      }
      if (req.body?.minNonClubPlayers !== undefined) {
        updated.minNonClubPlayers =
          req.body.minNonClubPlayers === null || req.body.minNonClubPlayers === ""
            ? null
            : Number(req.body.minNonClubPlayers);
      }

      const nextVersion = (auctionState.auction.version || 1) + 1;
      if (useDb() && db) {
        await db.transaction(async (tx) => {
          await tx
            .update(auctionFranchises)
            .set({
              sport: updated.sport,
              slotNumber: updated.slotNumber,
              name: updated.name,
              shortCode: updated.shortCode,
              accentColor: updated.accentColor,
              captainName: updated.captainName,
              captainUserId: updated.captainUserId ?? null,
              startingPurse: updated.startingPurse,
              minSquadSize: updated.minSquadSize ?? null,
              maxSquadSize: updated.maxSquadSize ?? null,
              minClubPlayers: updated.minClubPlayers ?? null,
              minNonClubPlayers: updated.minNonClubPlayers ?? null,
            })
            .where(eq(auctionFranchises.id, id));
          await tx
            .update(auctions)
            .set({ version: nextVersion, updatedAt: new Date() })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      Object.assign(franchise, updated);
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = new Date().toISOString();
      broadcastDelta();
      res.json(buildLiveAuctionSnapshot());
    } catch (err) {
      sendServerError(res, "PATCH /api/auction/franchises/:id", err);
    }
  });

  // DELETE /api/auction/franchises/:id
  app.delete("/api/auction/franchises/:id", requireAuth, async (req, res) => {
    try {
      if (!isAuctionAdmin(req.authUser)) {
        return res
          .status(403)
          .json({ error: "Only Sports Secretary or Faculty Advisor can remove teams" });
      }
      const id = Number(req.params.id);
      const hasOwned = auctionState.registrations.some(
        (r) => r.status === "SOLD" && r.soldToFranchiseId === id
      );
      if (hasOwned) {
        return res.status(400).json({
          error:
            "Cannot delete a franchise that already owns SOLD players. Undo sales first.",
        });
      }
      const nextVersion = (auctionState.auction.version || 1) + 1;
      if (useDb() && db) {
        await db.transaction(async (tx) => {
          await tx
            .delete(auctionFranchises)
            .where(eq(auctionFranchises.id, id));
          await tx
            .update(auctions)
            .set({ version: nextVersion, updatedAt: new Date() })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      auctionState.franchises = auctionState.franchises.filter(
        (f) => f.id !== id
      );
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = new Date().toISOString();
      broadcastDelta();
      res.json(buildLiveAuctionSnapshot());
    } catch (err) {
      sendServerError(res, "DELETE /api/auction/franchises/:id", err);
    }
  });

  // POST /api/auction/registrations (authenticated player self-registration or admin enrollment)
  app.post("/api/auction/registrations", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser!;
      const body = req.body || {};

      // Enforce registration window & deadline for non-admins
      if (!isAuctionAdmin(actor)) {
        if (auctionState.auction.status !== "REGISTRATION_OPEN") {
          return res.status(400).json({
            error: `Player registration is closed while auction is ${auctionState.auction.status}`,
          });
        }
        const dlStr =
          auctionState.auction.registrationDeadlineAt ||
          auctionState.auction.registrationDeadline;
        if (dlStr) {
          const dl = new Date(dlStr);
          if (!Number.isNaN(dl.getTime()) && Date.now() > dl.getTime()) {
            return res.status(400).json({
              error: "Registration deadline has passed",
            });
          }
        }
      }

      // Derive student identity strictly from the authenticated DB user record
      const targetUserId =
        isAuctionAdmin(actor) && body.userId ? Number(body.userId) : actor.id;
      let targetUser: AuthUserRecord | null = actor;
      if (targetUserId !== actor.id) {
        if (useDb() && db) {
          const [u] = await db
            .select()
            .from(users)
            .where(eq(users.id, targetUserId));
          targetUser = u || null;
        } else {
          targetUser =
            demoStore.users.find((u) => u.id === targetUserId) || null;
        }
        if (!targetUser) {
          return res.status(404).json({ error: "Target user not found" });
        }
      }

      const sport = String(body.sport || "").trim();
      const positions: string[] = Array.isArray(body.positions)
        ? body.positions.map((p: unknown) => String(p).trim()).filter(Boolean)
        : [];
      const playerName = targetUser.name.trim();
      const rollNumber = (targetUser.rollNumber || "IIITT").trim();
      const yearLabel = (targetUser.batch || "3RD").trim();
      const branch = (targetUser.branch || "CSE").trim();
      const statsSummary = String(body.statsSummary || "").trim().slice(0, 400);

      if (!sport) {
        return res.status(400).json({ error: "Sport is required" });
      }
      if (positions.length === 0) {
        return res
          .status(400)
          .json({ error: "Select at least one playing position" });
      }

      // 1 registration per user per sport
      const duplicate = auctionState.registrations.find(
        (r) =>
          r.userId === targetUserId &&
          r.sport.toLowerCase() === sport.toLowerCase()
      );
      if (duplicate) {
        return res.status(409).json({
          error: `Already registered for ${sport}. You can only register once per sport.`,
        });
      }

      // Derive CLUB vs NON_CLUB automatically from club membership (unless admin explicitly overrides)
      let isInductedClubMember = false;
      if (useDb() && db) {
        const clubRows = await db.select().from(sportsClubs);
        const matchedClub = clubRows.find(
          (c) => c.name.toLowerCase() === sport.toLowerCase()
        );
        if (matchedClub) {
          const mems = await db
            .select()
            .from(clubMemberships)
            .where(
              and(
                eq(clubMemberships.clubId, matchedClub.id),
                eq(clubMemberships.userId, targetUserId),
                eq(clubMemberships.status, "INDUCTED")
              )
            );
          isInductedClubMember = mems.length > 0;
        }
      } else {
        const matchedClub = demoStore.clubs.find(
          (c) => c.name.toLowerCase() === sport.toLowerCase()
        );
        if (matchedClub) {
          isInductedClubMember = demoStore.memberships.some(
            (m) =>
              m.clubId === matchedClub.id &&
              m.userId === targetUserId &&
              m.status === "INDUCTED"
          );
        }
      }

      const playerClass: "CLUB" | "NON_CLUB" =
        isAuctionAdmin(actor) &&
        (body.playerClass === "CLUB" || body.playerClass === "NON_CLUB")
          ? body.playerClass
          : isInductedClubMember
            ? "CLUB"
            : "NON_CLUB";

      const basePrice =
        isAuctionAdmin(actor) &&
        body.basePrice !== undefined &&
        Number.isFinite(Number(body.basePrice)) &&
        Number(body.basePrice) >= 0
          ? Math.round(Number(body.basePrice))
          : getEffectiveBasePrice(auctionState.auction, sport, playerClass);

      // Handle photoUrl cleanly: accept safe relative /api/media/players/... or /uploads/players/...
      // or convert validated data URL into durable /api/media/players/:key (never store raw base64 in auction state!)
      let safePhotoUrl: string | null = null;
      if (typeof body.photoUrl === "string" && body.photoUrl.trim()) {
        const rawPhoto = body.photoUrl.trim();
        if (rawPhoto.startsWith("data:image/")) {
          const persisted = await persistPhotoFromDataUrl(rawPhoto, actor.id);
          if (!persisted) {
            return res.status(400).json({
              error:
                "Invalid image upload. Only JPEG, PNG, WebP, or GIF up to 2.5 MB are allowed.",
            });
          }
          safePhotoUrl = persisted;
        } else if (
          rawPhoto.startsWith("/api/media/players/") ||
          rawPhoto.startsWith("/uploads/players/")
        ) {
          safePhotoUrl = rawPhoto;
        } else {
          return res.status(400).json({
            error: "Invalid photo URL format",
          });
        }
      }

      const roundId =
        Number(body.roundId) ||
        auctionState.auction.activeRoundId ||
        auctionState.rounds[0]?.id ||
        1;
      const tier =
        isAuctionAdmin(actor) && typeof body.tier === "string" && body.tier.trim()
          ? body.tier.trim()
          : playerClass === "CLUB"
            ? "TIER_1"
            : "UNCAPPED";

      let createdId =
        Math.max(0, ...auctionState.registrations.map((r) => r.id)) + 1;
      const nextVersion = (auctionState.auction.version || 1) + 1;

      if (useDb() && db) {
        await db.transaction(async (tx) => {
          const [row] = await tx
            .insert(auctionRegistrations)
            .values({
              auctionId: auctionState.auction.id,
              userId: targetUserId,
              playerName,
              rollNumber,
              yearLabel,
              branch,
              sport,
              positionsJson: JSON.stringify(positions),
              playerClass,
              basePrice,
              tier,
              roundId,
              status: "ELIGIBLE",
              soldToFranchiseId: null,
              soldPrice: null,
              statsSummary,
              photoUrl: safePhotoUrl,
            })
            .returning();
          if (row) createdId = row.id;
          await tx
            .update(auctions)
            .set({ version: nextVersion, updatedAt: new Date() })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      const newReg: AuctionRegistration = {
        id: createdId,
        auctionId: auctionState.auction.id,
        userId: targetUserId,
        playerName,
        rollNumber,
        yearLabel,
        branch,
        sport,
        positions,
        playerClass,
        basePrice,
        tier,
        roundId,
        status: "ELIGIBLE",
        soldToFranchiseId: null,
        soldPrice: null,
        statsSummary,
        photoUrl: safePhotoUrl,
      };
      auctionState.registrations.push(newReg);
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = new Date().toISOString();
      broadcastDelta({ updatedRegistration: newReg });
      res.status(201).json({ registration: newReg, snapshot: buildLiveAuctionSnapshot() });
    } catch (err) {
      sendServerError(res, "POST /api/auction/registrations", err);
    }
  });

  // PATCH /api/auction/registrations/:id (edit player details / status / base price / photo)
  app.patch("/api/auction/registrations/:id", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser!;
      const id = Number(req.params.id);
      const reg = auctionState.registrations.find((r) => r.id === id);
      if (!reg) return res.status(404).json({ error: "Registration not found" });

      const isSelf = reg.userId === actor.id;
      const isOp = await isAssignedAuctionOperator(actor);
      if (!isOp && !isSelf) {
        return res
          .status(403)
          .json({ error: "Not authorized to edit this registration" });
      }

      const body = req.body || {};
      const updated = { ...reg };

      // Only admins/operators can edit identity fields; students cannot spoof name/rollNumber
      if (isOp && typeof body.playerName === "string" && body.playerName.trim()) {
        updated.playerName = body.playerName.trim();
      }
      if (isOp && typeof body.rollNumber === "string" && body.rollNumber.trim()) {
        updated.rollNumber = body.rollNumber.trim();
      }
      if (typeof body.yearLabel === "string" && body.yearLabel.trim()) {
        updated.yearLabel = body.yearLabel.trim();
      }
      if (typeof body.branch === "string" && body.branch.trim()) {
        updated.branch = body.branch.trim();
      }
      if (Array.isArray(body.positions) && body.positions.length > 0) {
        updated.positions = body.positions
          .map((p: unknown) => String(p).trim())
          .filter(Boolean);
      }
      if (typeof body.statsSummary === "string") {
        updated.statsSummary = body.statsSummary.trim();
      }
      if (typeof body.photoUrl === "string" && body.photoUrl.trim()) {
        const rawPhoto = body.photoUrl.trim();
        if (rawPhoto.startsWith("data:image/")) {
          const persisted = await persistPhotoFromDataUrl(rawPhoto, actor.id);
          if (!persisted) {
            return res.status(400).json({ error: "Invalid image format or size" });
          }
          updated.photoUrl = persisted;
        } else if (
          rawPhoto.startsWith("/api/media/players/") ||
          rawPhoto.startsWith("/uploads/players/")
        ) {
          updated.photoUrl = rawPhoto;
        }
      }

      // Privileged operator/admin fields
      if (isOp) {
        if (body.playerClass === "CLUB" || body.playerClass === "NON_CLUB") {
          updated.playerClass = body.playerClass;
        }
        if (body.basePrice !== undefined && Number.isFinite(Number(body.basePrice))) {
          updated.basePrice = Math.max(0, Math.round(Number(body.basePrice)));
        }
        if (typeof body.tier === "string" && body.tier.trim()) {
          updated.tier = body.tier.trim();
        }
        if (body.roundId !== undefined && Number(body.roundId) > 0) {
          updated.roundId = Number(body.roundId);
        }
        if (
          typeof body.status === "string" &&
          [
            "REGISTERED",
            "ELIGIBLE",
            "IN_AUCTION",
            "SOLD",
            "UNSOLD",
            "RE_AUCTIONED",
            "INELIGIBLE",
          ].includes(body.status)
        ) {
          updated.status = body.status as AuctionRegistration["status"];
        }
      }

      const nextVersion = (auctionState.auction.version || 1) + 1;
      if (useDb() && db) {
        await db.transaction(async (tx) => {
          await tx
            .update(auctionRegistrations)
            .set({
              playerName: updated.playerName,
              rollNumber: updated.rollNumber,
              yearLabel: updated.yearLabel,
              branch: updated.branch,
              positionsJson: JSON.stringify(updated.positions),
              playerClass: updated.playerClass,
              basePrice: updated.basePrice,
              tier: updated.tier,
              roundId: updated.roundId,
              status: updated.status,
              statsSummary: updated.statsSummary,
              photoUrl: updated.photoUrl ?? null,
            })
            .where(eq(auctionRegistrations.id, id));
          await tx
            .update(auctions)
            .set({ version: nextVersion, updatedAt: new Date() })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      Object.assign(reg, updated);
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = new Date().toISOString();
      broadcastDelta({ updatedRegistration: reg });
      res.json(buildLiveAuctionSnapshot());
    } catch (err) {
      sendServerError(res, "PATCH /api/auction/registrations/:id", err);
    }
  });

  // DELETE /api/auction/registrations/:id
  app.delete("/api/auction/registrations/:id", requireAuth, async (req, res) => {
    try {
      if (!isAuctionAdmin(req.authUser)) {
        return res.status(403).json({ error: "Not authorized to remove players" });
      }
      const id = Number(req.params.id);
      const reg = auctionState.registrations.find((r) => r.id === id);
      if (!reg) return res.status(404).json({ error: "Registration not found" });
      if (reg.status === "SOLD") {
        return res
          .status(400)
          .json({ error: "Cannot delete a SOLD player. Undo sale first." });
      }
      const nextVersion = (auctionState.auction.version || 1) + 1;

      if (useDb() && db) {
        await db.transaction(async (tx) => {
          await tx
            .delete(auctionRegistrations)
            .where(eq(auctionRegistrations.id, id));
          await tx
            .update(auctions)
            .set({
              currentPlayerId:
                auctionState.auction.currentPlayerId === id
                  ? null
                  : auctionState.auction.currentPlayerId,
              version: nextVersion,
              updatedAt: new Date(),
            })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      auctionState.registrations = auctionState.registrations.filter(
        (r) => r.id !== id
      );
      if (auctionState.auction.currentPlayerId === id) {
        auctionState.auction.currentPlayerId = null;
      }
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = new Date().toISOString();
      broadcastDelta({ removedRegistrationId: id });
      res.json(buildLiveAuctionSnapshot());
    } catch (err) {
      sendServerError(res, "DELETE /api/auction/registrations/:id", err);
    }
  });

  // POST /api/auction/nominate (bring specific player onto stage)
  app.post("/api/auction/nominate", requireAuth, async (req, res) => {
    try {
      if (!(await isAssignedAuctionOperator(req.authUser))) {
        return res.status(403).json({ error: "Assigned Auction Operator permission required" });
      }
      if (!checkExpectedVersion(req, res, true)) return;

      const playerId = Number(req.body?.playerId);
      const player = auctionState.registrations.find((r) => r.id === playerId);
      if (!player) return res.status(404).json({ error: "Player not found" });
      if (player.status === "SOLD") {
        return res.status(400).json({ error: "Player is already SOLD" });
      }

      const prevOnStage = auctionState.registrations.find(
        (r) => r.status === "IN_AUCTION" && r.id !== playerId
      );
      const nextVersion = (auctionState.auction.version || 1) + 1;
      const nowIso = new Date().toISOString();

      if (useDb() && db) {
        await db.transaction(async (tx) => {
          if (prevOnStage) {
            await tx
              .update(auctionRegistrations)
              .set({ status: "ELIGIBLE" })
              .where(eq(auctionRegistrations.id, prevOnStage.id));
          }
          await tx
            .update(auctionRegistrations)
            .set({ status: "IN_AUCTION" })
            .where(eq(auctionRegistrations.id, player.id));
          await tx
            .update(auctions)
            .set({
              status: "LIVE",
              activeSport: player.sport,
              activeRoundId: player.roundId,
              currentPlayerId: player.id,
              projectorMode: "STAGE",
              version: nextVersion,
              updatedAt: new Date(nowIso),
            })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      if (prevOnStage) prevOnStage.status = "ELIGIBLE";
      player.status = "IN_AUCTION";
      auctionState.auction.status = "LIVE";
      auctionState.auction.activeSport = player.sport;
      auctionState.auction.activeRoundId = player.roundId;
      auctionState.auction.currentPlayerId = player.id;
      auctionState.auction.projectorMode = "STAGE";
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = nowIso;

      broadcastFullSnapshot();
      res.json(buildLiveAuctionSnapshot());
    } catch (err) {
      sendServerError(res, "POST /api/auction/nominate", err);
    }
  });

  // POST /api/auction/bid (strict server-side rules + DB transaction first + idempotency + version check)
  app.post("/api/auction/bid", requireAuth, async (req, res) => {
    try {
      if (!(await isAssignedAuctionOperator(req.authUser))) {
        return res.status(403).json({ error: "Assigned Auction Operator permission required" });
      }

      const idempKey = getIdempotencyKey(req);
      if (idempKey) {
        const cached = await lookupIdempotency(idempKey);
        if (cached) {
          return res.status(cached.status).json(cached.body);
        }
      }

      if (!checkExpectedVersion(req, res, true)) return;

      const franchiseId = Number(req.body?.franchiseId);
      const rawCustom = req.body?.customAmount ?? req.body?.amount;
      const customAmount =
        rawCustom !== undefined && rawCustom !== null && rawCustom !== ""
          ? Number(rawCustom)
          : undefined;
      const isJump =
        Boolean(req.body?.isJump) ||
        String(req.body?.kind || "").toUpperCase() === "JUMP_BID";

      const player = auctionState.registrations.find(
        (r) => r.id === auctionState.auction.currentPlayerId
      );
      if (!player) {
        return res
          .status(400)
          .json({ error: "No active player nominated on stage" });
      }
      if (player.status !== "IN_AUCTION") {
        return res.status(400).json({
          error: `Cannot bid on ${player.playerName} because status is ${player.status}`,
        });
      }

      const summaries = computeFranchiseSummaries();
      const franchise = summaries.find((f) => f.id === franchiseId);
      if (!franchise) {
        return res.status(404).json({ error: "Franchise not found" });
      }
      if (franchise.sport.toLowerCase() !== player.sport.toLowerCase()) {
        return res.status(400).json({
          error: `${franchise.name} belongs to ${franchise.sport}, not ${player.sport}`,
        });
      }
      if (!franchise.isEligibleToBid) {
        return res.status(400).json({
          error:
            franchise.lockReason ||
            `${franchise.name} cannot bid due to squad/purse reserve guardrails`,
        });
      }

      // Compute current active highest bid on this player
      const playerBids = auctionState.bidHistory.filter(
        (b) =>
          b.playerId === player.id &&
          (b.kind === "BID" || b.kind === "JUMP_BID")
      );
      const latestBid = playerBids[0] || null;
      const inc = isJump
        ? auctionState.auction.jumpIncrement
        : auctionState.auction.defaultIncrement;

      const minRequiredAmount = latestBid
        ? latestBid.amount + auctionState.auction.defaultIncrement
        : player.basePrice;

      const bidAmount =
        customAmount !== undefined && Number.isFinite(customAmount)
          ? Math.round(customAmount)
          : latestBid
            ? latestBid.amount + inc
            : player.basePrice;

      if (bidAmount < minRequiredAmount) {
        return res.status(400).json({
          error: latestBid
            ? `Bid must be at least ${minRequiredAmount.toLocaleString()} (current bid + ${auctionState.auction.defaultIncrement.toLocaleString()} increment)`
            : `Opening bid must be at least base price (${player.basePrice.toLocaleString()})`,
        });
      }

      if (bidAmount > franchise.maxAllowedBid) {
        return res.status(400).json({
          error: `Bid ${bidAmount.toLocaleString()} exceeds ${franchise.name}'s Max Allowed Bid of ${franchise.maxAllowedBid.toLocaleString()} (purse reserve guardrail)`,
        });
      }

      const eventKey =
        idempKey || `bid-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      const nowIso = new Date().toISOString();
      const nextVersion = (auctionState.auction.version || 1) + 1;
      const roundId = auctionState.auction.activeRoundId || player.roundId || 1;

      const bidEvent: BidEvent = {
        id: eventKey,
        auctionId: auctionState.auction.id,
        roundId,
        playerId: player.id,
        playerName: player.playerName,
        franchiseId: franchise.id,
        franchiseName: franchise.name,
        amount: bidAmount,
        kind: isJump ? "JUMP_BID" : "BID",
        timestamp: nowIso,
      };

      // DB-FIRST TRANSACTION
      if (useDb() && db) {
        await db.transaction(async (tx) => {
          await tx.insert(auctionBidEvents).values({
            eventKey,
            auctionId: auctionState.auction.id,
            roundId,
            playerId: player.id,
            playerName: player.playerName,
            franchiseId: franchise.id,
            franchiseName: franchise.name,
            amount: bidAmount,
            kind: bidEvent.kind,
            isUndone: false,
            createdByUserId: req.authUser!.id,
            createdAt: new Date(nowIso),
          });
          await tx
            .update(auctions)
            .set({
              projectorMode: "STAGE",
              version: nextVersion,
              updatedAt: new Date(nowIso),
            })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      auctionState.bidHistory.unshift(bidEvent);
      auctionState.auction.projectorMode = "STAGE";
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = nowIso;

      broadcastDelta({ updatedRegistration: player, latestBidEvent: bidEvent });
      const snap = buildLiveAuctionSnapshot();
      if (idempKey) await recordIdempotency(idempKey, 200, snap);
      res.json(snap);
    } catch (err) {
      sendServerError(res, "POST /api/auction/bid", err);
    }
  });

  // POST /api/auction/outcome (SOLD or UNSOLD — DB transaction first!)
  app.post("/api/auction/outcome", requireAuth, async (req, res) => {
    try {
      if (!(await isAssignedAuctionOperator(req.authUser))) {
        return res.status(403).json({ error: "Assigned Auction Operator permission required" });
      }

      const idempKey = getIdempotencyKey(req);
      if (idempKey) {
        const cached = await lookupIdempotency(idempKey);
        if (cached) {
          return res.status(cached.status).json(cached.body);
        }
      }
      if (!checkExpectedVersion(req, res, true)) return;

      const outcome = String(req.body?.outcome || "").toUpperCase();
      if (outcome !== "SOLD" && outcome !== "UNSOLD") {
        return res
          .status(400)
          .json({ error: "outcome must be SOLD or UNSOLD" });
      }

      const player = auctionState.registrations.find(
        (r) => r.id === auctionState.auction.currentPlayerId
      );
      if (!player) {
        return res.status(400).json({ error: "No active player on stage" });
      }
      if (player.status !== "IN_AUCTION") {
        return res.status(400).json({
          error: `Player is not IN_AUCTION (current status: ${player.status})`,
        });
      }

      const nowIso = new Date().toISOString();
      const nextVersion = (auctionState.auction.version || 1) + 1;
      const roundId = auctionState.auction.activeRoundId || player.roundId || 1;
      const eventKey =
        idempKey ||
        `out-${outcome.toLowerCase()}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

      if (outcome === "SOLD") {
        const latestBid = auctionState.bidHistory.find(
          (b) =>
            b.playerId === player.id &&
            (b.kind === "BID" || b.kind === "JUMP_BID")
        );
        if (!latestBid) {
          return res.status(400).json({
            error: "Cannot mark SOLD without at least one active bid",
          });
        }

        const summaries = computeFranchiseSummaries();
        const winner = summaries.find((f) => f.id === latestBid.franchiseId);
        if (!winner || !winner.isEligibleToBid || latestBid.amount > winner.maxAllowedBid) {
          return res.status(400).json({
            error: "Winning franchise fails purse/squad reserve guardrails",
          });
        }

        const soldEvent: BidEvent = {
          id: eventKey,
          auctionId: auctionState.auction.id,
          roundId,
          playerId: player.id,
          playerName: player.playerName,
          franchiseId: winner.id,
          franchiseName: winner.name,
          amount: latestBid.amount,
          kind: "SOLD",
          timestamp: nowIso,
        };

        // DB-FIRST TRANSACTION: persist BOTH player sale & bid event before acknowledging
        if (useDb() && db) {
          await db.transaction(async (tx) => {
            await tx
              .update(auctionRegistrations)
              .set({
                status: "SOLD",
                soldToFranchiseId: winner.id,
                soldPrice: latestBid.amount,
              })
              .where(eq(auctionRegistrations.id, player.id));

            await tx.insert(auctionBidEvents).values({
              eventKey,
              auctionId: auctionState.auction.id,
              roundId,
              playerId: player.id,
              playerName: player.playerName,
              franchiseId: winner.id,
              franchiseName: winner.name,
              amount: latestBid.amount,
              kind: "SOLD",
              isUndone: false,
              createdByUserId: req.authUser!.id,
              createdAt: new Date(nowIso),
            });

            await tx
              .update(auctions)
              .set({
                projectorMode: "SOLD",
                version: nextVersion,
                updatedAt: new Date(nowIso),
              })
              .where(eq(auctions.id, auctionState.auction.id));
          });
        }

        player.status = "SOLD";
        player.soldToFranchiseId = winner.id;
        player.soldPrice = latestBid.amount;
        auctionState.bidHistory.unshift(soldEvent);
        auctionState.auction.projectorMode = "SOLD";
        auctionState.auction.version = nextVersion;
        auctionState.auction.lastUpdatedAt = nowIso;

        broadcastDelta({ updatedRegistration: player, latestBidEvent: soldEvent });
        const snap = buildLiveAuctionSnapshot();
        if (idempKey) await recordIdempotency(idempKey, 200, snap);
        return res.json(snap);
      }

      // UNSOLD
      const unsoldEvent: BidEvent = {
        id: eventKey,
        auctionId: auctionState.auction.id,
        roundId,
        playerId: player.id,
        playerName: player.playerName,
        franchiseId: 0,
        franchiseName: "UNSOLD",
        amount: 0,
        kind: "UNSOLD",
        timestamp: nowIso,
      };

      if (useDb() && db) {
        await db.transaction(async (tx) => {
          await tx
            .update(auctionRegistrations)
            .set({
              status: "UNSOLD",
              soldToFranchiseId: null,
              soldPrice: null,
            })
            .where(eq(auctionRegistrations.id, player.id));
          await tx.insert(auctionBidEvents).values({
            eventKey,
            auctionId: auctionState.auction.id,
            roundId,
            playerId: player.id,
            playerName: player.playerName,
            franchiseId: null,
            franchiseName: "UNSOLD",
            amount: 0,
            kind: "UNSOLD",
            isUndone: false,
            createdByUserId: req.authUser!.id,
            createdAt: new Date(nowIso),
          });
          await tx
            .update(auctions)
            .set({
              projectorMode: "UNSOLD",
              version: nextVersion,
              updatedAt: new Date(nowIso),
            })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      player.status = "UNSOLD";
      player.soldToFranchiseId = null;
      player.soldPrice = null;
      auctionState.bidHistory.unshift(unsoldEvent);
      auctionState.auction.projectorMode = "UNSOLD";
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = nowIso;

      broadcastDelta({ updatedRegistration: player, latestBidEvent: unsoldEvent });
      const snap = buildLiveAuctionSnapshot();
      if (idempKey) await recordIdempotency(idempKey, 200, snap);
      res.json(snap);
    } catch (err) {
      sendServerError(res, "POST /api/auction/outcome", err);
    }
  });

  // POST /api/auction/undo (DB-first undo of last bid or last outcome)
  app.post("/api/auction/undo", requireAuth, async (req, res) => {
    try {
      if (!(await isAssignedAuctionOperator(req.authUser))) {
        return res.status(403).json({ error: "Assigned Auction Operator permission required" });
      }
      if (!checkExpectedVersion(req, res, true)) return;

      const lastEvent = auctionState.bidHistory[0];
      if (!lastEvent) {
        return res.status(400).json({ error: "No auction events to undo" });
      }

      const affectedPlayer = auctionState.registrations.find(
        (r) => r.id === lastEvent.playerId
      );
      const nextVersion = (auctionState.auction.version || 1) + 1;
      const nowIso = new Date().toISOString();

      if (useDb() && db) {
        await db.transaction(async (tx) => {
          await tx
            .update(auctionBidEvents)
            .set({ isUndone: true })
            .where(eq(auctionBidEvents.eventKey, lastEvent.id));

          if (
            affectedPlayer &&
            (lastEvent.kind === "SOLD" || lastEvent.kind === "UNSOLD")
          ) {
            await tx
              .update(auctionRegistrations)
              .set({
                status: "IN_AUCTION",
                soldToFranchiseId: null,
                soldPrice: null,
              })
              .where(eq(auctionRegistrations.id, affectedPlayer.id));
          }

          await tx
            .update(auctions)
            .set({
              currentPlayerId: affectedPlayer
                ? affectedPlayer.id
                : auctionState.auction.currentPlayerId,
              projectorMode: "STAGE",
              version: nextVersion,
              updatedAt: new Date(nowIso),
            })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      auctionState.bidHistory.shift();
      if (
        affectedPlayer &&
        (lastEvent.kind === "SOLD" || lastEvent.kind === "UNSOLD")
      ) {
        affectedPlayer.status = "IN_AUCTION";
        affectedPlayer.soldToFranchiseId = null;
        affectedPlayer.soldPrice = null;
        auctionState.auction.currentPlayerId = affectedPlayer.id;
      }
      auctionState.auction.projectorMode = "STAGE";
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = nowIso;

      broadcastDelta({ updatedRegistration: affectedPlayer || null });
      res.json(buildLiveAuctionSnapshot());
    } catch (err) {
      sendServerError(res, "POST /api/auction/undo", err);
    }
  });

  // POST /api/auction/next & /api/auction/next-player (advance to next eligible player)
  const handleAdvanceNextPlayer = async (req: Request, res: Response) => {
    try {
      if (!(await isAssignedAuctionOperator(req.authUser))) {
        return res.status(403).json({ error: "Assigned Auction Operator permission required" });
      }
      if (!checkExpectedVersion(req, res, true)) return;

      const sportFilter = String(
        req.body?.sport || auctionState.auction.activeSport || ""
      ).trim();
      const roundFilter = Number(
        req.body?.roundId || auctionState.auction.activeRoundId || 0
      );

      const candidates = auctionState.registrations.filter(
        (r) =>
          (r.status === "ELIGIBLE" || r.status === "RE_AUCTIONED") &&
          (!sportFilter ||
            r.sport.toLowerCase() === sportFilter.toLowerCase()) &&
          (!roundFilter || r.roundId === roundFilter)
      );

      const nextPlayer =
        candidates[0] ||
        auctionState.registrations.find(
          (r) =>
            (r.status === "ELIGIBLE" || r.status === "RE_AUCTIONED") &&
            (!sportFilter ||
              r.sport.toLowerCase() === sportFilter.toLowerCase())
        );

      if (!nextPlayer) {
        return res.status(404).json({
          error: `No remaining eligible players in ${sportFilter || "active pool"}`,
        });
      }

      const prevOnStage = auctionState.registrations.find(
        (r) => r.status === "IN_AUCTION" && r.id !== nextPlayer.id
      );
      const nextVersion = (auctionState.auction.version || 1) + 1;
      const nowIso = new Date().toISOString();

      if (useDb() && db) {
        await db.transaction(async (tx) => {
          if (prevOnStage) {
            await tx
              .update(auctionRegistrations)
              .set({ status: "ELIGIBLE" })
              .where(eq(auctionRegistrations.id, prevOnStage.id));
          }
          await tx
            .update(auctionRegistrations)
            .set({ status: "IN_AUCTION" })
            .where(eq(auctionRegistrations.id, nextPlayer.id));
          await tx
            .update(auctions)
            .set({
              status: "LIVE",
              activeSport: nextPlayer.sport,
              activeRoundId: nextPlayer.roundId,
              currentPlayerId: nextPlayer.id,
              projectorMode: "STAGE",
              version: nextVersion,
              updatedAt: new Date(nowIso),
            })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      if (prevOnStage) prevOnStage.status = "ELIGIBLE";
      nextPlayer.status = "IN_AUCTION";
      auctionState.auction.status = "LIVE";
      auctionState.auction.activeSport = nextPlayer.sport;
      auctionState.auction.activeRoundId = nextPlayer.roundId;
      auctionState.auction.currentPlayerId = nextPlayer.id;
      auctionState.auction.projectorMode = "STAGE";
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = nowIso;

      broadcastFullSnapshot();
      res.json({
        ...buildLiveAuctionSnapshot(),
        message: `Loaded ${nextPlayer.playerName} onto stage`,
      });
    } catch (err) {
      sendServerError(res, "POST /api/auction/next", err);
    }
  };

  app.post("/api/auction/next", requireAuth, handleAdvanceNextPlayer);
  app.post("/api/auction/next-player", requireAuth, handleAdvanceNextPlayer);

  // POST /api/auction/requeue-unsold (move UNSOLD players in active sport to target round as RE_AUCTIONED)
  app.post("/api/auction/requeue-unsold", requireAuth, async (req, res) => {
    try {
      if (!(await isAssignedAuctionOperator(req.authUser))) {
        return res.status(403).json({ error: "Assigned Auction Operator permission required" });
      }
      if (!checkExpectedVersion(req, res, true)) return;
      const sport = String(req.body?.sport || auctionState.auction.activeSport).trim();
      const targetRoundId =
        Number(req.body?.roundId) ||
        auctionState.rounds[1]?.id ||
        auctionState.auction.activeRoundId ||
        1;

      const toRequeue = auctionState.registrations.filter(
        (r) =>
          r.status === "UNSOLD" &&
          (!sport || r.sport.toLowerCase() === sport.toLowerCase())
      );
      if (toRequeue.length === 0) {
        return res.status(400).json({ error: "No UNSOLD players to requeue" });
      }

      const nextVersion = (auctionState.auction.version || 1) + 1;
      const nowIso = new Date().toISOString();

      if (useDb() && db) {
        await db.transaction(async (tx) => {
          for (const p of toRequeue) {
            await tx
              .update(auctionRegistrations)
              .set({ status: "RE_AUCTIONED", roundId: targetRoundId })
              .where(eq(auctionRegistrations.id, p.id));
          }
          await tx
            .update(auctions)
            .set({
              activeRoundId: targetRoundId,
              version: nextVersion,
              updatedAt: new Date(nowIso),
            })
            .where(eq(auctions.id, auctionState.auction.id));
        });
      }

      for (const p of toRequeue) {
        p.status = "RE_AUCTIONED";
        p.roundId = targetRoundId;
      }
      auctionState.auction.activeRoundId = targetRoundId;
      auctionState.auction.version = nextVersion;
      auctionState.auction.lastUpdatedAt = nowIso;
      broadcastFullSnapshot();
      res.json(buildLiveAuctionSnapshot());
    } catch (err) {
      sendServerError(res, "POST /api/auction/requeue-unsold", err);
    }
  });

  // Expose helper to validate/persist photo via DB or demoStore (used by /api/uploads/player-photo)
  void detectImageMimeFromBuffer;
  void playerPhotos;
}

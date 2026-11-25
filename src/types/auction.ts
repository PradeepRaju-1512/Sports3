export type AuctionStatus =
  | "DRAFT"
  | "REGISTRATION_OPEN"
  | "FROZEN"
  | "LIVE"
  | "COMPLETED"
  | "PUBLISHED";

export type PlayerClass = "CLUB" | "NON_CLUB";

export type AuctionPlayerStatus =
  | "REGISTERED"
  | "ELIGIBLE"
  | "IN_AUCTION"
  | "SOLD"
  | "UNSOLD"
  | "RE_AUCTIONED"
  | "INELIGIBLE";

export interface SportBasePriceOverride {
  clubBasePrice: number;
  nonClubBasePrice: number;
}

export interface AuctionRound {
  id: number;
  auctionId: number;
  roundNumber: number;
  name: string;
  status: "PENDING" | "ACTIVE" | "COMPLETED";
}

export interface AuctionConfig {
  id: number;
  name: string;
  seasonYear: number;
  sports: string[];
  status: AuctionStatus;
  registrationDeadline: string;
  registrationDeadlineAt?: string | null;
  clubBasePrice: number;
  nonClubBasePrice: number;
  sportBasePrices: Record<string, SportBasePriceOverride>;
  defaultIncrement: number;
  jumpIncrement: number;
  minSquadSize: number;
  maxSquadSize: number;
  minClubPlayers: number;
  minNonClubPlayers: number;
  playerTiers: string[];
  positionsBySport: Record<string, string[]>;
  activeRoundId: number | null;
  activeSport: string;
  currentPlayerId: number | null;
  projectorMode: "STAGE" | "SOLD" | "UNSOLD" | "STANDINGS" | "PAUSED";
  version: number;
  lastUpdatedAt: string;
}

export interface AuctionRegistration {
  id: number;
  auctionId: number;
  userId?: number;
  playerName: string;
  rollNumber?: string;
  yearLabel: string;
  branch: string;
  sport: string;
  positions: string[];
  playerClass: PlayerClass;
  basePrice: number;
  tier: string;
  roundId: number;
  status: AuctionPlayerStatus;
  soldToFranchiseId: number | null;
  soldPrice: number | null;
  statsSummary: string;
  photoUrl?: string | null;
}

export interface PurchasedPlayer {
  id: number;
  userId?: number;
  playerName: string;
  sport: string;
  positions: string[];
  soldPrice: number;
  playerClass: PlayerClass;
  photoUrl?: string | null;
}

export interface FranchiseSummary {
  id: number;
  auctionId: number;
  sport: string;
  slotNumber: number; // 1..8 within sport for keyboard hotkeys
  name: string;
  shortCode: string;
  accentColor: string;
  captainName: string;
  captainUserId?: number | null;
  startingPurse: number;
  totalPurse: number;
  spentPurse: number;
  remainingPurse: number;
  minSquadSize: number;
  maxSquadSize: number;
  minClubPlayers: number;
  minNonClubPlayers: number;
  squadCount: number;
  clubCount: number;
  nonClubCount: number;
  maxAllowedBid: number;
  isEligibleToBid: boolean;
  lockReason?: string;
  purchasedPlayers: PurchasedPlayer[];
}

export interface BidEvent {
  id: string;
  auctionId: number;
  roundId: number;
  playerId: number;
  playerName: string;
  franchiseId: number;
  franchiseName: string;
  amount: number;
  kind: "BID" | "JUMP_BID" | "UNDO" | "SOLD" | "UNSOLD" | "RTM";
  timestamp: string;
}

export interface LiveAuctionSnapshot {
  version: number;
  auction: AuctionConfig | null;
  rounds: AuctionRound[];
  registrations: AuctionRegistration[];
  franchises: FranchiseSummary[];
  bidHistory: BidEvent[];
  serverTime: string;
}

export interface LiveAuctionDelta {
  type: "AUCTION_DELTA";
  version: number;
  auction: AuctionConfig;
  rounds?: AuctionRound[];
  updatedRegistration?: AuctionRegistration | null;
  removedRegistrationId?: number | null;
  franchises: FranchiseSummary[];
  latestBidEvent?: BidEvent | null;
  bidHistoryTail?: BidEvent[];
  serverTime: string;
}
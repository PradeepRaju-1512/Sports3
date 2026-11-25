import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  rollNumber: text("roll_number"),
  batch: text("batch").notNull().default("3RD"),
  branch: text("branch").notNull().default("CSE"),
  role: text("role").notNull().default("STUDENT"), // STUDENT | CLUB_MEMBER | CAPTAIN | CLUB_COORDINATOR | CLUB_SECRETARY | MATCH_SCORER | AUCTION_OPERATOR | SPORTS_SECRETARY | FACULTY_ADVISOR
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notices = pgTable("notices", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  category: text("category").notNull().default("GENERAL"),
  isUrgentBanner: boolean("is_urgent_banner").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sportsClubs = pgTable("sports_clubs", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  groupType: text("group_type").notNull(),
  description: text("description").notNull(),
  venue: text("venue").notNull(),
  inductionOpen: boolean("induction_open").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const clubMemberships = pgTable(
  "club_memberships",
  {
    id: serial("id").primaryKey(),
    clubId: integer("club_id")
      .notNull()
      .references(() => sportsClubs.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    memberRole: text("member_role").notNull().default("MEMBER"), // SECRETARY | COORDINATOR | MEMBER
    batchScope: text("batch_scope").notNull().default("ALL"), // 1ST | 2ND | 3RD | 4TH | MTECH | ALL
    status: text("status").notNull().default("INDUCTED"), // APPLIED | TRIAL_ATTENDED | INDUCTED | REJECTED
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("club_memberships_club_idx").on(table.clubId),
    index("club_memberships_user_idx").on(table.userId),
    uniqueIndex("club_memberships_club_user_uniq").on(
      table.clubId,
      table.userId
    ),
  ]
);

export const clubActivities = pgTable(
  "club_activities",
  {
    id: serial("id").primaryKey(),
    clubId: integer("club_id")
      .notNull()
      .references(() => sportsClubs.id, { onDelete: "cascade" }),
    activityType: text("activity_type").notNull(),
    targetBatch: text("target_batch").notNull(),
    categoryGender: text("category_gender").notNull(),
    scheduledLabel: text("scheduled_label").notNull(),
    scheduledAt: timestamp("scheduled_at"),
    venue: text("venue").notNull(),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("club_activities_club_idx").on(table.clubId)]
);

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clubId: integer("club_id").references(() => sportsClubs.id, {
      onDelete: "set null",
    }),
    message: text("message").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notifications_user_idx").on(table.userId),
    index("notifications_club_idx").on(table.clubId),
  ]
);

// --- SLICE 2: TOURNAMENTS, STANDINGS, MATCHES, TEAM SUBMISSIONS & ARCHIVE ---

export const tournaments = pgTable("tournaments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  year: integer("year").notNull(),
  semester: text("semester").notNull(), // ODD | EVEN
  tournamentType: text("tournament_type").notNull(), // PROTHYMOS | INTER_BATCH
  competitionFormat: text("competition_format").notNull(), // LEAGUE_KNOCKOUT | KNOCKOUT | ROUND_ROBIN
  dateRange: text("date_range").notNull(),
  structureNotes: text("structure_notes").notNull(),
  sportsIncluded: text("sports_included").notNull(), // comma-separated sport names
  status: text("status").notNull().default("UPCOMING"), // UPCOMING | CURRENT | ARCHIVED
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tournamentTeams = pgTable(
  "tournament_teams",
  {
    id: serial("id").primaryKey(),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    sportName: text("sport_name").notNull(),
    teamName: text("team_name").notNull(),
    captainUserId: integer("captain_user_id").references(() => users.id),
    placement: text("placement"), // WINNER | RUNNER_UP_1 | RUNNER_UP_2 | NONE
    played: integer("played").notNull().default(0),
    won: integer("won").notNull().default(0),
    lost: integer("lost").notNull().default(0),
    drawn: integer("drawn").notNull().default(0),
    points: integer("points").notNull().default(0),
    nrrOrDiff: text("nrr_or_diff").notNull().default("0.00"),
  },
  (table) => [
    index("tournament_teams_tournament_idx").on(table.tournamentId),
    index("tournament_teams_captain_idx").on(table.captainUserId),
  ]
);

export const teamRosterMembers = pgTable(
  "team_roster_members",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => tournamentTeams.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    playerName: text("player_name").notNull(),
    playerRole: text("player_role").notNull(),
    batchYear: text("batch_year").notNull(),
    branch: text("branch").notNull(),
  },
  (table) => [
    index("team_roster_members_team_idx").on(table.teamId),
    index("team_roster_members_user_idx").on(table.userId),
  ]
);

export const teamSubmissions = pgTable(
  "team_submissions",
  {
    id: serial("id").primaryKey(),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    teamId: integer("team_id").references(() => tournamentTeams.id, {
      onDelete: "set null",
    }),
    sportName: text("sport_name").notNull(),
    teamName: text("team_name").notNull(),
    captainUserId: integer("captain_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("DRAFT"), // DRAFT | SUBMITTED | APPROVED | LOCKED | CHANGES_REQUESTED
    playersJson: text("players_json").notNull().default("[]"),
    reviewerNotes: text("reviewer_notes").notNull().default(""),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("team_submissions_tournament_idx").on(table.tournamentId),
    index("team_submissions_captain_idx").on(table.captainUserId),
  ]
);

export const tournamentMatches = pgTable(
  "tournament_matches",
  {
    id: serial("id").primaryKey(),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    sportName: text("sport_name").notNull(),
    stage: text("stage").notNull(), // Final | Semi-Final | Quarter-Final | Group Match
    matchOrder: integer("match_order").notNull().default(1), // Higher = later stage (Final is highest)
    teamA: text("team_a").notNull(),
    teamB: text("team_b").notNull(),
    scoreA: text("score_a").notNull().default("0"),
    scoreB: text("score_b").notNull().default("0"),
    status: text("status").notNull().default("UPCOMING"), // LIVE | UPCOMING | COMPLETED
    scheduledTime: text("scheduled_time").notNull(),
    scheduledAt: timestamp("scheduled_at"),
    venue: text("venue").notNull(),
    resultSummary: text("result_summary").notNull().default("Scheduled"),
    detailedBreakdown: text("detailed_breakdown").notNull().default(""),
    scoringEventsJson: text("scoring_events_json"),
    scoringStateJson: text("scoring_state_json"),
    lineupAJson: text("lineup_a_json"),
    lineupBJson: text("lineup_b_json"),
    scorerUserId: integer("scorer_user_id").references(() => users.id),
  },
  (table) => [
    index("tournament_matches_tournament_idx").on(table.tournamentId),
    index("tournament_matches_scorer_idx").on(table.scorerUserId),
    index("tournament_matches_status_idx").on(table.status),
  ]
);

// --- SLICE 3: AUCTIONS, ROUNDS, PER-SPORT FRANCHISES, REGISTRATIONS & BID LOG ---

export const auctions = pgTable("auctions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  seasonYear: integer("season_year").notNull().default(2027),
  sportsJson: text("sports_json").notNull().default("[]"),
  status: text("status").notNull().default("REGISTRATION_OPEN"),
  registrationDeadline: text("registration_deadline").notNull().default(""),
  registrationDeadlineAt: timestamp("registration_deadline_at"),
  clubBasePrice: integer("club_base_price").notNull().default(10000),
  nonClubBasePrice: integer("non_club_base_price").notNull().default(5000),
  sportBasePricesJson: text("sport_base_prices_json").notNull().default("{}"),
  defaultIncrement: integer("default_increment").notNull().default(1000),
  jumpIncrement: integer("jump_increment").notNull().default(5000),
  minSquadSize: integer("min_squad_size").notNull().default(8),
  maxSquadSize: integer("max_squad_size").notNull().default(15),
  minClubPlayers: integer("min_club_players").notNull().default(3),
  minNonClubPlayers: integer("min_non_club_players").notNull().default(2),
  playerTiersJson: text("player_tiers_json")
    .notNull()
    .default('["MARQUEE","TIER_1","TIER_2","UNCAPPED"]'),
  positionsBySportJson: text("positions_by_sport_json").notNull().default("{}"),
  activeRoundId: integer("active_round_id"),
  activeSport: text("active_sport").notNull().default("Cricket"),
  currentPlayerId: integer("current_player_id"),
  projectorMode: text("projector_mode").notNull().default("STAGE"),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const auctionRounds = pgTable(
  "auction_rounds",
  {
    id: serial("id").primaryKey(),
    auctionId: integer("auction_id").notNull().default(1),
    roundNumber: integer("round_number").notNull().default(1),
    name: text("name").notNull(),
    status: text("status").notNull().default("PENDING"), // PENDING | ACTIVE | COMPLETED
  },
  (table) => [index("auction_rounds_auction_idx").on(table.auctionId)]
);

export const auctionFranchises = pgTable(
  "auction_franchises",
  {
    id: serial("id").primaryKey(),
    auctionId: integer("auction_id").notNull().default(1),
    sport: text("sport").notNull(),
    slotNumber: integer("slot_number").notNull().default(1),
    name: text("name").notNull(),
    shortCode: text("short_code").notNull(),
    accentColor: text("accent_color").notNull().default("#d4a038"),
    captainName: text("captain_name").notNull().default(""),
    captainUserId: integer("captain_user_id").references(() => users.id),
    startingPurse: integer("starting_purse").notNull().default(150000),
    minSquadSize: integer("min_squad_size"),
    maxSquadSize: integer("max_squad_size"),
    minClubPlayers: integer("min_club_players"),
    minNonClubPlayers: integer("min_non_club_players"),
  },
  (table) => [
    index("auction_franchises_auction_sport_idx").on(
      table.auctionId,
      table.sport
    ),
  ]
);

export const auctionRegistrations = pgTable(
  "auction_registrations",
  {
    id: serial("id").primaryKey(),
    auctionId: integer("auction_id").notNull().default(1),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    playerName: text("player_name").notNull(),
    rollNumber: text("roll_number").notNull().default("IIITT"),
    yearLabel: text("year_label").notNull(),
    branch: text("branch").notNull(),
    sport: text("sport").notNull(),
    positionsJson: text("positions_json").notNull().default("[]"),
    playerClass: text("player_class").notNull().default("NON_CLUB"), // CLUB | NON_CLUB
    basePrice: integer("base_price").notNull().default(5000),
    tier: text("tier").notNull().default("UNCAPPED"),
    roundId: integer("round_id").notNull().default(1),
    status: text("status").notNull().default("ELIGIBLE"), // REGISTERED | ELIGIBLE | IN_AUCTION | SOLD | UNSOLD | RE_AUCTIONED | INELIGIBLE
    soldToFranchiseId: integer("sold_to_franchise_id"),
    soldPrice: integer("sold_price"),
    statsSummary: text("stats_summary").notNull().default(""),
    photoUrl: text("photo_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("auction_reg_auction_idx").on(table.auctionId),
    index("auction_reg_user_idx").on(table.userId),
    index("auction_reg_franchise_idx").on(table.soldToFranchiseId),
    uniqueIndex("auction_reg_unique_user_sport").on(
      table.auctionId,
      table.userId,
      table.sport
    ),
  ]
);

export const auctionBidEvents = pgTable(
  "auction_bid_events",
  {
    id: serial("id").primaryKey(),
    eventKey: text("event_key").notNull().unique(),
    auctionId: integer("auction_id").notNull().default(1),
    roundId: integer("round_id"),
    playerId: integer("player_id")
      .notNull()
      .references(() => auctionRegistrations.id, { onDelete: "cascade" }),
    playerName: text("player_name").notNull(),
    franchiseId: integer("franchise_id"),
    franchiseName: text("franchise_name"),
    amount: integer("amount").notNull().default(0),
    kind: text("kind").notNull(), // BID | SOLD | UNSOLD | UNDO | NOMINATE
    isUndone: boolean("is_undone").notNull().default(false),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("auction_bid_events_auction_idx").on(table.auctionId),
    index("auction_bid_events_player_idx").on(table.playerId),
  ]
);

export const playerPhotos = pgTable("player_photos", {
  id: serial("id").primaryKey(),
  publicKey: text("public_key").notNull().unique(),
  uploadedByUserId: integer("uploaded_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  mimeType: text("mime_type").notNull(),
  dataBase64: text("data_base64").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
CREATE TABLE "auction_bid_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_key" text NOT NULL,
	"auction_id" integer DEFAULT 1 NOT NULL,
	"round_id" integer,
	"player_id" integer NOT NULL,
	"player_name" text NOT NULL,
	"franchise_id" integer,
	"franchise_name" text,
	"amount" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"is_undone" boolean DEFAULT false NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auction_bid_events_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE TABLE "auction_franchises" (
	"id" serial PRIMARY KEY NOT NULL,
	"auction_id" integer DEFAULT 1 NOT NULL,
	"sport" text NOT NULL,
	"slot_number" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"short_code" text NOT NULL,
	"accent_color" text DEFAULT '#d4a038' NOT NULL,
	"captain_name" text DEFAULT '' NOT NULL,
	"captain_user_id" integer,
	"starting_purse" integer DEFAULT 150000 NOT NULL,
	"min_squad_size" integer,
	"max_squad_size" integer,
	"min_club_players" integer,
	"min_non_club_players" integer
);
--> statement-breakpoint
CREATE TABLE "auction_idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"auction_id" integer DEFAULT 1 NOT NULL,
	"status_code" integer DEFAULT 200 NOT NULL,
	"response_json" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auction_operators" (
	"id" serial PRIMARY KEY NOT NULL,
	"auction_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"assigned_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auction_registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"auction_id" integer DEFAULT 1 NOT NULL,
	"user_id" integer NOT NULL,
	"player_name" text NOT NULL,
	"roll_number" text DEFAULT 'IIITT' NOT NULL,
	"year_label" text NOT NULL,
	"branch" text NOT NULL,
	"sport" text NOT NULL,
	"positions_json" text DEFAULT '[]' NOT NULL,
	"player_class" text DEFAULT 'NON_CLUB' NOT NULL,
	"base_price" integer DEFAULT 5000 NOT NULL,
	"tier" text DEFAULT 'UNCAPPED' NOT NULL,
	"round_id" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'ELIGIBLE' NOT NULL,
	"sold_to_franchise_id" integer,
	"sold_price" integer,
	"stats_summary" text DEFAULT '' NOT NULL,
	"photo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auction_rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"auction_id" integer DEFAULT 1 NOT NULL,
	"round_number" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auctions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"season_year" integer DEFAULT 2027 NOT NULL,
	"sports_json" text DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'REGISTRATION_OPEN' NOT NULL,
	"registration_deadline" text DEFAULT '' NOT NULL,
	"registration_deadline_at" timestamp,
	"club_base_price" integer DEFAULT 10000 NOT NULL,
	"non_club_base_price" integer DEFAULT 5000 NOT NULL,
	"sport_base_prices_json" text DEFAULT '{}' NOT NULL,
	"default_increment" integer DEFAULT 1000 NOT NULL,
	"jump_increment" integer DEFAULT 5000 NOT NULL,
	"min_squad_size" integer DEFAULT 8 NOT NULL,
	"max_squad_size" integer DEFAULT 15 NOT NULL,
	"min_club_players" integer DEFAULT 3 NOT NULL,
	"min_non_club_players" integer DEFAULT 2 NOT NULL,
	"player_tiers_json" text DEFAULT '["MARQUEE","TIER_1","TIER_2","UNCAPPED"]' NOT NULL,
	"positions_by_sport_json" text DEFAULT '{}' NOT NULL,
	"active_round_id" integer,
	"active_sport" text DEFAULT 'Cricket' NOT NULL,
	"current_player_id" integer,
	"projector_mode" text DEFAULT 'STAGE' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"club_id" integer NOT NULL,
	"activity_type" text NOT NULL,
	"target_batch" text NOT NULL,
	"category_gender" text NOT NULL,
	"scheduled_label" text NOT NULL,
	"scheduled_at" timestamp,
	"venue" text NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"club_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"member_role" text DEFAULT 'MEMBER' NOT NULL,
	"batch_scope" text DEFAULT 'ALL' NOT NULL,
	"status" text DEFAULT 'INDUCTED' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"category" text DEFAULT 'GENERAL' NOT NULL,
	"is_urgent_banner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"club_id" integer,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"uploaded_by_user_id" integer,
	"mime_type" text NOT NULL,
	"data_base64" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "player_photos_public_key_unique" UNIQUE("public_key")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"show_auction_in_nav" boolean DEFAULT true NOT NULL,
	"show_live_auction_in_nav" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sports_clubs" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"group_type" text NOT NULL,
	"description" text NOT NULL,
	"venue" text NOT NULL,
	"induction_open" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sports_clubs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "team_roster_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"user_id" integer,
	"player_name" text NOT NULL,
	"player_role" text NOT NULL,
	"batch_year" text NOT NULL,
	"branch" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"team_id" integer,
	"sport_name" text NOT NULL,
	"team_name" text NOT NULL,
	"captain_user_id" integer NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"players_json" text DEFAULT '[]' NOT NULL,
	"reviewer_notes" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"sport_name" text NOT NULL,
	"stage" text NOT NULL,
	"match_order" integer DEFAULT 1 NOT NULL,
	"team_a" text NOT NULL,
	"team_b" text NOT NULL,
	"score_a" text DEFAULT '0' NOT NULL,
	"score_b" text DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'UPCOMING' NOT NULL,
	"scheduled_time" text NOT NULL,
	"scheduled_at" timestamp,
	"venue" text NOT NULL,
	"result_summary" text DEFAULT 'Scheduled' NOT NULL,
	"detailed_breakdown" text DEFAULT '' NOT NULL,
	"scoring_events_json" text,
	"scoring_state_json" text,
	"lineup_a_json" text,
	"lineup_b_json" text,
	"version" integer DEFAULT 1 NOT NULL,
	"clock_anchor_ms" bigint,
	"clock_accumulated_ms" integer DEFAULT 0 NOT NULL,
	"clock_running" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"scorer_user_id" integer
);
--> statement-breakpoint
CREATE TABLE "tournament_teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"sport_name" text NOT NULL,
	"team_name" text NOT NULL,
	"captain_user_id" integer,
	"placement" text,
	"played" integer DEFAULT 0 NOT NULL,
	"won" integer DEFAULT 0 NOT NULL,
	"lost" integer DEFAULT 0 NOT NULL,
	"drawn" integer DEFAULT 0 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"nrr_or_diff" text DEFAULT '0.00' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"year" integer NOT NULL,
	"semester" text NOT NULL,
	"tournament_type" text NOT NULL,
	"competition_format" text NOT NULL,
	"date_range" text NOT NULL,
	"structure_notes" text NOT NULL,
	"sports_included" text NOT NULL,
	"status" text DEFAULT 'UPCOMING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"roll_number" text,
	"batch" text DEFAULT '3RD' NOT NULL,
	"branch" text DEFAULT 'CSE' NOT NULL,
	"role" text DEFAULT 'STUDENT' NOT NULL,
	"password_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "auction_bid_events" ADD CONSTRAINT "auction_bid_events_player_id_auction_registrations_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."auction_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_bid_events" ADD CONSTRAINT "auction_bid_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_franchises" ADD CONSTRAINT "auction_franchises_captain_user_id_users_id_fk" FOREIGN KEY ("captain_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_operators" ADD CONSTRAINT "auction_operators_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_operators" ADD CONSTRAINT "auction_operators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_operators" ADD CONSTRAINT "auction_operators_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_registrations" ADD CONSTRAINT "auction_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_activities" ADD CONSTRAINT "club_activities_club_id_sports_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."sports_clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_activities" ADD CONSTRAINT "club_activities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_club_id_sports_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."sports_clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_club_id_sports_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."sports_clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_photos" ADD CONSTRAINT "player_photos_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_roster_members" ADD CONSTRAINT "team_roster_members_team_id_tournament_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_roster_members" ADD CONSTRAINT "team_roster_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_submissions" ADD CONSTRAINT "team_submissions_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_submissions" ADD CONSTRAINT "team_submissions_team_id_tournament_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_submissions" ADD CONSTRAINT "team_submissions_captain_user_id_users_id_fk" FOREIGN KEY ("captain_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_scorer_user_id_users_id_fk" FOREIGN KEY ("scorer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_captain_user_id_users_id_fk" FOREIGN KEY ("captain_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auction_bid_events_auction_idx" ON "auction_bid_events" USING btree ("auction_id");--> statement-breakpoint
CREATE INDEX "auction_bid_events_player_idx" ON "auction_bid_events" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "auction_franchises_auction_sport_idx" ON "auction_franchises" USING btree ("auction_id","sport");--> statement-breakpoint
CREATE INDEX "auction_idempotency_expires_idx" ON "auction_idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auction_operators_auction_idx" ON "auction_operators" USING btree ("auction_id");--> statement-breakpoint
CREATE INDEX "auction_operators_user_idx" ON "auction_operators" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auction_operators_unique" ON "auction_operators" USING btree ("auction_id","user_id");--> statement-breakpoint
CREATE INDEX "auction_reg_auction_idx" ON "auction_registrations" USING btree ("auction_id");--> statement-breakpoint
CREATE INDEX "auction_reg_user_idx" ON "auction_registrations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auction_reg_franchise_idx" ON "auction_registrations" USING btree ("sold_to_franchise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auction_reg_unique_user_sport" ON "auction_registrations" USING btree ("auction_id","user_id","sport");--> statement-breakpoint
CREATE INDEX "auction_rounds_auction_idx" ON "auction_rounds" USING btree ("auction_id");--> statement-breakpoint
CREATE INDEX "club_activities_club_idx" ON "club_activities" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "club_memberships_club_idx" ON "club_memberships" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "club_memberships_user_idx" ON "club_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "club_memberships_club_user_uniq" ON "club_memberships" USING btree ("club_id","user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_club_idx" ON "notifications" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "player_photos_user_idx" ON "player_photos" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "team_roster_members_team_idx" ON "team_roster_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_roster_members_user_idx" ON "team_roster_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_submissions_tournament_idx" ON "team_submissions" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "team_submissions_captain_idx" ON "team_submissions" USING btree ("captain_user_id");--> statement-breakpoint
CREATE INDEX "tournament_matches_tournament_idx" ON "tournament_matches" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournament_matches_scorer_idx" ON "tournament_matches" USING btree ("scorer_user_id");--> statement-breakpoint
CREATE INDEX "tournament_matches_status_idx" ON "tournament_matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tournament_teams_tournament_idx" ON "tournament_teams" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournament_teams_captain_idx" ON "tournament_teams" USING btree ("captain_user_id");
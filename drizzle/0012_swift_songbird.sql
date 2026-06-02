CREATE TYPE "public"."season_status" AS ENUM('active', 'ended');--> statement-breakpoint
ALTER TYPE "public"."tx_type" ADD VALUE 'season_reward';--> statement-breakpoint
CREATE TABLE "season_reward_claims" (
	"userId" text NOT NULL,
	"tierId" uuid NOT NULL,
	"seasonId" uuid NOT NULL,
	"amount" integer NOT NULL,
	"claimedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "season_reward_claims_userId_tierId_pk" PRIMARY KEY("userId","tierId")
);
--> statement-breakpoint
CREATE TABLE "season_reward_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seasonId" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"nameHe" text NOT NULL,
	"goalAmount" integer NOT NULL,
	"rewardAmount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nameHe" text NOT NULL,
	"startAt" timestamp NOT NULL,
	"endAt" timestamp NOT NULL,
	"status" "season_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "searchText" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "season_reward_claims" ADD CONSTRAINT "season_reward_claims_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_reward_claims" ADD CONSTRAINT "season_reward_claims_tierId_season_reward_tiers_id_fk" FOREIGN KEY ("tierId") REFERENCES "public"."season_reward_tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_reward_claims" ADD CONSTRAINT "season_reward_claims_seasonId_seasons_id_fk" FOREIGN KEY ("seasonId") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_reward_tiers" ADD CONSTRAINT "season_reward_tiers_seasonId_seasons_id_fk" FOREIGN KEY ("seasonId") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "season_reward_claims_user_idx" ON "season_reward_claims" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "season_reward_tiers_season_ordinal_uq" ON "season_reward_tiers" USING btree ("seasonId","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_one_active_uq" ON "seasons" USING btree ("status") WHERE "seasons"."status" = 'active';--> statement-breakpoint
CREATE INDEX "markets_searchtext_trgm_idx" ON "markets" USING gin ("searchText" gin_trgm_ops);
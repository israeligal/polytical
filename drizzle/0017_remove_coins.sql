-- 0017_remove_coins: delete the coin economy (ledger, balance, pools, payouts,
-- faucet, streaks, season coin rewards). A "bet" becomes a stake-less prediction;
-- on resolve we tally right/wrong onto the user. Seasons -> accuracy tracks;
-- cards unlock by accuracy (card_progress).
--
-- PROD-SAFETY PRECLEAN (must run first): the notification_type enum loses
-- 'season_reward'. Delete rows / scrub array elements holding it BEFORE the enum
-- is rebuilt below, or the cast-back to the new enum fails on the live DB.
-- No-op on a fresh PGlite test DB (these tables are empty).
DELETE FROM "notifications" WHERE "type" = 'season_reward';--> statement-breakpoint
UPDATE "user" SET "mutedPushTypes" = array_remove("mutedPushTypes", 'season_reward');--> statement-breakpoint
CREATE TABLE "card_progress" (
	"userId" text NOT NULL,
	"personId" integer NOT NULL,
	"correctCount" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "card_progress_userId_personId_pk" PRIMARY KEY("userId","personId")
);
--> statement-breakpoint
ALTER TABLE "season_reward_claims" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "season_reward_claims" CASCADE;--> statement-breakpoint
DROP TABLE "transactions" CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."notification_type";--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('bet_won', 'market_resolved', 'suggestion_approved', 'suggestion_rejected', 'market_voided', 'market_closing_soon');--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "type" SET DATA TYPE "public"."notification_type" USING "type"::"public"."notification_type";--> statement-breakpoint
ALTER TABLE "card_progress" ADD CONSTRAINT "card_progress_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bets_user_market_uq" ON "bets" USING btree ("userId","marketId");--> statement-breakpoint
ALTER TABLE "bets" DROP COLUMN "amount";--> statement-breakpoint
ALTER TABLE "bets" DROP COLUMN "payout";--> statement-breakpoint
ALTER TABLE "bets" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "outcomes" DROP COLUMN "poolTotal";--> statement-breakpoint
ALTER TABLE "season_reward_tiers" DROP COLUMN "rewardAmount";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "balance";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "lastFaucetAt";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "streakCount";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "bestStreak";--> statement-breakpoint
DROP TYPE "public"."bet_status";--> statement-breakpoint
DROP TYPE "public"."tx_type";
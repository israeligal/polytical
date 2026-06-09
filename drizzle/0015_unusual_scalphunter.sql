ALTER TYPE "public"."notification_type" ADD VALUE 'season_reward';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'market_voided';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'market_closing_soon';--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "closingSoonNotifiedAt" timestamp;
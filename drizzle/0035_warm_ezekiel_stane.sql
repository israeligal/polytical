ALTER TYPE "public"."notification_type" ADD VALUE 'duel_settled';--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "refChallengeId" uuid;
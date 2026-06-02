CREATE TYPE "public"."notification_type" AS ENUM('bet_won', 'market_resolved', 'suggestion_approved', 'suggestion_rejected');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"titleHe" text NOT NULL,
	"bodyHe" text NOT NULL,
	"refMarketId" uuid,
	"refBetId" uuid,
	"refSuggestionId" uuid,
	"read" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bets" ADD COLUMN "seenAt" timestamp;--> statement-breakpoint
UPDATE "bets" SET "seenAt" = now() WHERE "status" <> 'open';--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("userId") WHERE "notifications"."read" = false;
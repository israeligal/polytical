CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "market_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"questionHe" text NOT NULL,
	"category" text NOT NULL,
	"personId" integer,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"reviewNote" text,
	"reviewedBy" text,
	"reviewedAt" timestamp,
	"marketId" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_suggestions" ADD CONSTRAINT "market_suggestions_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_suggestions" ADD CONSTRAINT "market_suggestions_reviewedBy_user_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_suggestions" ADD CONSTRAINT "market_suggestions_marketId_markets_id_fk" FOREIGN KEY ("marketId") REFERENCES "public"."markets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_suggestions_status_idx" ON "market_suggestions" USING btree ("status","createdAt");
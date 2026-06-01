CREATE TYPE "public"."bet_status" AS ENUM('open', 'won', 'lost', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."market_status" AS ENUM('draft', 'open', 'closed', 'resolved', 'voided');--> statement-breakpoint
CREATE TYPE "public"."market_type" AS ENUM('binary', 'multi');--> statement-breakpoint
CREATE TABLE "bets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"marketId" uuid NOT NULL,
	"outcomeId" uuid NOT NULL,
	"amount" integer NOT NULL,
	"payout" integer DEFAULT 0 NOT NULL,
	"status" "bet_status" DEFAULT 'open' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_politicians" (
	"marketId" uuid NOT NULL,
	"personId" integer NOT NULL,
	CONSTRAINT "market_politicians_marketId_personId_pk" PRIMARY KEY("marketId","personId")
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"questionHe" text NOT NULL,
	"descriptionHe" text,
	"category" text NOT NULL,
	"type" "market_type" DEFAULT 'binary' NOT NULL,
	"status" "market_status" DEFAULT 'open' NOT NULL,
	"hot" boolean DEFAULT false NOT NULL,
	"openAt" timestamp DEFAULT now() NOT NULL,
	"closeAt" timestamp NOT NULL,
	"resolvedOutcomeId" uuid,
	"resolutionSourceUrl" text,
	"resolutionNote" text,
	"resolvedAt" timestamp,
	"createdBy" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketId" uuid NOT NULL,
	"labelHe" text NOT NULL,
	"poolTotal" integer DEFAULT 0 NOT NULL,
	"cat" integer,
	"ordinal" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_marketId_markets_id_fk" FOREIGN KEY ("marketId") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_outcomeId_outcomes_id_fk" FOREIGN KEY ("outcomeId") REFERENCES "public"."outcomes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_politicians" ADD CONSTRAINT "market_politicians_marketId_markets_id_fk" FOREIGN KEY ("marketId") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_marketId_markets_id_fk" FOREIGN KEY ("marketId") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bets_market_idx" ON "bets" USING btree ("marketId");--> statement-breakpoint
CREATE INDEX "bets_user_idx" ON "bets" USING btree ("userId");
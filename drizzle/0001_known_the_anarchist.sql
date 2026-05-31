CREATE TYPE "public"."tx_type" AS ENUM('grant', 'faucet', 'bet', 'payout', 'refund');--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"type" "tx_type" NOT NULL,
	"amount" integer NOT NULL,
	"balanceAfter" integer NOT NULL,
	"refMarketId" text,
	"refBetId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "balance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "lastFaucetAt" timestamp;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tx_user_created_idx" ON "transactions" USING btree ("userId","createdAt");
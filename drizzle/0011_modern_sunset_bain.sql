ALTER TYPE "public"."tx_type" ADD VALUE 'collect';--> statement-breakpoint
CREATE TABLE "card_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"personId" integer NOT NULL,
	"collectedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "handle" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "arena" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "onboardedAt" timestamp;--> statement-breakpoint
ALTER TABLE "card_collections" ADD CONSTRAINT "card_collections_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_collections_user_person_uq" ON "card_collections" USING btree ("userId","personId");--> statement-breakpoint
CREATE INDEX "card_collections_user_idx" ON "card_collections" USING btree ("userId");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_handle_unique" UNIQUE("handle");
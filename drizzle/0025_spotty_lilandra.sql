CREATE TYPE "public"."vote_item_desc_source" AS ENUM('summary_law', 'explanatory_notes', 'motion_text');--> statement-breakpoint
CREATE TABLE "vote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"itemId" integer NOT NULL,
	"itemTypeId" integer NOT NULL,
	"descriptionHe" text,
	"descriptionSource" "vote_item_desc_source",
	"legislationUrl" text,
	"docUrl" text,
	"docTypeDescHe" text,
	"initiatorPersonId" integer,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "vote_items_itemId_unique" UNIQUE("itemId")
);
--> statement-breakpoint
ALTER TABLE "politicians" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "knesset_votes" ADD COLUMN "itemTypeId" integer;--> statement-breakpoint
CREATE INDEX "vote_items_initiator_idx" ON "vote_items" USING btree ("initiatorPersonId");
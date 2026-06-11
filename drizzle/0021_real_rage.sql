CREATE TYPE "public"."agenda_item_source" AS ENUM('ingest', 'admin');--> statement-breakpoint
CREATE TYPE "public"."agenda_item_status" AS ENUM('announced', 'voted', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."knesset_vote_type" AS ENUM('electronic', 'hand', 'roll_call', 'secret');--> statement-breakpoint
CREATE TYPE "public"."mapping_status" AS ENUM('pending', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."mk_vote_result" AS ENUM('for', 'against', 'abstain', 'didnt_vote');--> statement-breakpoint
CREATE TYPE "public"."user_stance" AS ENUM('for', 'against');--> statement-breakpoint
CREATE TYPE "public"."vote_details_status" AS ENUM('pending_details', 'complete');--> statement-breakpoint
CREATE TABLE "agenda_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"itemId" integer,
	"titleHe" text NOT NULL,
	"expectedDate" date,
	"billId" integer,
	"status" "agenda_item_status" DEFAULT 'announced' NOT NULL,
	"addedBy" "agenda_item_source" NOT NULL,
	"linkedVoteId" integer,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agenda_items_itemId_unique" UNIQUE("itemId")
);
--> statement-breakpoint
CREATE TABLE "faction_stints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"personToPositionId" integer NOT NULL,
	"personId" integer NOT NULL,
	"factionId" integer NOT NULL,
	"knessetNum" integer NOT NULL,
	"startDate" timestamp NOT NULL,
	"finishDate" timestamp,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "faction_stints_personToPositionId_unique" UNIQUE("personToPositionId")
);
--> statement-breakpoint
CREATE TABLE "ingest_heartbeats" (
	"job" text PRIMARY KEY NOT NULL,
	"lastSuccessAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knesset_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voteId" integer NOT NULL,
	"knessetNum" integer NOT NULL,
	"itemId" integer,
	"billId" integer,
	"titleHe" text NOT NULL,
	"voteDate" timestamp NOT NULL,
	"voteType" "knesset_vote_type" NOT NULL,
	"decisionHe" text,
	"isAccepted" boolean,
	"totalFor" integer,
	"totalAgainst" integer,
	"totalAbstain" integer,
	"totalDidntVote" integer,
	"isDecisive" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"detailsStatus" "vote_details_status" DEFAULT 'pending_details' NOT NULL,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "knesset_votes_voteId_unique" UNIQUE("voteId")
);
--> statement-breakpoint
CREATE TABLE "mk_name_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nameKey" text NOT NULL,
	"personId" integer NOT NULL,
	"source" text NOT NULL,
	"verifiedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mk_name_mappings_nameKey_unique" UNIQUE("nameKey")
);
--> statement-breakpoint
CREATE TABLE "mk_votes" (
	"voteId" integer NOT NULL,
	"personId" integer NOT NULL,
	"result" "mk_vote_result" NOT NULL,
	"factionId" integer,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "mk_votes_voteId_personId_pk" PRIMARY KEY("voteId","personId")
);
--> statement-breakpoint
CREATE TABLE "mk_votes_raw" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voteId" integer NOT NULL,
	"mkNameRaw" text NOT NULL,
	"mkNameKey" text NOT NULL,
	"factionNameRaw" text,
	"voteResultIdRaw" integer NOT NULL,
	"resultTitleRaw" text NOT NULL,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "mk_votes_raw_vote_name_uq" UNIQUE("voteId","mkNameKey")
);
--> statement-breakpoint
CREATE TABLE "unmapped_mk_names" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nameKey" text NOT NULL,
	"nameRaw" text NOT NULL,
	"status" "mapping_status" DEFAULT 'pending' NOT NULL,
	"resolvedPersonId" integer,
	"reviewedBy" text,
	"reviewedAt" timestamp,
	"firstSeenAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unmapped_mk_names_nameKey_unique" UNIQUE("nameKey")
);
--> statement-breakpoint
CREATE TABLE "user_stances" (
	"userId" text NOT NULL,
	"voteId" integer NOT NULL,
	"stance" "user_stance" NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_stances_userId_voteId_pk" PRIMARY KEY("userId","voteId")
);
--> statement-breakpoint
ALTER TABLE "politicians" ADD COLUMN "mkSiteId" integer;--> statement-breakpoint
ALTER TABLE "unmapped_mk_names" ADD CONSTRAINT "unmapped_mk_names_reviewedBy_user_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stances" ADD CONSTRAINT "user_stances_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faction_stints_person_idx" ON "faction_stints" USING btree ("personId");--> statement-breakpoint
CREATE INDEX "knesset_votes_date_idx" ON "knesset_votes" USING btree ("voteDate");--> statement-breakpoint
CREATE INDEX "knesset_votes_item_idx" ON "knesset_votes" USING btree ("itemId");--> statement-breakpoint
CREATE INDEX "knesset_votes_bill_idx" ON "knesset_votes" USING btree ("billId");--> statement-breakpoint
CREATE INDEX "knesset_votes_featured_idx" ON "knesset_votes" USING btree ("voteDate") WHERE "knesset_votes"."featured" = true;--> statement-breakpoint
CREATE INDEX "mk_votes_person_idx" ON "mk_votes" USING btree ("personId");--> statement-breakpoint
CREATE INDEX "mk_votes_raw_name_idx" ON "mk_votes_raw" USING btree ("mkNameKey");--> statement-breakpoint
CREATE INDEX "user_stances_vote_idx" ON "user_stances" USING btree ("voteId");--> statement-breakpoint
ALTER TABLE "politicians" ADD CONSTRAINT "politicians_mkSiteId_unique" UNIQUE("mkSiteId");
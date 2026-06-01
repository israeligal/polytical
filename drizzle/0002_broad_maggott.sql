CREATE TABLE "bill_sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billInitiatorId" integer NOT NULL,
	"billId" integer NOT NULL,
	"personId" integer NOT NULL,
	"isInitiator" boolean DEFAULT false NOT NULL,
	"ordinal" integer,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "bill_sponsors_billInitiatorId_unique" UNIQUE("billInitiatorId"),
	CONSTRAINT "bill_sponsors_bill_person_init_uq" UNIQUE("billId","personId","isInitiator")
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billId" integer NOT NULL,
	"knessetNum" integer,
	"nameHe" text NOT NULL,
	"subTypeDesc" text,
	"statusId" integer,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "bills_billId_unique" UNIQUE("billId")
);
--> statement-breakpoint
CREATE TABLE "committee_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"committeeId" integer NOT NULL,
	"personId" integer NOT NULL,
	"positionId" integer NOT NULL,
	"startDate" date,
	"finishDate" date,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "committee_memberships_natural_uq" UNIQUE("committeeId","personId","positionId","startDate")
);
--> statement-breakpoint
CREATE TABLE "committees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"committeeId" integer NOT NULL,
	"nameHe" text NOT NULL,
	"categoryDesc" text,
	"knessetNum" integer,
	"committeeTypeDesc" text,
	"parentCommitteeId" integer,
	"isCurrent" boolean DEFAULT false NOT NULL,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "committees_committeeId_unique" UNIQUE("committeeId")
);
--> statement-breakpoint
CREATE TABLE "factions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factionId" integer NOT NULL,
	"nameHe" text NOT NULL,
	"knessetNum" integer,
	"isCurrent" boolean DEFAULT false NOT NULL,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "factions_factionId_unique" UNIQUE("factionId")
);
--> statement-breakpoint
CREATE TABLE "politicians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"personId" integer NOT NULL,
	"nameHe" text NOT NULL,
	"nameEn" text,
	"party" text,
	"factionId" integer,
	"roleHe" text,
	"inKnessetSince" date,
	"dob" date,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"searchName" text DEFAULT '' NOT NULL,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "politicians_personId_unique" UNIQUE("personId")
);
--> statement-breakpoint
CREATE TABLE "queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queryId" integer NOT NULL,
	"number" integer,
	"knessetNum" integer,
	"nameHe" text,
	"typeDesc" text,
	"statusId" integer,
	"personId" integer NOT NULL,
	"govMinistryId" integer,
	"submitDate" timestamp,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "queries_queryId_unique" UNIQUE("queryId")
);
--> statement-breakpoint
CREATE INDEX "bill_sponsors_person_idx" ON "bill_sponsors" USING btree ("personId");--> statement-breakpoint
CREATE INDEX "bill_sponsors_bill_idx" ON "bill_sponsors" USING btree ("billId");--> statement-breakpoint
CREATE INDEX "bills_knesset_idx" ON "bills" USING btree ("knessetNum");--> statement-breakpoint
CREATE INDEX "committee_memberships_person_idx" ON "committee_memberships" USING btree ("personId");--> statement-breakpoint
CREATE INDEX "committee_memberships_committee_idx" ON "committee_memberships" USING btree ("committeeId");--> statement-breakpoint
CREATE INDEX "politicians_faction_idx" ON "politicians" USING btree ("factionId");--> statement-breakpoint
CREATE INDEX "politicians_active_idx" ON "politicians" USING btree ("active");--> statement-breakpoint
CREATE INDEX "queries_person_idx" ON "queries" USING btree ("personId");
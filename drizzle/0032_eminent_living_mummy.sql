CREATE TABLE "bill_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"splitBillId" integer NOT NULL,
	"mainBillId" integer NOT NULL,
	"nameHe" text,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "bill_splits_splitBillId_unique" UNIQUE("splitBillId")
);
--> statement-breakpoint
CREATE TABLE "israel_law_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"israelLawId" integer NOT NULL,
	"billId" integer NOT NULL,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "israel_law_bills_law_bill_uq" UNIQUE("israelLawId","billId")
);
--> statement-breakpoint
CREATE TABLE "israel_law_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"israelLawId" integer NOT NULL,
	"classificationId" integer NOT NULL,
	"descHe" text NOT NULL,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "israel_law_topics_law_class_uq" UNIQUE("israelLawId","classificationId")
);
--> statement-breakpoint
CREATE TABLE "israel_laws" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"israelLawId" integer NOT NULL,
	"knessetNum" integer,
	"nameHe" text NOT NULL,
	"isBasicLaw" boolean,
	"isBudgetLaw" boolean,
	"isFavoriteLaw" boolean,
	"validityDesc" text,
	"publicationDate" timestamp,
	"validityStart" timestamp,
	"validityFinish" timestamp,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "israel_laws_israelLawId_unique" UNIQUE("israelLawId")
);
--> statement-breakpoint
CREATE INDEX "bill_splits_main_idx" ON "bill_splits" USING btree ("mainBillId");--> statement-breakpoint
CREATE INDEX "israel_law_bills_bill_idx" ON "israel_law_bills" USING btree ("billId");--> statement-breakpoint
CREATE INDEX "israel_law_topics_law_idx" ON "israel_law_topics" USING btree ("israelLawId");--> statement-breakpoint
CREATE INDEX "israel_laws_knesset_idx" ON "israel_laws" USING btree ("knessetNum");
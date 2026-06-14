ALTER TABLE "bills" ADD COLUMN "subTypeId" integer;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "privateNumber" integer;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "committeeId" integer;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "number" integer;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "publicationDate" timestamp;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "summaryLaw" text;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "isContinuationBill" boolean;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "publicationSeriesDesc" text;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "lastUpdatedDate" timestamp;
--> statement-breakpoint
CREATE TABLE "bill_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documentBillId" bigint NOT NULL,
	"billId" integer NOT NULL,
	"groupTypeId" integer,
	"groupTypeDesc" text,
	"format" text,
	"filePath" text NOT NULL,
	"lastUpdatedDate" timestamp,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "bill_documents_doc_format_uq" UNIQUE("documentBillId","format")
);
--> statement-breakpoint
CREATE TABLE "bill_statuses" (
	"statusId" integer PRIMARY KEY NOT NULL,
	"descHe" text NOT NULL,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bill_documents_bill_idx" ON "bill_documents" USING btree ("billId");

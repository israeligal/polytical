ALTER TABLE "politicians" ADD COLUMN "billsCurrent" integer;--> statement-breakpoint
ALTER TABLE "politicians" ADD COLUMN "billsLifetime" integer;--> statement-breakpoint
ALTER TABLE "politicians" ADD COLUMN "queriesCurrent" integer;--> statement-breakpoint
ALTER TABLE "politicians" ADD COLUMN "queriesLifetime" integer;--> statement-breakpoint
ALTER TABLE "politicians" ADD COLUMN "activityCountsFetchedAt" timestamp;
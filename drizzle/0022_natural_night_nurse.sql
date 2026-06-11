CREATE TABLE "ingest_heartbeats" (
	"job" text PRIMARY KEY NOT NULL,
	"lastSuccessAt" timestamp NOT NULL
);

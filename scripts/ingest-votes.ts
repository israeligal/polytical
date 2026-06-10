// Knesset plenum votes ingest — manual wrapper around app/lib/votes/service.
//
//   pnpm ingest:votes                  # incremental: last 7 days
//   pnpm ingest:votes:backfill         # full K25 (2022-11 → today); resumable/idempotent
//   pnpm ingest:votes -- --from=2026-03-01 --to=2026-03-31
//   ... --refetch                      # re-fetch details of complete votes too
//                                      # (e.g. after bills ingest, to fill billId)
//
// Attribution requires every mk_name_mappings row to carry verifiedAt (the
// P0-2 human gate) — the service throws UnverifiedMappingsError otherwise.

import { assertNonProductionDb } from "@/app/lib/db-guards";
import { logger } from "@/app/lib/logger";
import { ingestVotes, ingestRecentVotes } from "@/app/lib/votes/service";

const K25_START = "2022-11-15";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  assertNonProductionDb(); // FIRST — house rule (NB: the single prod DB passes; runs are deliberate + idempotent)

  const backfill = flag("backfill");
  const refetchDetails = flag("refetch");
  const from = arg("from");
  const to = arg("to");
  const today = new Date().toISOString().slice(0, 10);

  if (backfill || (from && to)) {
    const fromDate = from ?? K25_START;
    const toDate = to ?? today;
    logger.info("votes.ingest.start", { mode: backfill ? "backfill" : "window", fromDate, toDate, refetchDetails });
    await ingestVotes({ fromDate, toDate, refetchDetails });
  } else {
    logger.info("votes.ingest.start", { mode: "incremental" });
    await ingestRecentVotes();
  }
  process.exit(0);
}

main().catch((err) => {
  logger.error("votes.ingest.failed", { err: String(err) });
  process.exit(1);
});

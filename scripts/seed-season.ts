import { assertNonProductionDb } from "@/app/lib/db-guards";
import { logger } from "@/app/lib/logger";
import { createSeason } from "@/app/lib/seasons/service";
import { getActiveSeason } from "@/app/lib/seasons/repo";

// Seeds one active season (~30 days) with four increasing-accuracy tiers (goal =
// # correct predictions in the window) into the DEV database.
// assertNonProductionDb() guards against ever touching prod.
async function main() {
  assertNonProductionDb();

  const existing = await getActiveSeason();
  if (existing) {
    logger.info("seed_season_skip", { reason: "active season exists", id: existing.id });
    console.log("An active season already exists — nothing to seed:", existing.nameHe);
    return;
  }

  const now = Date.now();
  const startAt = new Date(now);
  const endAt = new Date(now + 30 * 24 * 60 * 60 * 1000);

  const { seasonId } = await createSeason({
    nameHe: "עונת הפתיחה",
    startAt,
    endAt,
    tiers: [
      { nameHe: "מתחילים", goalCorrect: 1 },
      { nameHe: "מנחשים", goalCorrect: 3 },
      { nameHe: "חזאים", goalCorrect: 7 },
      { nameHe: "אלופי העונה", goalCorrect: 15 },
    ],
  });

  logger.info("seed_season_ok", { seasonId });
  console.log("Seeded season:", seasonId);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error("seed_season_failed", { err: String(e) });
    process.exit(1);
  });

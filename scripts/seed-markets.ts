import { ilike, or } from "drizzle-orm";
import { assertNonProductionDb } from "@/app/lib/db-guards";
import { db } from "@/app/lib/db";
import { logger } from "@/app/lib/logger";
import { politicians } from "@/app/lib/schema";
import * as repo from "@/app/lib/markets/repo";

// Seeds ~6 real markets over real MKs into the DEV database.
//
// Featured MKs are resolved by NAME at runtime (discovery only) against the
// `politicians` table — the system of record (current Knesset members ingested
// from official OData). The `searchName` column is unaccented/normalized (niqqud,
// final letters and particles stripped), so we match both `nameHe` and
// `searchName` and only attach personIds that actually resolve. A name with no
// match (e.g. a minister not seated as an MK) is skipped, never invented.

const CLOSE_WEEKS = (weeks: number): Date =>
  new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000);

/** Looks up a single MK by Hebrew-name fragment; returns personId or null. */
async function findPersonId(query: string): Promise<number | null> {
  const rows = await db
    .select({ personId: politicians.personId, nameHe: politicians.nameHe })
    .from(politicians)
    .where(or(ilike(politicians.searchName, `%${query}%`), ilike(politicians.nameHe, `%${query}%`)))
    .limit(1);
  const hit = rows[0];
  if (!hit) {
    logger.warn("seed.markets.mk_not_found", { query });
    return null;
  }
  logger.info("seed.markets.mk_resolved", { query, personId: hit.personId, nameHe: hit.nameHe });
  return hit.personId;
}

/** Resolves several name fragments to personIds, dropping any that don't match. */
async function findPersonIds(queries: string[]): Promise<number[]> {
  const ids = await Promise.all(queries.map(findPersonId));
  return ids.filter((id): id is number => id !== null);
}

async function main() {
  assertNonProductionDb(); // FIRST — refuse to mutate production

  // Discover real featured MKs (only those present in the current roster attach).
  const netanyahu = await findPersonIds(["נתניהו"]);
  const netanyahuLapid = await findPersonIds(["נתניהו", "לפיד"]);
  // Finance-ministry candidates resolved INDIVIDUALLY — each multi outcome
  // links to its own politician (findPersonIds drops misses, which would shift
  // a shared array's index↔candidate mapping).
  const libermanId = await findPersonId("ליברמן");
  const katzId = await findPersonId("כץ");
  const gantz = await findPersonIds(["גנץ"]);
  const benGvir = await findPersonIds(["בן גביר"]);
  const ohana = await findPersonIds(["אוחנה"]);

  const seeds: Parameters<typeof repo.createMarket>[0][] = [
    {
      questionHe: "האם הקואליציה תשרוד את מושב הקיץ?",
      descriptionHe: "ייקבע לפי הרכב הקואליציה בתום מושב הקיץ של הכנסת ה-25.",
      category: "coalition",
      type: "binary",
      hot: true,
      closeAt: CLOSE_WEEKS(8),
      personIds: netanyahu,
      outcomes: [
        { labelHe: "כן", ordinal: 0 },
        { labelHe: "לא", ordinal: 1 },
      ],
    },
    {
      questionHe: "האם יוכרזו בחירות עד סוף 2026?",
      descriptionHe: "פיזור הכנסת או הכרזה רשמית על מועד בחירות עד 31.12.2026.",
      category: "elections",
      type: "binary",
      hot: true,
      closeAt: CLOSE_WEEKS(12),
      personIds: netanyahuLapid,
      outcomes: [
        { labelHe: "כן", ordinal: 0 },
        { labelHe: "לא", ordinal: 1 },
      ],
    },
    {
      questionHe: "מי ינהל את משרד האוצר בתום השנה?",
      descriptionHe: "מחזיק תיק האוצר בפועל ב-31.12.2026.",
      category: "personnel",
      type: "multi",
      hot: false,
      closeAt: CLOSE_WEEKS(16),
      // Outcome-linked MKs are auto-featured by createMarket — no explicit list.
      personIds: [],
      outcomes: [
        { labelHe: "אביגדור ליברמן", cat: 1, ordinal: 0, personId: libermanId ?? undefined },
        { labelHe: "ישראל כץ", cat: 2, ordinal: 1, personId: katzId ?? undefined },
        { labelHe: "אחר", cat: 3, ordinal: 2 },
      ],
    },
    {
      questionHe: "האם יעבור חוק הגיוס במושב הנוכחי?",
      descriptionHe: "אישור סופי בקריאה שלישית של חוק הגיוס במושב הנוכחי.",
      category: "legislation",
      type: "binary",
      hot: false,
      closeAt: CLOSE_WEEKS(10),
      personIds: gantz,
      outcomes: [
        { labelHe: "כן", ordinal: 0 },
        { labelHe: "לא", ordinal: 1 },
      ],
    },
    {
      questionHe: "האם איתמר בן גביר יישאר בממשלה עד סוף המושב?",
      descriptionHe: "כהונה רצופה כשר עד תום מושב הקיץ.",
      category: "coalition",
      type: "binary",
      hot: false,
      closeAt: CLOSE_WEEKS(8),
      personIds: benGvir,
      outcomes: [
        { labelHe: "כן", ordinal: 0 },
        { labelHe: "לא", ordinal: 1 },
      ],
    },
    {
      questionHe: "האם תוקם ועדת חקירה ממלכתית עד סוף 2026?",
      descriptionHe: "החלטת ממשלה על הקמת ועדת חקירה ממלכתית עד 31.12.2026.",
      category: "scandals",
      type: "binary",
      hot: false,
      closeAt: CLOSE_WEEKS(20),
      personIds: ohana,
      outcomes: [
        { labelHe: "כן", ordinal: 0 },
        { labelHe: "לא", ordinal: 1 },
      ],
    },
  ];

  logger.info("seed.markets.start", { count: seeds.length });
  for (const seed of seeds) {
    const { marketId } = await repo.createMarket(seed);
    logger.info("seed.markets.created", {
      marketId,
      questionHe: seed.questionHe,
      outcomes: seed.outcomes.length,
      personIds: seed.personIds?.length ?? 0,
    });
  }
  logger.info("seed.markets.done", { count: seeds.length });
  process.exit(0);
}

main().catch((err) => {
  logger.error("seed.markets.failed", { err: String(err) });
  process.exit(1);
});

import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { bills, billSponsors, politicians, queries } from "@/app/lib/schema";
import { CURRENT_KNESSET } from "@/app/lib/knesset/odata";

// Read-side repo for the politician UI. The `politicians` table is the system
// of record (120 current MKs, ingested from official Knesset OData). Markets
// are still mock-driven, so nothing here touches market mechanics.

export type PoliticianRow = typeof politicians.$inferSelect;

// Driver-agnostic DB handle (postgres-js in prod, PGlite in tests). Mirrors the
// markets repo so these reads are injectable without an `as any`.
type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

// Ordered sensibly for a gallery: group by party, then alphabetically by the
// normalized Hebrew search name (niqqud/finals/particles already stripped).
const GALLERY_ORDER = [asc(politicians.party), asc(politicians.searchName)] as const;

/**
 * All CURRENT (sitting) MKs, party-then-name ordered (for the full gallery).
 * The roster also holds departed K25 MKs (`active=false`, needed for vote
 * attribution — see normalizeK25Members); list surfaces filter them out, while
 * getPoliticianByPersonId keeps serving their profile pages.
 */
export async function getAllPoliticians({
  db = defaultDb,
}: { db?: DB } = {}): Promise<PoliticianRow[]> {
  return db
    .select()
    .from(politicians)
    .where(eq(politicians.active, true))
    .orderBy(...GALLERY_ORDER);
}

/** A capped slice of current (sitting) MKs for the homepage "on the field" section. */
export async function getFeaturedPoliticians({
  db = defaultDb,
  limit = 12,
}: { db?: DB; limit?: number } = {}): Promise<PoliticianRow[]> {
  return db
    .select()
    .from(politicians)
    .where(eq(politicians.active, true))
    .orderBy(...GALLERY_ORDER)
    .limit(limit);
}

/**
 * Discovery search over MKs by normalized Hebrew name. ILIKE on the
 * already-normalized `searchName` column (niqqud/finals/particles stripped),
 * trigram-index-assisted — discovery only, never attribution. `q` is normalized
 * by the caller (search service) with the same normalizeSearchName, so the
 * needle and column are in the same space. Party then name order.
 */
export async function searchPoliticians({
  db = defaultDb,
  q,
  limit = 24,
  includeInactive = false,
}: {
  db?: DB;
  q: string;
  limit?: number;
  /** Admin market-creation only: a candidate outcome can be a FORMER MK/PM
   *  ("מי ירכיב את הממשלה?" with a non-sitting contender), so the picker may
   *  search past the active roster. Public discovery stays active-only. */
  includeInactive?: boolean;
}): Promise<PoliticianRow[]> {
  const needle = q.trim();
  if (!needle) return [];
  const match = sql`${politicians.searchName} ILIKE ${"%" + needle + "%"}`;
  return db
    .select()
    .from(politicians)
    .where(includeInactive ? match : and(eq(politicians.active, true), match))
    .orderBy(...GALLERY_ORDER)
    .limit(limit);
}

/** True iff a politician row exists for this stable id (admin validation). */
export async function politicianExists({
  db = defaultDb,
  personId,
}: { db?: DB; personId: number }): Promise<boolean> {
  if (!Number.isInteger(personId)) return false;
  const [row] = await db
    .select({ personId: politicians.personId })
    .from(politicians)
    .where(eq(politicians.personId, personId))
    .limit(1);
  return Boolean(row);
}

/**
 * Every politician's (personId, nameHe) INCLUDING departed MKs — the identity
 * queue may resolve a name to a former member, which the active-filtered
 * gallery reads would hide.
 */
export async function listAllPoliticianNames({
  db = defaultDb,
}: { db?: DB } = {}): Promise<{ personId: number; name: string }[]> {
  const rows = await db
    .select({ personId: politicians.personId, name: politicians.nameHe })
    .from(politicians)
    .orderBy(asc(politicians.searchName));
  return rows;
}

/** Politicians by a set of stable personIds (admin-side existence validation
 *  for outcome links — never name-matched). */
export async function getPoliticiansByPersonIds({
  db = defaultDb,
  personIds,
}: {
  db?: DB;
  personIds: number[];
}): Promise<PoliticianRow[]> {
  const ids = [...new Set(personIds)];
  if (ids.length === 0) return [];
  return db.select().from(politicians).where(inArray(politicians.personId, ids));
}

/** A single MK by their canonical KNS_Person.PersonID (the route id). */
export async function getPoliticianByPersonId({
  db = defaultDb,
  personId,
}: {
  db?: DB;
  personId: number;
}): Promise<PoliticianRow | null> {
  if (!Number.isInteger(personId)) return null;
  const [row] = await db
    .select()
    .from(politicians)
    .where(eq(politicians.personId, personId))
    .limit(1);
  return row ?? null;
}

export type ActivityCounts = { bills: number; queries: number };
export type RecentBill = { billId: number; nameHe: string; knessetNum: number | null };
export type PoliticianActivity = {
  current: ActivityCounts;          // the current Knesset
  lifetime: ActivityCounts | null;  // all Knessets — null until the activity-counts ingest runs
  recentBills: { current: RecentBill[]; earlier: RecentBill[] };
};

/**
 * An MK's parliamentary activity for the card: bills + queries for the current
 * Knesset and across their whole career, plus a short recent-bills list.
 *
 * The headline counts come from official OData `$inlinecount` totals stored on the
 * politician row (`billsCurrent`/`billsLifetime`/…), NOT from a join over our K25-only
 * bill/query tables — that join undercounts a career (a Speaker or ex-minister shows
 * "2" when the real lifetime total is 213). Until the activity-counts ingest first runs
 * those columns are null, so we fall back to the legacy join for the current term and
 * report no lifetime — the card degrades to its old behavior rather than showing a bogus
 * 0. The recent-bills list always comes from the stored K25 bills (lifetime bill rows
 * aren't stored — the design is counts-only).
 */
export async function getPoliticianActivity({
  db = defaultDb,
  personId,
}: {
  db?: DB;
  personId: number;
}): Promise<PoliticianActivity> {
  const [p] = await db
    .select({
      billsCurrent: politicians.billsCurrent,
      billsLifetime: politicians.billsLifetime,
      queriesCurrent: politicians.queriesCurrent,
      queriesLifetime: politicians.queriesLifetime,
      activityCountsFetchedAt: politicians.activityCountsFetchedAt,
    })
    .from(politicians)
    .where(eq(politicians.personId, personId))
    .limit(1);

  // Recent bills, grouped current-Knesset vs earlier — the page shows them in two
  // labeled sections. innerJoin so a sponsor row pointing outside our bill set never
  // surfaces. Lifetime backfill (ingestLifetimeBills) populates earlier Knessets.
  const RECENT_PER_GROUP = 5;
  const recentCurrent = await db
    .selectDistinct({ billId: bills.billId, nameHe: bills.nameHe, knessetNum: bills.knessetNum })
    .from(billSponsors)
    .innerJoin(bills, eq(bills.billId, billSponsors.billId))
    .where(and(eq(billSponsors.personId, personId), eq(bills.knessetNum, CURRENT_KNESSET)))
    .orderBy(desc(bills.billId))
    .limit(RECENT_PER_GROUP);
  const recentEarlier = await db
    .selectDistinct({ billId: bills.billId, nameHe: bills.nameHe, knessetNum: bills.knessetNum })
    .from(billSponsors)
    .innerJoin(bills, eq(bills.billId, billSponsors.billId))
    .where(and(eq(billSponsors.personId, personId), ne(bills.knessetNum, CURRENT_KNESSET)))
    .orderBy(desc(bills.knessetNum), desc(bills.billId))
    .limit(RECENT_PER_GROUP);
  const recentBills = { current: recentCurrent, earlier: recentEarlier };

  // Gate on activityCountsFetchedAt — the marker that the activity-counts ingest has run
  // for this MK — NOT on any single count value (a real count can be 0). Until it runs (or
  // for an unknown MK), fall back to the stored-bill join for the current term and report
  // no lifetime figure rather than a misleading 0.
  if (p?.activityCountsFetchedAt == null) {
    const [bc] = await db
      .select({ n: sql<number>`count(distinct ${billSponsors.billId})::int` })
      .from(billSponsors)
      .innerJoin(bills, eq(bills.billId, billSponsors.billId))
      .where(and(eq(billSponsors.personId, personId), eq(bills.knessetNum, CURRENT_KNESSET)));
    const [qc] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(queries)
      .where(eq(queries.personId, personId));
    return { current: { bills: bc?.n ?? 0, queries: qc?.n ?? 0 }, lifetime: null, recentBills };
  }

  return {
    current: { bills: p.billsCurrent ?? 0, queries: p.queriesCurrent ?? 0 },
    lifetime: { bills: p.billsLifetime ?? 0, queries: p.queriesLifetime ?? 0 },
    recentBills,
  };
}

import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { bills, billSponsors, politicians, queries } from "@/app/lib/schema";

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
 * All CURRENT MKs, party-then-name ordered (for the full gallery). The roster
 * now also holds departed K25 MKs (`active=false`, needed for vote attribution
 * — see normalizeK25Members); list surfaces filter them out, while
 * getPoliticianByPersonId keeps serving their profile pages.
 */
export async function getAllPoliticians({
  db = defaultDb,
}: { db?: DB } = {}): Promise<PoliticianRow[]> {
  return db.select().from(politicians).where(eq(politicians.active, true)).orderBy(...GALLERY_ORDER);
}

/** A capped slice of current MKs for the homepage "on the field" section. */
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
}: {
  db?: DB;
  q: string;
  limit?: number;
}): Promise<PoliticianRow[]> {
  const needle = q.trim();
  if (!needle) return [];
  return db
    .select()
    .from(politicians)
    .where(and(eq(politicians.active, true), sql`${politicians.searchName} ILIKE ${"%" + needle + "%"}`))
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

export type PoliticianActivity = {
  billCount: number;
  queryCount: number;
  recentBills: { billId: number; nameHe: string }[];
};

/** An MK's parliamentary activity: bills sponsored, queries submitted, recent bills. */
export async function getPoliticianActivity({
  db = defaultDb,
  personId,
}: {
  db?: DB;
  personId: number;
}): Promise<PoliticianActivity> {
  // Join to `bills` so the count only reflects bills we actually store (current
  // Knesset) — never a stray sponsor row pointing at a bill outside our set.
  const [bc] = await db
    .select({ n: sql<number>`count(distinct ${billSponsors.billId})::int` })
    .from(billSponsors)
    .innerJoin(bills, eq(bills.billId, billSponsors.billId))
    .where(eq(billSponsors.personId, personId));
  const [qc] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(queries)
    .where(eq(queries.personId, personId));
  const recentBills = await db
    .selectDistinct({ billId: bills.billId, nameHe: bills.nameHe })
    .from(billSponsors)
    .innerJoin(bills, eq(bills.billId, billSponsors.billId))
    .where(eq(billSponsors.personId, personId))
    .orderBy(desc(bills.billId))
    .limit(6);
  return { billCount: bc?.n ?? 0, queryCount: qc?.n ?? 0, recentBills };
}

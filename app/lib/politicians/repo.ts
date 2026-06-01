import type { ExtractTablesWithRelations } from "drizzle-orm";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { bills, billSponsors, politicians, queries } from "@/app/lib/schema";

// Read-side repo for the politician UI. The `politicians` table is the system
// of record (120 current MKs, ingested from official Knesset OData). Markets
// are still mock-driven, so nothing here touches market mechanics.

export type PoliticianRow = typeof politicians.$inferSelect;

// Driver-agnostic DB handle (postgres-js in prod, PGlite in tests). Mirrors the
// ledger service so these reads are injectable without an `as any`.
type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

// Ordered sensibly for a gallery: group by party, then alphabetically by the
// normalized Hebrew search name (niqqud/finals/particles already stripped).
const GALLERY_ORDER = [asc(politicians.party), asc(politicians.searchName)] as const;

/** All current MKs, party-then-name ordered (for the full gallery). */
export async function getAllPoliticians({
  db = defaultDb,
}: { db?: DB } = {}): Promise<PoliticianRow[]> {
  return db.select().from(politicians).orderBy(...GALLERY_ORDER);
}

/** A capped slice of MKs for the homepage "on the field" section. */
export async function getFeaturedPoliticians({
  db = defaultDb,
  limit = 12,
}: { db?: DB; limit?: number } = {}): Promise<PoliticianRow[]> {
  return db.select().from(politicians).orderBy(...GALLERY_ORDER).limit(limit);
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
  const [bc] = await db
    .select({ n: sql<number>`count(distinct ${billSponsors.billId})::int` })
    .from(billSponsors)
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

import { asc, eq } from "drizzle-orm";
import { db } from "@/app/lib/db";
import { politicians } from "@/app/lib/schema";

// Read-side repo for the politician UI. The `politicians` table is the system
// of record (120 current MKs, ingested from official Knesset OData). Markets
// are still mock-driven, so nothing here touches market mechanics.

export type PoliticianRow = typeof politicians.$inferSelect;

// Ordered sensibly for a gallery: group by party, then alphabetically by the
// normalized Hebrew search name (niqqud/finals/particles already stripped).
const GALLERY_ORDER = [asc(politicians.party), asc(politicians.searchName)] as const;

/** All current MKs, party-then-name ordered (for the full gallery). */
export async function getAllPoliticians(): Promise<PoliticianRow[]> {
  return db.select().from(politicians).orderBy(...GALLERY_ORDER);
}

/** A capped slice of MKs for the homepage "on the field" section. */
export async function getFeaturedPoliticians({
  limit = 12,
}: { limit?: number } = {}): Promise<PoliticianRow[]> {
  return db.select().from(politicians).orderBy(...GALLERY_ORDER).limit(limit);
}

/** A single MK by their canonical KNS_Person.PersonID (the route id). */
export async function getPoliticianByPersonId({
  personId,
}: {
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

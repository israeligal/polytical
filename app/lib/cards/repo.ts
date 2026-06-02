import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { cardCollections } from "@/app/lib/schema";
import type { LedgerTx } from "@/app/lib/ledger/repo";
import { MissingUserError } from "@/app/lib/errors";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
type Tx = LedgerTx;

function reqUser(userId: string): string {
  if (!userId) throw new MissingUserError();
  return userId;
}

/** True if the user already owns this MK's card. */
export async function isOwned({
  db,
  tx,
  userId,
  personId,
}: {
  db?: DB;
  tx?: Tx;
  userId: string;
  personId: number;
}): Promise<boolean> {
  const conn = tx ?? db ?? defaultDb;
  const [row] = await conn
    .select({ id: cardCollections.id })
    .from(cardCollections)
    .where(and(eq(cardCollections.userId, reqUser(userId)), eq(cardCollections.personId, personId)))
    .limit(1);
  return !!row;
}

/** Inserts ownership idempotently. Returns false if the (userId, personId) row
 *  already existed (concurrent double-collect) — the unique index is the final
 *  backstop, so the caller rolls back the debit when this is false. */
export async function insertOwnership({
  tx,
  userId,
  personId,
}: {
  tx: Tx;
  userId: string;
  personId: number;
}): Promise<boolean> {
  const inserted = await tx
    .insert(cardCollections)
    .values({ userId: reqUser(userId), personId })
    .onConflictDoNothing({ target: [cardCollections.userId, cardCollections.personId] })
    .returning({ id: cardCollections.id });
  return inserted.length > 0;
}

/** The personIds the user owns — the Set the gallery uses to light up cards. */
export async function ownedPersonIds({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<number[]> {
  const rows = await db
    .select({ personId: cardCollections.personId })
    .from(cardCollections)
    .where(eq(cardCollections.userId, reqUser(userId)));
  return rows.map((r) => r.personId);
}

/** Owned cards newest-first (personId + when collected) — for a "my collection" list. */
export async function listCollection({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<{ personId: number; collectedAt: Date }[]> {
  return db
    .select({ personId: cardCollections.personId, collectedAt: cardCollections.collectedAt })
    .from(cardCollections)
    .where(eq(cardCollections.userId, reqUser(userId)))
    .orderBy(desc(cardCollections.collectedAt));
}

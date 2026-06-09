import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { cardCollections, cardProgress } from "@/app/lib/schema";
import type { Tx as LedgerTx } from "@/app/lib/db";
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

// --- Accuracy-unlock progress (the running correct-count toward a card) ---

/** Increments the user's correct-prediction count for a politician (upsert) and
 *  returns the NEW count. Rides inside the resolveMarket tx — the caller grants
 *  the card when the returned count reaches the rarity threshold. */
export async function bumpCardProgress({
  tx,
  userId,
  personId,
}: {
  tx: Tx;
  userId: string;
  personId: number;
}): Promise<number> {
  const [row] = await tx
    .insert(cardProgress)
    .values({ userId: reqUser(userId), personId, correctCount: 1 })
    .onConflictDoUpdate({
      target: [cardProgress.userId, cardProgress.personId],
      set: { correctCount: sql`${cardProgress.correctCount} + 1` },
    })
    .returning({ correctCount: cardProgress.correctCount });
  return row.correctCount;
}

/** The user's correct-count per politician (personId → count) — drives the
 *  "N/M correct to unlock" progress shown on locked cards. */
export async function progressByPerson({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<Map<number, number>> {
  const rows = await db
    .select({ personId: cardProgress.personId, correctCount: cardProgress.correctCount })
    .from(cardProgress)
    .where(eq(cardProgress.userId, reqUser(userId)));
  return new Map(rows.map((r) => [r.personId, r.correctCount]));
}

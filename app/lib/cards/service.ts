import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import * as repo from "@/app/lib/cards/repo";
import { applyEntry } from "@/app/lib/ledger/service";
import { lockUser } from "@/app/lib/ledger/repo";
import { getPoliticianByPersonId } from "@/app/lib/politicians/repo";
import { COLLECT_COST } from "@/app/lib/economy";
import { AlreadyOwnedError, UnknownPoliticianError } from "@/app/lib/errors";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

/**
 * Collects an MK's caricature card for COLLECT_COST coins. One atomic unit:
 * lock the user → assert not already owned → debit via the SOLE coin writer
 * (applyEntry surfaces InsufficientFundsError) → record ownership. The unique
 * (userId, personId) index is the final backstop: if a concurrent collect won
 * the insert, insertOwnership returns false and we throw → the debit rolls back.
 * The politician is resolved by STABLE personId (never fuzzy) BEFORE the tx —
 * reference data is immutable, so it needn't sit inside the hot lock.
 */
export async function collectCard({
  db = defaultDb,
  userId,
  personId,
}: {
  db?: DB;
  userId: string;
  personId: number;
}): Promise<{ balanceAfter: number }> {
  const mk = await getPoliticianByPersonId({ db, personId });
  if (!mk) throw new UnknownPoliticianError();

  return db.transaction(async (tx) => {
    await lockUser({ tx, userId }); // lock FIRST so a self-concurrent collect serializes
    if (await repo.isOwned({ tx, userId, personId })) throw new AlreadyOwnedError();
    const { balanceAfter } = await applyEntry({ tx, userId, type: "collect", amount: -COLLECT_COST });
    const inserted = await repo.insertOwnership({ tx, userId, personId });
    if (!inserted) throw new AlreadyOwnedError(); // lost the unique-index race → roll back the debit
    return { balanceAfter };
  });
}

/** True if the user owns this MK's card (read). */
export async function isOwned({
  db = defaultDb,
  userId,
  personId,
}: {
  db?: DB;
  userId: string;
  personId: number;
}): Promise<boolean> {
  return repo.isOwned({ db, userId, personId });
}

/** The Set of personIds the user owns — lights up the gallery. */
export async function getOwnedPersonIds({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<Set<number>> {
  return new Set(await repo.ownedPersonIds({ db, userId }));
}

/** Owned cards newest-first. */
export async function listCollection({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<{ personId: number; collectedAt: Date }[]> {
  return repo.listCollection({ db, userId });
}

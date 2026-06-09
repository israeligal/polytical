import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import * as repo from "@/app/lib/cards/repo";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

// Card collection is unlocked by ACCURACY, not bought: resolveMarket grants a
// card once the user's correct-prediction count for a politician reaches the
// rarity threshold (see markets/service + lib/rarity). This module is read-only —
// ownership + progress for the collection gallery.

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

/** Per-politician correct-prediction progress (personId → count) toward
 *  unlocking each card — drives the "N/M correct" hint on locked cards. */
export async function getProgressByPerson({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<Map<number, number>> {
  return repo.progressByPerson({ db, userId });
}

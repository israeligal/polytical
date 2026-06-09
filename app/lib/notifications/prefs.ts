import type { ExtractTablesWithRelations } from "drizzle-orm";
import { eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { users } from "@/app/lib/schema";
import { typesForCategory, PUSH_PREF_CATEGORY_KEYS } from "@/lib/notification-prefs";
import { InvalidPushPrefError, MissingUserError } from "@/app/lib/errors";

// Per-user push opt-outs, stored as `user.mutedPushTypes` (notification_type
// values). Gates web-push only; the in-app notification log is never filtered.

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

function reqUser(userId: string): string {
  if (!userId) throw new MissingUserError();
  return userId;
}

/** A single user's muted push types. */
export async function getMutedPushTypes({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<string[]> {
  const [row] = await db
    .select({ muted: users.mutedPushTypes })
    .from(users)
    .where(eq(users.id, reqUser(userId)));
  return row?.muted ?? [];
}

/** Muted-type sets for many users at once — one query for the dispatcher to
 *  filter a batch. Users with no row simply don't appear in the map (= nothing
 *  muted). */
export async function getMutedPushTypesForUsers({
  db = defaultDb,
  userIds,
}: {
  db?: DB;
  userIds: string[];
}): Promise<Map<string, Set<string>>> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, muted: users.mutedPushTypes })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, new Set(r.muted)]));
}

/** Mutes or unmutes every push type in a category for a user. Unknown category →
 *  InvalidPushPrefError (never silently no-op). */
export async function setPushCategoryMuted({
  db = defaultDb,
  userId,
  category,
  muted,
}: {
  db?: DB;
  userId: string;
  category: string;
  muted: boolean;
}): Promise<{ mutedPushTypes: string[] }> {
  reqUser(userId);
  if (!PUSH_PREF_CATEGORY_KEYS.includes(category)) throw new InvalidPushPrefError();

  const types = typesForCategory(category);
  const next = new Set(await getMutedPushTypes({ db, userId }));
  for (const t of types) {
    if (muted) next.add(t);
    else next.delete(t);
  }
  const mutedPushTypes = [...next];
  await db.update(users).set({ mutedPushTypes }).where(eq(users.id, userId));
  return { mutedPushTypes };
}

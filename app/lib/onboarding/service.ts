import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import * as repo from "@/app/lib/onboarding/repo";
import type { OnboardingState } from "@/app/lib/onboarding/repo";
import { lockUser } from "@/app/lib/users/repo";
import { CATEGORIES } from "@/lib/categories";
import { HANDLE_RE, normalizeHandle } from "@/app/lib/onboarding/handle";
import { isUniqueViolation } from "@/app/lib/pg-errors";
import {
  AlreadyOnboardedError,
  HandleRequiredError,
  HandleTakenError,
  InvalidArenaError,
  InvalidHandleError,
} from "@/app/lib/errors";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

const ARENA_KEYS = new Set<string>(CATEGORIES.map((c) => c.key));

/** Normalize + validate; throws on a malformed handle (errors over fallbacks). */
function requireValidHandle(raw: string): string {
  const h = normalizeHandle(raw);
  if (!HANDLE_RE.test(h)) throw new InvalidHandleError();
  return h;
}

/** Live availability check for the wizard's handle step. Returns a structured
 *  verdict (never throws on a bad format — the UI shows the reason inline). */
export async function checkHandleAvailable({
  db = defaultDb,
  userId,
  handle,
}: {
  db?: DB;
  userId: string;
  handle: string;
}): Promise<{ available: boolean; normalized: string; reason?: "invalid" | "taken" }> {
  const normalized = normalizeHandle(handle);
  if (!HANDLE_RE.test(normalized)) return { available: false, normalized, reason: "invalid" };
  const taken = await repo.isHandleTaken({ db, handle: normalized, excludeUserId: userId });
  return taken ? { available: false, normalized, reason: "taken" } : { available: true, normalized };
}

/** Claims a handle for the user. Lock-first so a self-concurrent set serializes;
 *  isHandleTaken guards the common case, the DB unique constraint the race. */
export async function setHandle({
  db = defaultDb,
  userId,
  handle,
}: {
  db?: DB;
  userId: string;
  handle: string;
}): Promise<{ handle: string }> {
  const normalized = requireValidHandle(handle);
  try {
    await db.transaction(async (tx) => {
      await lockUser({ tx, userId });
      if (await repo.isHandleTaken({ tx, handle: normalized, excludeUserId: userId }))
        throw new HandleTakenError();
      await repo.setHandle({ tx, userId, handle: normalized });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new HandleTakenError(); // cross-user race lost at the DB
    throw e;
  }
  return { handle: normalized };
}

/** Clears the onboarding gate: validates arena, requires a handle, stamps
 *  onboardedAt. Terminal — a second call throws AlreadyOnboardedError. */
export async function completeOnboarding({
  db = defaultDb,
  userId,
  arena,
}: {
  db?: DB;
  userId: string;
  arena: string;
}): Promise<{ onboardedAt: Date }> {
  if (!ARENA_KEYS.has(arena)) throw new InvalidArenaError();
  return db.transaction(async (tx) => {
    const u = await lockUser({ tx, userId }); // lock FIRST, then read state under the lock
    if (u.onboardedAt) throw new AlreadyOnboardedError(); // terminal — never re-onboard
    if (!u.handle) throw new HandleRequiredError();
    const at = new Date();
    await repo.completeOnboarding({ tx, userId, arena, at });
    return { onboardedAt: at };
  });
}

/** Authoritative gate read for the /onboarding page (cookieCache-proof). */
export async function readOnboardingState({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<OnboardingState | null> {
  return repo.readOnboardingState({ db, userId });
}

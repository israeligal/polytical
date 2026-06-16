import { CATEGORIES } from "@/lib/categories";
import { InvalidArenaError } from "@/app/lib/errors";

// Pure arena helpers — no DB imports, so the client wizard and the server service
// share the same parse/validate logic. A user picks 1..MAX_ARENAS focus categories;
// they're stored comma-joined in the existing `users.arena` text column (a single
// value is just a 1-item list — no schema change, no migration).

/** Max focus categories a user can pick at onboarding. */
export const MAX_ARENAS = 3;

const ARENA_KEYS = new Set<string>(CATEGORIES.map((c) => c.key));

/** Split the stored comma-joined arena string into category keys (empty if none). */
export function parseArenas(stored: string | null | undefined): string[] {
  if (!stored) return [];
  return stored
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Validate a chosen set (1..MAX, all known CATEGORIES keys, deduped) and join for
 *  storage. Throws InvalidArenaError on empty, an unknown key, or over the cap. */
export function formatArenas(keys: string[]): string {
  const unique = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  if (unique.length === 0 || unique.length > MAX_ARENAS) throw new InvalidArenaError();
  if (unique.some((k) => !ARENA_KEYS.has(k))) throw new InvalidArenaError();
  return unique.join(",");
}

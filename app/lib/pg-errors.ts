// Narrowing helpers for Postgres driver errors — shared so every service maps
// the same SQLSTATE to the same domain error (no `as any`, no duplicated check).

/**
 * Extracts a Postgres SQLSTATE from a driver error OR a Drizzle wrapper.
 * drizzle-orm nests the original driver error under `.cause` (DrizzleQueryError),
 * and postgres-js puts the code on the top-level error — so we walk the cause
 * chain and return the first string `code` we find.
 */
export function pgErrorCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let depth = 0; depth < 5 && cur != null; depth++) {
    if (typeof cur === "object" && "code" in cur) {
      const code = (cur as { code?: unknown }).code;
      if (typeof code === "string") return code;
    }
    cur = typeof cur === "object" && cur !== null && "cause" in cur ? (cur as { cause?: unknown }).cause : undefined;
  }
  return undefined;
}

/** Unique violation (23505). */
export function isUniqueViolation(e: unknown): boolean {
  return pgErrorCode(e) === "23505";
}

/** Foreign-key violation (23503). */
export function isForeignKeyViolation(e: unknown): boolean {
  return pgErrorCode(e) === "23503";
}

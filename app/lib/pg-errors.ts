// Narrowing helpers for Postgres driver errors — shared so every service maps
// the same SQLSTATE to the same domain error (no `as any`, no duplicated check).

/** Postgres unique-violation (SQLSTATE 23505), narrowed from unknown. */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === "23505";
}

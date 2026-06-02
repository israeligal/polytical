// Shared id validation. A malformed UUID reaching a Postgres `uuid` column
// raises a raw 22P02 driver error; guarding at the service boundary lets us
// return a clean domain error instead (errors-over-fallbacks).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

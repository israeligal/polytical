/**
 * The single app timezone. Polytical is Israel-only; every displayed time is
 * Asia/Jerusalem (instants are stored as UTC). Centralized here so the server
 * (UTC) and the client (the visitor's local tz) format **identically** — an
 * explicit `timeZone` makes `Intl.DateTimeFormat` deterministic regardless of
 * the host process timezone, which is exactly what prevents the UTC/local
 * hydration mismatch (React #418). Never format dates ad-hoc in components;
 * the ESLint guard enforces routing through this module.
 */
export const APP_TIMEZONE = "Asia/Jerusalem";

const dateTimeFmt = new Intl.DateTimeFormat("he-IL", {
  timeZone: APP_TIMEZONE,
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("he-IL", {
  timeZone: APP_TIMEZONE,
  day: "numeric",
  month: "long",
});

const asDate = (value: string | Date): Date => (typeof value === "string" ? new Date(value) : value);

/** Israel-time date + time, e.g. "1 ביוני בשעה 21:33". */
export function formatDateTime(value: string | Date): string {
  return dateTimeFmt.format(asDate(value));
}

/** Israel-time date only, e.g. "1 ביוני". */
export function formatDate(value: string | Date): string {
  return dateFmt.format(asDate(value));
}

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

// `datetime-local` inputs speak the BROWSER'S local timezone by definition —
// these are the only sanctioned bridge between it and our UTC instants.
// CLIENT-ONLY (call after mount): on the server the process timezone (UTC in
// prod) is not the user's, so an SSR'd value both shifts the instant and
// causes a hydration mismatch. The reverse direction (input value → UTC
// instant) must also happen in the browser: `new Date(value).toISOString()`.

function toLocalInput(date: Date): string {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** Current local time in the `datetime-local` value format (YYYY-MM-DDTHH:mm). */
export function nowLocalInput(): string {
  return toLocalInput(new Date());
}

/** UTC/ISO timestamp → local `datetime-local` value (YYYY-MM-DDTHH:mm). */
export function isoToLocalInput(iso: string): string {
  return toLocalInput(new Date(iso));
}

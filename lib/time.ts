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

// Parts extractor for the wall-clock conversion below. en-CA gives ISO-ordered
// numeric parts; explicit timeZone keeps it deterministic on any host.
const jerusalemParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const NAIVE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Naive Jerusalem wall-clock string ("2026-06-09T19:00:00", no tz designator —
 * the Knesset website API's date format) → the UTC instant it denotes.
 * Fixed-point iteration over the zone offset: guess the instant as if the wall
 * time were UTC, read back what Jerusalem wall time that instant produces, and
 * shift by the difference — two passes settle even across IST↔IDT transitions.
 * (A wall time inside the spring-forward gap doesn't exist; this maps it to the
 * instant the clocks skipped to, which is the standard resolution.)
 */
export function jerusalemWallToUtc(naive: string): Date {
  const m = NAIVE_RE.exec(naive);
  if (!m) throw new Error(`jerusalemWallToUtc: not a naive ISO datetime: "${naive}"`);
  const [, y, mo, d, h, mi, s] = m;
  const target = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? "0"));
  let utcMs = target;
  for (let i = 0; i < 2; i++) {
    const p: Record<string, number> = {};
    for (const part of jerusalemParts.formatToParts(new Date(utcMs))) {
      if (part.type !== "literal") p[part.type] = Number(part.value);
    }
    // Intl emits hour "24" for midnight under hour12:false in some ICU versions.
    const wallMs = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
    utcMs += target - wallMs;
  }
  return new Date(utcMs);
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

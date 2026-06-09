/** Thousands-separated count (Latin numerals, rendered LTR via `.nums`). */
export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** Percentage of a part within a whole (0 when the whole is 0). Used for the
 *  crowd-split bars — `part`/`total` are predictor COUNTS now, not coin pools. */
export function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

/** Hebrew relative time until close, e.g. "בעוד 3 ימים". */
export function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "נסגר";
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `בעוד ${days} ${days === 1 ? "יום" : "ימים"}`;
  if (hours >= 1) return `בעוד ${hours} ${hours === 1 ? "שעה" : "שעות"}`;
  return `בעוד ${minutes} דק׳`;
}

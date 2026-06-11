/** Thousands-separated count (Latin numerals, rendered LTR via `.nums`). */
export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** Percentage of a part within a whole (0 when the whole is 0). Used for the
 *  crowd-split bars — `part`/`total` are predictor COUNTS now, not coin pools. */
export function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

/** Display label for a crowd share: a non-zero part that ROUNDS to 0 shows
 *  "<1%" — never "0%" next to an outcome that demonstrably has predictors.
 *  Single source of truth for the odds bar legend, compact card line and the
 *  multi-market outcome rows, so the same outcome never reads differently
 *  across surfaces. */
export function pctLabel(part: number, total: number): string {
  const share = pct(part, total);
  return part > 0 && share === 0 ? "<1%" : `${share}%`;
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

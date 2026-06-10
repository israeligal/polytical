// Pure handle helpers — no DB imports, so both the server service and the
// client wizard can share the exact same validation + normalization.

/** 3–20 chars, single script: all-latin [a-z0-9_] OR all-hebrew [א-ת0-9_].
 *  Mixed Hebrew/Latin is rejected on purpose — bidi rendering + impersonation.
 *  א-ת is the base letter block only (includes finals, excludes niqqud/geresh). */
export const HANDLE_RE = /^(?:[a-z0-9_]{3,20}|[א-ת0-9_]{3,20})$/;

/** Strip a leading @, trim, lowercase — the canonical form we store + compare. */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

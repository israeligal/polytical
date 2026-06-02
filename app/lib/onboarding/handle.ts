// Pure handle helpers — no DB imports, so both the server service and the
// client wizard can share the exact same validation + normalization.

/** 3–20 chars: lowercase latin, digits, underscore. Closed, stable set. */
export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

/** Strip a leading @, trim, lowercase — the canonical form we store + compare. */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

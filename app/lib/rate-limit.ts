// In-memory fixed-window rate limiter for Server Actions. CLAUDE.md mandates
// rate-limiting suggestions/comments/bets, but Better Auth's built-in limiter
// only covers its own /api/auth endpoints — it cannot see a Server Action. This
// fills that gap. Single-server / in-process (same scope as Better Auth's
// in-memory store); swap the Map for Redis if we ever run multiple instances.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Records one hit against `key` and reports whether it's allowed. Fixed window:
 * the first hit opens a `windowMs` window allowing `max` hits; the (max+1)th
 * within the window is denied with the ms until the window resets. `now` is
 * injectable so tests drive time without sleeping.
 */
export function checkRateLimit({
  key,
  max,
  windowMs,
  now = Date.now(),
}: {
  key: string;
  max: number;
  windowMs: number;
  now?: number;
}): { allowed: boolean; retryAfterMs: number } {
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (bucket.count >= max) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

/** Test-only: drop all buckets so cases don't bleed into each other. */
export function __resetRateLimits(): void {
  buckets.clear();
}

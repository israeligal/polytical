// Shared fetch-with-retry for the Knesset data clients (OData, the votes
// website API, the fs.knesset binary store). One exponential-backoff loop
// instead of three near-identical copies — a change to retry semantics
// (jitter, Retry-After, a backoff cap) now lands in one place.
//
// `label` namespaces the structured log events: `<label>.retry` (warn, per
// attempt) and `<label>.fetch_failed` (error, after the last retry) — keeping
// the existing event names ("knesset.odata.retry", "votes.api.retry",
// "votes.files.retry") greppable.

import { logger } from "@/app/lib/logger";

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function fetchWithRetry<T>({
  url,
  init,
  parse,
  label,
  retries = 2,
  retryDelayMs = 500,
}: {
  url: string;
  init?: RequestInit;
  /** Turns a successful (res.ok) Response into the return value. May inspect
   *  status (e.g. 204 → null). Throwing here is treated like a fetch failure. */
  parse: (res: Response) => Promise<T>;
  label: string;
  retries?: number;
  retryDelayMs?: number;
}): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url, init);
      // Identical message shape across all callers — enrich.ts greps /HTTP 404/.
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await parse(res);
    } catch (err) {
      if (attempt >= retries) {
        logger.error(`${label}.fetch_failed`, { url, attempt, err: String(err) });
        throw err;
      }
      const backoff = retryDelayMs * Math.pow(2, attempt);
      logger.warn(`${label}.retry`, { url, attempt, backoff, err: String(err) });
      await sleep(backoff);
      attempt += 1;
    }
  }
}

// Binary download from fs.knesset.gov.il (official document store — publicly
// fetchable server-side; NEVER fetch main.knesset.gov.il pages, they sit
// behind the Radware bot challenge). Separate module so tests mock the
// boundary, not the enrichment logic.

import { logger } from "@/app/lib/logger";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchBinaryFile({
  url,
  retries = 2,
  retryDelayMs = 500,
}: {
  url: string;
  retries?: number;
  retryDelayMs?: number;
}): Promise<Uint8Array> {
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      if (attempt >= retries) {
        logger.error("votes.files.fetch_failed", { url, attempt, err: String(err) });
        throw err;
      }
      const backoff = retryDelayMs * Math.pow(2, attempt);
      logger.warn("votes.files.retry", { url, attempt, backoff, err: String(err) });
      await sleep(backoff);
      attempt += 1;
    }
  }
}

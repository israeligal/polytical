// HTTP client for the Knesset website API — mirrors the retry/throttle
// discipline of app/lib/knesset/odata.ts. The knesset.gov.il APEX answers
// plain server-side HTTP (only main.knesset.gov.il pages sit behind the
// Radware challenge); a browser-ish UA keeps us on the polite path.

import { logger } from "@/app/lib/logger";
import type {
  WsMkDropdownRow,
  WsVoteDetailsResponse,
  WsVoteHeader,
  WsVotesHeadersResponse,
} from "./website-types";

export const WEBSITE_API_BASE = "https://knesset.gov.il/WebSiteApi/knessetapi/";

/** Public vote page — what we store as sourceUrl per vote row. */
export function voteSourceUrl(voteId: number): string {
  return `https://main.knesset.gov.il/Activity/plenum/Votes/Pages/vote.aspx?voteid=${voteId}`;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RequestArgs {
  path: string;
  body?: unknown; // present => POST
  retries?: number;
  retryDelayMs?: number;
}

async function request<T>({ path, body, retries = 2, retryDelayMs = 500 }: RequestArgs): Promise<T> {
  const url = `${WEBSITE_API_BASE}${path}`;
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Accept: "application/json",
          "User-Agent": UA,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // 204 = empty result set (e.g. a headers window with no votes).
      if (res.status === 204) return null as T;
      return (await res.json()) as T;
    } catch (err) {
      if (attempt >= retries) {
        logger.error("votes.api.fetch_failed", { url, attempt, err: String(err) });
        throw err;
      }
      const backoff = retryDelayMs * Math.pow(2, attempt);
      logger.warn("votes.api.retry", { url, attempt, backoff, err: String(err) });
      await sleep(backoff);
      attempt += 1;
    }
  }
}

/**
 * All vote headers in a date window (inclusive, "YYYY-MM-DD" strings).
 * The service returns the whole window in one response (verified: 141 rows
 * for a 40-day window; PageNum is ignored) — callers sweep bounded windows
 * (the ingest uses monthly) rather than paging. The first row's
 * VoteDateLongStr carries "נמצאו N תוצאות"; ingest cross-checks it against
 * rows received and warns on mismatch (truncation watchdog).
 */
export async function fetchVoteHeaders({
  fromDate,
  toDate,
  throttleMs = 250,
}: {
  fromDate: string;
  toDate: string;
  throttleMs?: number;
}): Promise<WsVoteHeader[]> {
  const res = await request<WsVotesHeadersResponse | null>({
    path: "Votes/GetVotesHeaders",
    body: { SearchType: 2, FromDate: fromDate, ToDate: toDate },
  });
  if (throttleMs > 0) await sleep(throttleMs);
  const rows = res?.Table ?? [];
  logger.info("votes.api.headers_fetched", { fromDate, toDate, rows: rows.length });
  return rows;
}

/** Full vote detail: header + counters + the per-MK breakdown. */
export async function fetchVoteDetails({
  voteId,
  throttleMs = 250,
}: {
  voteId: number;
  throttleMs?: number;
}): Promise<WsVoteDetailsResponse | null> {
  const res = await request<WsVoteDetailsResponse | null>({
    path: `Votes/GetVoteDetails/${voteId}`,
  });
  if (throttleMs > 0) await sleep(throttleMs);
  return res;
}

/** Every MK ever, in the website's id space (mapping bootstrap input). */
export async function fetchMksDropdown(): Promise<WsMkDropdownRow[]> {
  const rows = await request<WsMkDropdownRow[]>({
    path: "MKs/GetMksDropDown?languagekey=he",
  });
  logger.info("votes.api.mks_dropdown_fetched", { rows: rows.length });
  return rows;
}

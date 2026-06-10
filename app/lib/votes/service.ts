// Vote ingestion orchestration: header sweep (monthly windows) → per-vote
// detail fetch → transactional apply (patch + raw evidence + verified
// attribution + queue) → decisive recompute. Idempotent end-to-end; a vote
// whose detail fetch fails stays `pending_details` and is retried next run.

import { db as defaultDb } from "@/app/lib/db";
import { logger } from "@/app/lib/logger";
import { UnverifiedMappingsError } from "@/app/lib/errors";
import {
  applyVoteDetails, listPendingDetailVoteIds, loadAttributionContext,
  recomputeDecisive, upsertVoteHeaders, type VotesDb,
} from "./repo";
import { normalizeVoteDetails, normalizeVoteHeader } from "./normalize";
import { fetchVoteDetails, fetchVoteHeaders } from "./website-api";
import type { WsVoteHeader } from "./website-types";

type DB = VotesDb;

const RESULT_BANNER = /נמצאו\s+([\d,]+)\s+תוצאות/;

/** [from, to] date-string pairs, month-granular, inclusive. */
export function monthlyWindows(fromDate: string, toDate: string): [string, string][] {
  const out: [string, string][] = [];
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(`${toDate}T00:00:00Z`);
  let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (cursor <= to) {
    const monthStart = cursor > from ? cursor : from;
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const windowEnd = monthEnd < to ? monthEnd : to;
    out.push([monthStart.toISOString().slice(0, 10), windowEnd.toISOString().slice(0, 10)]);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return out;
}

/** Truncation watchdog: the window banner must equal the rows received. */
function checkBanner(headers: WsVoteHeader[], window: [string, string]): void {
  const banner = headers.find((h) => h.VoteDateLongStr && RESULT_BANNER.test(h.VoteDateLongStr));
  if (!banner) return;
  const claimed = Number(RESULT_BANNER.exec(banner.VoteDateLongStr!)![1].replace(/,/g, ""));
  if (claimed !== headers.length) {
    logger.warn("votes.ingest.window_truncated", { window, claimed, received: headers.length });
  }
}

export interface IngestVotesResult {
  headers: number;
  detailsFetched: number;
  detailsFailed: number;
  attributed: number;
  queued: number;
}

/**
 * Sweeps [fromDate, toDate] (YYYY-MM-DD, inclusive) and ingests everything in
 * it. `refetchDetails` forces re-fetching votes already marked complete (used
 * by backfill re-runs, e.g. after the bills table lands to fill billId).
 *
 * Attribution requires a FULLY verified mapping table (P0-2 human gate):
 * any unverified mk_name_mappings row aborts before any write.
 */
export async function ingestVotes({
  db = defaultDb,
  fromDate,
  toDate,
  refetchDetails = false,
}: {
  db?: DB;
  fromDate: string;
  toDate: string;
  refetchDetails?: boolean;
}): Promise<IngestVotesResult> {
  const ctx = await loadAttributionContext({ db });
  if (ctx.unverifiedCount > 0) {
    throw new UnverifiedMappingsError(ctx.unverifiedCount);
  }
  const fetchedAt = new Date();
  const prov = { fetchedAt };

  // 1) header sweep
  const allHeaders: WsVoteHeader[] = [];
  for (const window of monthlyWindows(fromDate, toDate)) {
    const headers = await fetchVoteHeaders({ fromDate: window[0], toDate: window[1] });
    checkBanner(headers, window);
    allHeaders.push(...headers);
  }
  // Dedupe by voteId (defensive: duplicate keys in one multi-row upsert are a
  // Postgres error — "cannot affect row a second time").
  const uniqueHeaders = [...new Map(allHeaders.map((h) => [h.VoteId, h])).values()];
  const headerRows = uniqueHeaders.map((h) => normalizeVoteHeader(h, prov));
  await upsertVoteHeaders({ db, rows: headerRows });

  // 2) details for pending (or all, when refetching)
  const sweptIds = uniqueHeaders.map((h) => h.VoteId);
  const targetIds = refetchDetails ? sweptIds : await listPendingDetailVoteIds({ db, voteIds: sweptIds });
  const voteDateById = new Map(headerRows.map((r) => [r.voteId, r.voteDate as Date]));

  let detailsFetched = 0;
  let detailsFailed = 0;
  let attributed = 0;
  let queued = 0;
  const touchedItemIds: number[] = [];
  for (const voteId of targetIds) {
    try {
      const details = await fetchVoteDetails({ voteId });
      if (!details) {
        detailsFailed += 1; // stays pending_details; retried next run
        continue;
      }
      const { patch, rawRows } = normalizeVoteDetails(voteId, details, prov);
      const res = await applyVoteDetails({
        db, voteId, voteDate: voteDateById.get(voteId) ?? fetchedAt, patch, rawRows, ctx,
      });
      attributed += res.attributed;
      queued += res.queued;
      if (patch.itemId != null) touchedItemIds.push(patch.itemId);
      detailsFetched += 1;
    } catch (err) {
      detailsFailed += 1;
      logger.error("votes.ingest.detail_failed", { voteId, err: String(err) });
    }
  }

  // 3) decisive recompute for every touched item
  await recomputeDecisive({ db, itemIds: touchedItemIds });

  const result = { headers: headerRows.length, detailsFetched, detailsFailed, attributed, queued };
  logger.info("votes.ingest.done", { fromDate, toDate, refetchDetails, ...result });
  return result;
}

/** Last-7-days incremental — what the cron runs. */
export async function ingestRecentVotes({ db = defaultDb }: { db?: DB } = {}): Promise<IngestVotesResult> {
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 864e5);
  return ingestVotes({
    db,
    fromDate: from.toISOString().slice(0, 10),
    toDate: now.toISOString().slice(0, 10),
  });
}

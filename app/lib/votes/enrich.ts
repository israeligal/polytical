// Vote-item enrichment: official description + law links for the items behind
// plenum votes. OFFICIAL SOURCES ONLY (docs/decisions/vote-descriptions.md):
//   bills  → KNS_Bill.SummaryLaw, else דברי הסבר extracted VERBATIM from the
//            preliminary-reading DOCX; links to the National Legislation DB
//            page + the latest-stage official PDF.
//   agenda → motion text (דברי הסבר) from the KNS_DocumentAgenda DOCX + the
//            official PDF + the proposing MK (InitiatorPersonID = personId).
// Terminal-state-by-existence: fetch failures write NOTHING (retried next
// run); fetched-but-no-text items write a links-only row (explicit absence).

import { buildODataUrl, fetchAll } from "@/app/lib/knesset/odata";
import type { KnsAgenda, KnsBill, KnsDocumentAgenda, KnsDocumentBill } from "@/app/lib/knesset/odata-types";
import { normalizeBills } from "@/app/lib/knesset/normalize";
import { logger } from "@/app/lib/logger";
import { extractDocxText, extractExplanatoryNotes } from "./docx";
import { fetchBinaryFile } from "./files-api";
import { ITEM_TYPE_AGENDA, ITEM_TYPE_BILL } from "./normalize";
import {
  listEnrichmentCandidates, upsertVoteItem, type VoteItemInsert, type VotesDb,
} from "./repo";

/** National Legislation Database bill page (user-facing href ONLY — the host
 *  is Radware-protected against server-side fetches). Verified live 2026-06-12. */
export function buildLegislationUrl({ billId }: { billId: number }): string {
  return `https://main.knesset.gov.il/apps/legislation/main/bills/${billId}`;
}

/** KNS_Document* FilePath values can carry backslashes (verified live). */
export function normalizeDocPath({ filePath }: { filePath: string }): string {
  return filePath.replace(/\\/g, "/");
}

// Bill text stages, most decisive first: gazette publication > 2nd/3rd
// reading > 1st reading > preliminary. 59 (חומר רקע) and unknown ids are
// never linked as "the bill text".
const BILL_DOC_STAGE_RANK: Record<number, number> = { 9: 4, 4: 3, 2: 2, 1: 1 };
const AGENDA_MOTION_GROUP = 16; // נוסח הצעה לסדר היום (verified live)

/** Newest-first by LastUpdatedDate — a revised/re-submitted document must win
 *  over the stale revision (rows are terminal once written). Null dates sort last. */
function byNewest<T extends { LastUpdatedDate: string | null }>(a: T, b: T): number {
  return (b.LastUpdatedDate ?? "").localeCompare(a.LastUpdatedDate ?? "");
}

export function pickLatestBillDoc({ docs }: { docs: KnsDocumentBill[] }): KnsDocumentBill | null {
  const ranked = docs
    .filter((d) => d.ApplicationDesc === "PDF" && BILL_DOC_STAGE_RANK[d.GroupTypeID] != null)
    .sort((a, b) => BILL_DOC_STAGE_RANK[b.GroupTypeID] - BILL_DOC_STAGE_RANK[a.GroupTypeID] || byNewest(a, b));
  return ranked[0] ?? null;
}

export function pickPreliminaryDocx({ docs }: { docs: KnsDocumentBill[] }): KnsDocumentBill | null {
  return docs.filter((d) => d.GroupTypeID === 1 && d.ApplicationDesc === "DOC").sort(byNewest)[0] ?? null;
}

export function pickAgendaDoc({
  docs, application,
}: { docs: KnsDocumentAgenda[]; application: "DOC" | "PDF" }): KnsDocumentAgenda | null {
  return (
    docs.filter((d) => d.GroupTypeID === AGENDA_MOTION_GROUP && d.ApplicationDesc === application).sort(byNewest)[0] ??
    null
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface EnrichResult {
  candidates: number;
  enriched: number;
  failed: number;
}

/**
 * Enriches up to `limit` pending items (newest votes first). Per-item failure
 * isolation: a thrown item is logged + counted, the loop continues, and the
 * item retries next run (no vote_items row was written).
 */
export async function enrichVoteItems({
  db, limit = 30, throttleMs = 250,
}: { db: VotesDb; limit?: number; throttleMs?: number }): Promise<EnrichResult> {
  const candidates = await listEnrichmentCandidates({ db, limit });
  let enriched = 0;
  let failed = 0;
  for (const c of candidates) {
    try {
      if (c.itemTypeId === ITEM_TYPE_BILL) await enrichBillItem({ db, itemId: c.itemId });
      else await enrichAgendaItem({ db, itemId: c.itemId });
      enriched += 1;
    } catch (err) {
      failed += 1;
      logger.warn("votes.enrich.item_failed", { itemId: c.itemId, itemTypeId: c.itemTypeId, err: String(err) });
    }
    if (throttleMs > 0) await sleep(throttleMs);
  }
  if (candidates.length) logger.info("votes.enrich.done", { candidates: candidates.length, enriched, failed });
  return { candidates: candidates.length, enriched, failed };
}

/** Official text from a DOCX, or null — a fetched-but-unparseable document OR
 *  a permanently-missing one (HTTP 404 after retries) yields a links-only
 *  TERMINAL row (explicit absence), never an endless retry. Transient fetch
 *  errors (5xx/network) rethrow so the whole item retries next run. */
async function tryExtractNotes({ url, itemId }: { url: string; itemId: number }): Promise<string | null> {
  let file: Uint8Array;
  try {
    file = await fetchBinaryFile({ url });
  } catch (err) {
    if (/HTTP 404/.test(String(err))) {
      logger.warn("votes.enrich.docx_gone", { itemId, url });
      return null;
    }
    throw err;
  }
  try {
    const notes = extractExplanatoryNotes({ text: extractDocxText({ docx: file }) });
    if (!notes) logger.warn("votes.enrich.no_explanatory_notes", { itemId, url });
    return notes;
  } catch (err) {
    logger.warn("votes.enrich.docx_parse_failed", { itemId, url, err: String(err) });
    return null;
  }
}

async function enrichBillItem({ db, itemId }: { db: VotesDb; itemId: number }): Promise<void> {
  const sourceUrl = buildODataUrl({ entity: "KNS_Bill", filter: `BillID eq ${itemId}` });
  const [bills, docs] = await Promise.all([
    fetchAll<KnsBill>({ entity: "KNS_Bill", filter: `BillID eq ${itemId}` }),
    fetchAll<KnsDocumentBill>({ entity: "KNS_DocumentBill", filter: `BillID eq ${itemId}` }),
  ]);
  const bill = bills[0];
  if (!bill) throw new Error(`KNS_Bill ${itemId} not found`); // fetch-level → no row, retry next run

  const fetchedAt = new Date();
  let descriptionHe = bill.SummaryLaw?.trim() || null;
  let descriptionSource: VoteItemInsert["descriptionSource"] = descriptionHe ? "summary_law" : null;
  if (!descriptionHe) {
    const docx = pickPreliminaryDocx({ docs });
    if (docx) {
      const notes = await tryExtractNotes({ url: normalizeDocPath({ filePath: docx.FilePath }), itemId });
      if (notes) {
        descriptionHe = notes;
        descriptionSource = "explanatory_notes";
      }
    }
  }
  const latestDoc = pickLatestBillDoc({ docs });
  await upsertVoteItem({
    db,
    row: {
      itemId,
      itemTypeId: ITEM_TYPE_BILL,
      descriptionHe,
      descriptionSource,
      legislationUrl: buildLegislationUrl({ billId: itemId }),
      docUrl: latestDoc ? normalizeDocPath({ filePath: latestDoc.FilePath }) : null,
      docTypeDescHe: latestDoc?.GroupTypeDesc ?? null,
      initiatorPersonId: null,
      sourceDataset: "odata:KNS_Bill+KNS_DocumentBill",
      sourceUrl,
      fetchedAt,
    },
    bill: normalizeBills([bill], { sourceUrl, fetchedAt })[0],
  });
}

async function enrichAgendaItem({ db, itemId }: { db: VotesDb; itemId: number }): Promise<void> {
  const sourceUrl = buildODataUrl({ entity: "KNS_Agenda", filter: `AgendaID eq ${itemId}` });
  const [agendas, docs] = await Promise.all([
    fetchAll<KnsAgenda>({ entity: "KNS_Agenda", filter: `AgendaID eq ${itemId}` }),
    fetchAll<KnsDocumentAgenda>({ entity: "KNS_DocumentAgenda", filter: `AgendaID eq ${itemId}` }),
  ]);
  const agenda = agendas[0];
  if (!agenda) throw new Error(`KNS_Agenda ${itemId} not found`);

  const fetchedAt = new Date();
  const motionDocx = pickAgendaDoc({ docs, application: "DOC" });
  const descriptionHe = motionDocx
    ? await tryExtractNotes({ url: normalizeDocPath({ filePath: motionDocx.FilePath }), itemId })
    : null;
  const motionPdf = pickAgendaDoc({ docs, application: "PDF" });
  await upsertVoteItem({
    db,
    row: {
      itemId,
      itemTypeId: ITEM_TYPE_AGENDA,
      descriptionHe,
      descriptionSource: descriptionHe ? "motion_text" : null,
      legislationUrl: null, // the legislation DB covers bills only
      docUrl: motionPdf ? normalizeDocPath({ filePath: motionPdf.FilePath }) : null,
      docTypeDescHe: motionPdf?.GroupTypeDesc ?? null,
      initiatorPersonId: agenda.InitiatorPersonID ?? null,
      sourceDataset: "odata:KNS_Agenda+KNS_DocumentAgenda",
      sourceUrl,
      fetchedAt,
    },
  });
}

// Normalizers for the Knesset website vote API → our schema rows.
// Closed maps only: an unknown result id / vote type / counter title THROWS —
// a value we can't classify is never guessed (house rule), and the throw
// surfaces a service-side domain change immediately.

import { jerusalemWallToUtc } from "@/lib/time";
import type { knessetVotes, mkVotesRaw } from "@/app/lib/schema";
import { nameKey } from "./name-key";
import { voteSourceUrl } from "./website-api";
import type { WsVoteDetailsResponse, WsVoteHeader } from "./website-types";

export type KnessetVoteInsert = typeof knessetVotes.$inferInsert;
export type MkVoteRawInsert = typeof mkVotesRaw.$inferInsert;
export type MkVoteResultValue = "for" | "against" | "abstain" | "didnt_vote";
export type VoteTypeValue = "electronic" | "hand" | "roll_call" | "secret";

export interface Prov { fetchedAt: Date }

// Verified by the 2026-06-10 probe (29-vote stratified sample, full term).
export const WEBSITE_RESULT_BY_ID: Record<number, MkVoteResultValue> = {
  6: "didnt_vote", // נוכח
  7: "for",        // בעד
  8: "against",    // נגד
  9: "abstain",    // נמנע
};

// Header VoteType domain enumerated over all 6,979 K25 votes (same probe).
export const HEADER_VOTE_TYPE: Record<string, VoteTypeValue> = {
  "אלקטרונית": "electronic",
  "הרמת יד": "hand",
  "שמית": "roll_call",
  "חשאית": "secret",
};

const COUNTER_FIELD: Record<string, "totalFor" | "totalAgainst" | "totalAbstain" | "totalDidntVote"> = {
  "בעד": "totalFor",
  "נגד": "totalAgainst",
  "נמנע": "totalAbstain",
  "נוכח ולא הצביע": "totalDidntVote",
};

/** Per-MK breakdowns exist only for these types (probe-verified). */
export function isScoreableType(t: VoteTypeValue): boolean {
  return t === "electronic" || t === "roll_call";
}

export const VOTES_SOURCE_DATASET = "websiteapi:Votes/GetVoteDetails";

export function normalizeVoteHeader(h: WsVoteHeader, prov: Prov): KnessetVoteInsert {
  const voteType = HEADER_VOTE_TYPE[h.VoteType];
  if (!voteType) throw new Error(`unknown header VoteType "${h.VoteType}" (voteId ${h.VoteId})`);
  return {
    voteId: h.VoteId,
    knessetNum: h.KnessetId,
    titleHe: h.ItemTitle,
    voteDate: jerusalemWallToUtc(h.VoteDate),
    voteType,
    sourceDataset: VOTES_SOURCE_DATASET,
    sourceUrl: voteSourceUrl(h.VoteId),
    fetchedAt: prov.fetchedAt,
  };
}

export interface VoteDetailsPatch {
  itemId: number | null;
  decisionHe: string | null;
  isAccepted: boolean | null;
  totalFor: number | null;
  totalAgainst: number | null;
  totalAbstain: number | null;
  totalDidntVote: number | null;
}

export interface NormalizedVoteDetails {
  patch: VoteDetailsPatch;
  rawRows: MkVoteRawInsert[];
}

export function normalizeVoteDetails(
  voteId: number,
  d: WsVoteDetailsResponse,
  prov: Prov,
): NormalizedVoteDetails {
  const header = d.VoteHeader?.[0];
  const patch: VoteDetailsPatch = {
    itemId: header?.FK_ItemID ?? null,
    decisionHe: header?.Decision ?? null,
    isAccepted: header?.IsForAccepted ?? null,
    totalFor: null,
    totalAgainst: null,
    totalAbstain: null,
    totalDidntVote: null,
  };
  for (const c of d.VoteCounters ?? []) {
    const field = COUNTER_FIELD[c.Title];
    if (!field) throw new Error(`unknown VoteCounters title "${c.Title}" (voteId ${voteId})`);
    patch[field] = c.countOfResult;
  }

  const rawRows: MkVoteRawInsert[] = [];
  for (const row of d.VoteDetails ?? []) {
    if (!(row.VoteResultId in WEBSITE_RESULT_BY_ID)) {
      throw new Error(`unknown VoteResultId ${row.VoteResultId} ("${row.Title}", voteId ${voteId})`);
    }
    rawRows.push({
      voteId,
      mkNameRaw: row.MkName,
      mkNameKey: nameKey(row.MkName),
      factionNameRaw: row.FactionName ?? null,
      voteResultIdRaw: row.VoteResultId,
      resultTitleRaw: row.Title,
      sourceDataset: VOTES_SOURCE_DATASET,
      sourceUrl: voteSourceUrl(voteId),
      fetchedAt: prov.fetchedAt,
    });
  }
  return { patch, rawRows };
}

// --- decisive-vote heuristic (probe-validated against real Decision strings) ---

interface DecisiveCandidate {
  voteId: number;
  voteType: VoteTypeValue;
  decisionHe: string | null;
  isAccepted: boolean | null;
  voteDate: Date;
}

/** Reading rank from the Decision text: 3 > 2 > 1 > 0 (not a reading vote). */
function readingRank(decisionHe: string | null): number {
  if (!decisionHe) return 0;
  if (decisionHe.includes("קריאה שלישית")) return 3;
  if (decisionHe.includes("קריאה שנייה") || decisionHe.includes("קריאה שניה")) return 2;
  if (decisionHe.includes("קריאה ראשונה")) return 1;
  return 0;
}

/**
 * The decisive (representative) vote of an item: the highest ACCEPTED reading
 * vote among scoreable types, else the latest scoreable vote, else — for
 * items whose votes are all hand/secret — the latest vote of any type (so the
 * item still has a feed representative). Reservation roll-calls (lower/no
 * rank) are thereby excluded from matching — they read as coalition
 * discipline, not positions. NB: matching must ALSO filter voteType to the
 * scoreable set; a hand vote can be decisive (feed spine) but never scored.
 */
export function pickDecisiveVoteId(votes: DecisiveCandidate[]): number | null {
  if (!votes.length) return null;
  const scoreable = votes.filter((v) => isScoreableType(v.voteType));
  const pool = scoreable.length ? scoreable : votes;
  const ranked = pool
    .map((v) => ({ v, rank: v.isAccepted ? readingRank(v.decisionHe) : 0 }))
    .sort((a, b) =>
      b.rank - a.rank ||
      b.v.voteDate.getTime() - a.v.voteDate.getTime() ||
      b.v.voteId - a.v.voteId,
    );
  return ranked[0].v.voteId;
}

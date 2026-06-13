// Server-side mapping helpers that translate domain rows into the DeckQuestion
// view-model. Pages call these rather than inlining the conversion logic, so
// the type contract is enforced in one place.

import { pct } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";
import type { Market, Politician } from "@/lib/types";
import type { DeckQuestion, DeckStanceSeed } from "./types";
import type { DeckVote } from "@/app/lib/votes/read-repo";
import type { MarketCardData } from "@/app/lib/markets/feed";
import type { StanceState } from "@/app/lib/stances/service";
import { MATCH_UNLOCK_THRESHOLD } from "@/app/lib/stances/service";

// ─── vote → DeckQuestion ──────────────────────────────────────────────────────

/**
 * Build the own-page DeckQuestion for a decisive Knesset vote.
 *
 * `stanceState` comes from `getStanceState` (server-fetched for the own page);
 * it is absent for queue cards, which start unanswered with no seed.
 * Shares are always null here — the QuestionDeckCard reveals the aggregate
 * from `stanceSeed` (post-answer server response), never from pre-seeded shares.
 */
export function voteToOwnDeckQuestion({
  voteId,
  titleHe,
  stanceState,
}: {
  voteId: number;
  titleHe: string;
  stanceState: StanceState | null;
}): DeckQuestion {
  const stanceSeed: DeckStanceSeed | undefined = stanceState
    ? {
        aggregate: stanceState.aggregate,
        progress: {
          scoreableCount: stanceState.scoreableCount,
          unlockThreshold: MATCH_UNLOCK_THRESHOLD,
        },
      }
    : undefined;

  return {
    key: `v_${voteId}`,
    kind: "stance",
    voteId,
    chip: "הצבעה בכנסת",
    title: titleHe,
    options: [
      { id: "for", label: "בעד", share: null },
      { id: "against", label: "נגד", share: null },
    ],
    href: `/vote/${voteId}`,
    hrefLabel: "לעמוד ההצבעה",
    initialAnswerId: stanceState?.stance ?? null,
    stanceSeed,
  };
}

/**
 * Map a queue DeckVote (from `getUnansweredDeckVotes`) into a DeckQuestion.
 * Always starts unanswered with no stanceSeed.
 */
export function deckVoteToQueueQuestion({ voteId, titleHe }: DeckVote): DeckQuestion {
  return {
    key: `v_${voteId}`,
    kind: "stance",
    voteId,
    chip: "הצבעה בכנסת",
    title: titleHe,
    options: [
      { id: "for", label: "בעד", share: null },
      { id: "against", label: "נגד", share: null },
    ],
    href: `/vote/${voteId}`,
    hrefLabel: "לעמוד ההצבעה",
    initialAnswerId: null,
  };
}

// ─── market → DeckQuestion ────────────────────────────────────────────────────

/**
 * Build the own-page DeckQuestion for an open prediction market.
 * Shares come from live predictor counts (already in market.outcomes).
 */
export function marketToOwnDeckQuestion({
  market,
  initialPickId,
}: {
  market: Market;
  initialPickId: string | null;
}): DeckQuestion {
  const total = market.outcomes.reduce((sum, o) => sum + o.predictors, 0);
  return {
    key: `m_${market.id}`,
    kind: market.type === "binary" ? "binary" : "multi",
    marketId: market.id,
    chip: `תחזית · ${categoryLabel(market.category)}`,
    title: market.question,
    options: market.outcomes.map((o) => ({
      id: o.id,
      label: o.label,
      share: pct(o.predictors, total),
      predictors: o.predictors,
      color: o.color,
      personId: o.personId != null ? String(o.personId) : null,
    })),
    href: `/market/${market.id}`,
    hrefLabel: "לעמוד התחזית",
    initialAnswerId: initialPickId,
  };
}

/**
 * Map a queue MarketCardData (from `getUnpredictedOpenMarketCards`) into a
 * DeckQuestion. Always starts unanswered (excludes user's own market).
 */
export function marketCardToQueueQuestion({ market }: MarketCardData): DeckQuestion {
  const total = market.outcomes.reduce((sum, o) => sum + o.predictors, 0);
  return {
    key: `m_${market.id}`,
    kind: market.type === "binary" ? "binary" : "multi",
    marketId: market.id,
    chip: `תחזית · ${categoryLabel(market.category)}`,
    title: market.question,
    options: market.outcomes.map((o) => ({
      id: o.id,
      label: o.label,
      share: pct(o.predictors, total),
      predictors: o.predictors,
      color: o.color,
      personId: o.personId != null ? String(o.personId) : null,
    })),
    href: `/market/${market.id}`,
    hrefLabel: "לעמוד התחזית",
    initialAnswerId: null,
  };
}

// ─── politician merge helper ──────────────────────────────────────────────────

/**
 * Merge two politician arrays by stable id, deduplicating. Used to combine the
 * market page's own politician list with those from queue market cards.
 */
export function mergePoliticians(a: Politician[], b: Politician[]): Politician[] {
  const seen = new Set(a.map((p) => p.id));
  return [...a, ...b.filter((p) => !seen.has(p.id))];
}

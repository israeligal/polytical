// Unified view-model for the answer deck — one client component serves both
// features (prediction markets + Knesset vote stances). Pages build these
// server-side; the deck never fetches. Spec context: components/prototypes/
// (variant E v3) and docs/decisions/answer-deck.md.

import type { CatColor } from "@/lib/types";

export type DeckKind = "binary" | "multi" | "stance";

export interface DeckOption {
  /** Market outcomeId, or the stance value ("for" | "against"). */
  id: string;
  label: string;
  /** Crowd share 0–100. Markets always have it; stances only post-answer (k≥10). */
  share: number | null;
  /** Markets: raw predictor count behind the share. */
  predictors?: number;
  /** Multi rows: categorical tint. */
  color?: CatColor;
  /** Multi rows: outcome politician (portrait resolved via the politicians prop). */
  personId?: string | null;
}

export interface DeckStanceSeed {
  aggregate: { forPct: number; total: number } | null;
  progress: { scoreableCount: number; unlockThreshold: number } | null;
}

export interface DeckQuestion {
  /** Unique within the deck: `m_${marketId}` / `v_${voteId}`. */
  key: string;
  kind: DeckKind;
  /** Exactly one of these is set, matching `kind`. */
  marketId?: string;
  voteId?: number;
  /** Context chip, e.g. "תחזית · מינויים" / "הצבעה בכנסת". */
  chip: string;
  title: string;
  /** The answer options — 2 for binary/stance, 3+ for multi. */
  options: DeckOption[];
  /** The question's own page — /market/[id] or /vote/[id]. */
  href: string;
  /** "לעמוד התחזית" / "לעמוד ההצבעה". */
  hrefLabel: string;
  /** Server-known existing pick (own-page card on revisit), else null. */
  initialAnswerId: string | null;
  /** Stance cards only: server-seeded aggregate/progress for an answered card. */
  stanceSeed?: DeckStanceSeed;
}

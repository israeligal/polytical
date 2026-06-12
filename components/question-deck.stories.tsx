import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn, expect, within, userEvent } from "storybook/test";
import { QuestionDeck, type QuestionDeckProps } from "@/components/question-deck";
import { createPolitician } from "@/components/story-mocks";
import type { DeckQuestion } from "@/app/lib/deck/types";
import type { StanceActionResult } from "@/app/actions/stances";

type SetStanceFn = NonNullable<QuestionDeckProps["_setStanceAction"]>;
type MakePredictionFn = NonNullable<QuestionDeckProps["_makePredictionAction"]>;

// ─── mock data ────────────────────────────────────────────────────────────────

const politicians = [
  createPolitician({ id: "bibi", name: "בנימין נתניהו", party: "הליכוד", cat: 5 }),
  createPolitician({ id: "smotrich", name: "בצלאל סמוטריץ׳", party: "הציונות הדתית", cat: 6 }),
  createPolitician({ id: "lapid", name: "יאיר לפיד", party: "יש עתיד", cat: 1 }),
  createPolitician({ id: "liberman", name: "אביגדור ליברמן", party: "ישראל ביתנו", cat: 7 }),
];

// ─── deck question factories ──────────────────────────────────────────────────

function makeStanceQ(overrides: Partial<DeckQuestion> = {}): DeckQuestion {
  return {
    key: "v_123",
    kind: "stance",
    voteId: 123,
    chip: "הצבעה בכנסת",
    title: "הצעת חוק שירות ביטחון (תיקון — גיוס תלמידי ישיבות), קריאה ראשונה",
    href: "/vote/123",
    hrefLabel: "לעמוד ההצבעה",
    initialAnswerId: null,
    options: [
      { id: "for", label: "בעד", share: null },
      { id: "against", label: "נגד", share: null },
    ],
    stanceSeed: { aggregate: null, progress: null },
    ...overrides,
  };
}

function makeStanceAnsweredQ(): DeckQuestion {
  return makeStanceQ({
    key: "v_456",
    voteId: 456,
    title: "חוק יסוד: ישראל — מדינת הלאום של העם היהודי (תיקון מס׳ 2)",
    initialAnswerId: "for",
    stanceSeed: {
      aggregate: { forPct: 62, total: 134 },
      progress: { scoreableCount: 7, unlockThreshold: 5 },
    },
  });
}

function makeBinaryQ(overrides: Partial<DeckQuestion> = {}): DeckQuestion {
  return {
    key: "m_elections",
    kind: "binary",
    marketId: "early-elections",
    chip: "תחזית · בחירות",
    title: "האם יוכרזו בחירות מוקדמות עד סוף 2026?",
    href: "/market/early-elections",
    hrefLabel: "לעמוד התחזית",
    initialAnswerId: null,
    options: [
      { id: "yes", label: "כן", share: 30 },
      { id: "no", label: "לא", share: 70 },
    ],
    ...overrides,
  };
}

function makeMultiQ(overrides: Partial<DeckQuestion> = {}): DeckQuestion {
  return {
    key: "m_finance",
    kind: "multi",
    marketId: "next-finance-minister",
    chip: "תחזית · מינויים",
    title: "מי יכהן כשר האוצר בתום השנה?",
    href: "/market/next-finance-minister",
    hrefLabel: "לעמוד התחזית",
    initialAnswerId: null,
    options: [
      { id: "smotrich", label: "סמוטריץ׳", share: 54, color: 5, personId: "smotrich" },
      { id: "barkat", label: "ניר ברקת", share: 21, color: 1 },
      { id: "liberman", label: "ליברמן", share: 12, color: 7, personId: "liberman" },
      { id: "other", label: "אחר", share: 13, color: 4 },
    ],
    ...overrides,
  };
}

// ─── mock actions ─────────────────────────────────────────────────────────────

/** Successful stance action that reveals an aggregate. */
function makeStanceOkAction(
  stance: "for" | "against" | null = "for",
): (args: { voteId: number; stance: "for" | "against" }) => Promise<StanceActionResult> {
  return async () =>
    ({
      ok: true,
      stance,
      aggregate: { forPct: 62, total: 135 },
      scoreableCount: 3,
      unlockThreshold: 5,
      prevScoreableCount: 2,
    }) as StanceActionResult;
}

/** Successful prediction action. */
function makePredictionOkAction(): (args: { marketId: string; outcomeId: string }) => Promise<{ ok: boolean; message?: string }> {
  return async () => ({ ok: true });
}

/** Rate-limited action. */
function makeRateLimitedAction(): (args: { voteId: number; stance: "for" | "against" }) => Promise<StanceActionResult> {
  return async () => ({ ok: false, message: "האטו לרגע" });
}

/** Failing prediction action for error states. */
function makeFailingPredictionAction(): (args: { marketId: string; outcomeId: string }) => Promise<{ ok: boolean; message?: string }> {
  return async () => ({ ok: false, message: "אירעה שגיאה — נסו שוב" });
}

// ─── meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: "Deck/QuestionDeck",
  component: QuestionDeck,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (Story: () => React.ReactNode) => (
      <div className="mx-auto w-full max-w-md">
        <Story />
      </div>
    ),
  ],
  args: {
    politicians,
    loggedIn: true,
    feedHref: "/votes",
    feedLabel: "חזרה להצבעות",
    _setStanceAction: makeStanceOkAction(),
    _makePredictionAction: makePredictionOkAction(),
  },
} satisfies Meta<typeof QuestionDeck>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── stories ──────────────────────────────────────────────────────────────────

/**
 * Vote-page deck: first card is a stance, followed by a mixed queue.
 * The first card is the page's own question (the "own-page card" convention).
 */
export const VotePageDeck: Story = {
  name: "Vote page — stance first + mixed queue",
  args: {
    questions: [
      makeStanceQ(),
      makeStanceQ({
        key: "v_456",
        voteId: 456,
        title: "חוק יסוד: ישראל — מדינת הלאום של העם היהודי (תיקון מס׳ 2)",
      }),
      makeBinaryQ(),
      makeStanceQ({
        key: "v_789",
        voteId: 789,
        title: "הצעת חוק הדברת הנחשים — תיקון 14 — קריאה שנייה",
      }),
    ],
    feedHref: "/votes",
    feedLabel: "חזרה להצבעות",
  },
};

/**
 * Market binary deck: two-option prediction market cards.
 */
export const MarketBinaryDeck: Story = {
  name: "Market — binary deck",
  args: {
    questions: [
      makeBinaryQ(),
      makeBinaryQ({
        key: "m_budget",
        marketId: "budget-2026",
        chip: "תחזית · תקציב",
        title: "האם תקציב 2026 יאושר עד המועד החוקי?",
        options: [
          { id: "yes", label: "כן", share: 45 },
          { id: "no", label: "לא", share: 55 },
        ],
      }),
      makeBinaryQ({
        key: "m_coalition",
        marketId: "coalition-falls",
        chip: "תחזית · קואליציה",
        title: "האם הקואליציה תתפרק עד תחילת 2027?",
        options: [
          { id: "yes", label: "כן", share: 38 },
          { id: "no", label: "לא", share: 62 },
        ],
      }),
    ],
    feedHref: "/markets",
    feedLabel: "חזרה לתחזיות",
  },
};

/**
 * Multi-outcome deck: pick-one-of-many candidate markets.
 */
export const MarketMultiDeck: Story = {
  name: "Market — multi outcome deck",
  args: {
    questions: [makeMultiQ()],
    feedHref: "/markets",
    feedLabel: "חזרה לתחזיות",
  },
};

/**
 * Deck with a pre-answered first card (own-page revisit) — shows aggregate,
 * progress, and deck already open from load.
 */
export const AnsweredFirstCard: Story = {
  name: "Revisit — answered first card",
  args: {
    questions: [
      makeStanceAnsweredQ(),
      makeStanceQ({ key: "v_next", voteId: 999 }),
    ],
    feedHref: "/votes",
    feedLabel: "חזרה להצבעות",
  },
};

/**
 * Rate-limit error: tapping an option shows the inline message.
 */
export const RateLimitError: Story = {
  name: "Error — rate limited",
  args: {
    questions: [makeStanceQ()],
    _setStanceAction: makeRateLimitedAction(),
    feedHref: "/votes",
    feedLabel: "חזרה להצבעות",
  },
};

/**
 * Action failure: shows inline error on the card and keeps it.
 */
export const ActionFailure: Story = {
  name: "Error — action failure",
  args: {
    questions: [makeBinaryQ()],
    _makePredictionAction: makeFailingPredictionAction(),
    feedHref: "/markets",
    feedLabel: "חזרה לתחזיות",
  },
};

/**
 * Logged-out state: only the first question is shown, read-only, with a
 * sign-in CTA instead of interactive buttons.
 */
export const LoggedOut: Story = {
  name: "Logged out — read-only",
  args: {
    questions: [makeStanceQ()],
    loggedIn: false,
    feedHref: "/votes",
    feedLabel: "חזרה להצבעות",
  },
};

/**
 * Logged-out with a market card (login CTA copy differs by kind).
 */
export const LoggedOutMarket: Story = {
  name: "Logged out — market",
  args: {
    questions: [makeBinaryQ()],
    loggedIn: false,
    feedHref: "/markets",
    feedLabel: "חזרה לתחזיות",
  },
};

/**
 * Mobile viewport — matches the skeletons.stories pattern.
 */
export const Mobile: Story = {
  name: "Mobile viewport",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: {
    questions: [makeStanceQ(), makeBinaryQ()],
    feedHref: "/votes",
    feedLabel: "חזרה להצבעות",
  },
};

/**
 * End-of-deck card — all questions answered to reach the summary.
 * Uses Storybook fn() for the interaction test.
 */
export const EndOfDeck: Story = {
  name: "End of deck — all answered",
  args: {
    questions: [
      makeStanceQ({ initialAnswerId: "for" }),
      makeBinaryQ({ initialAnswerId: "yes" }),
    ],
    feedHref: "/votes",
    feedLabel: "חזרה להצבעות",
    _setStanceAction: fn(makeStanceOkAction()) as SetStanceFn,
    _makePredictionAction: fn(makePredictionOkAction()) as MakePredictionFn,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Both cards are pre-answered — deck should show the end card
    await expect(canvas.getByText("ענית על הכול!")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /חזרה להצבעות/ })).toBeInTheDocument();
  },
};

/**
 * Interaction: tap an answer on a stance card; the deck should
 * eventually advance and show the progress region.
 */
export const TapAnswer: Story = {
  name: "Interaction — tap stance answer",
  args: {
    questions: [makeStanceQ(), makeBinaryQ()],
    _setStanceAction: fn(makeStanceOkAction("for")) as SetStanceFn,
    _makePredictionAction: fn(makePredictionOkAction()) as MakePredictionFn,
    feedHref: "/votes",
    feedLabel: "חזרה להצבעות",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const forBtn = canvas.getByRole("button", { name: "בעד" });
    await expect(forBtn).toBeInTheDocument();
    await userEvent.click(forBtn);
    // After tap the button shows aria-pressed=true (optimistic)
    await expect(forBtn).toHaveAttribute("aria-pressed", "true");
  },
};

import { useState } from "react";
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
 * Revisit landing — the page's own question (card 0) is pre-answered. The deck
 * must land ON IT showing the pick (never skip ahead to a queue card), with the
 * chrome already open so the queue is one tap away.
 */
export const RevisitLanding: Story = {
  name: "Revisit — lands on own answered card, chrome open",
  args: {
    questions: [makeStanceQ({ initialAnswerId: "for" }), makeBinaryQ()],
    feedHref: "/votes",
    feedLabel: "חזרה להצבעות",
    _setStanceAction: fn(makeStanceOkAction()) as SetStanceFn,
    _makePredictionAction: fn(makePredictionOkAction()) as MakePredictionFn,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Lands on the own card with the pick lit — not on the queue card.
    await expect(canvas.getByRole("button", { name: /בעד ✓/ })).toBeInTheDocument();
    // Chrome is open on a revisit (arrows present).
    await expect(canvas.getByRole("button", { name: "השאלה הבאה" })).toBeInTheDocument();
  },
};

/**
 * FIX 2 regression: walking forward to the end card and back must always
 * render the answered cards with their picks (the bug showed blank cards).
 */
export const BackFromEnd: Story = {
  name: "Regression — end card round-trip shows answered cards",
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
    const nextBtn = canvas.getByRole("button", { name: "השאלה הבאה" });
    // Walk forward: own card → answered queue card → end card.
    await userEvent.click(nextBtn);
    await expect(await canvas.findByRole("button", { name: /כן ✓/ })).toBeInTheDocument();
    await userEvent.click(nextBtn);
    await expect(await canvas.findByText("ענית על הכול!")).toBeInTheDocument();
    // Back from the end card must reveal the answered card again, pick lit.
    const prevBtn = canvas.getByRole("button", { name: "השאלה הקודמת" });
    await userEvent.click(prevBtn);
    await expect(await canvas.findByRole("button", { name: /כן ✓/ })).toBeInTheDocument();
  },
};

/**
 * BUG 2 regression — prop-shrink: simulates the revalidatePath-triggered
 * RSC re-render that passes a shorter `questions` array to an already-mounted
 * QuestionDeck. Without the freeze fix, answered cards would vanish from the
 * stack; with the fix the deck ignores the shrunken prop and keeps all cards.
 *
 * The wrapper simulates what the server does: after the action resolves it
 * cuts the answered question from the questions array (mimicking
 * getUnansweredDeckVotes / getUnpredictedOpenMarketCards excluding answered
 * items). The deck must still show all original questions navigable back/forward.
 */
function PropShrinkWrapper(props: QuestionDeckProps) {
  const full = [makeStanceQ(), makeBinaryQ()];
  const [questions, setQuestions] = useState<DeckQuestion[]>(full);
  const shrinkingStanceAction: QuestionDeckProps["_setStanceAction"] = async (args) => {
    const result = await (props._setStanceAction ?? makeStanceOkAction())(args);
    if (result.ok) {
      // Simulate RSC re-render: strip the just-answered stance card
      setQuestions(full.filter((q) => q.kind !== "stance"));
    }
    return result;
  };
  return (
    <QuestionDeck
      {...props}
      questions={questions}
      _setStanceAction={shrinkingStanceAction}
    />
  );
}

export const PropShrinkRegression: Story = {
  name: "Regression — answered cards survive prop shrink (BUG 2)",
  render: (args) => <PropShrinkWrapper {...args} />,
  args: {
    questions: [makeStanceQ(), makeBinaryQ()],
    feedHref: "/votes",
    feedLabel: "חזרה להצבעות",
    _setStanceAction: fn(makeStanceOkAction()) as SetStanceFn,
    _makePredictionAction: fn(makePredictionOkAction()) as MakePredictionFn,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Tap the first card's answer — this triggers the prop-shrink via shrinkingStanceAction.
    const forBtn = canvas.getByRole("button", { name: "בעד" });
    await userEvent.click(forBtn);
    // After the optimistic update the button should be pressed.
    await expect(forBtn).toHaveAttribute("aria-pressed", "true");
    // Wait for the deck chrome (next/prev buttons) to appear, meaning the deck
    // advanced past the first card.
    const nextBtn = await canvas.findByRole("button", { name: "השאלה הבאה" }, { timeout: 3000 });
    await expect(nextBtn).toBeInTheDocument();
    // Navigate back — must still show the answered stance card (prop was shrunken,
    // but the frozen list keeps it).
    const prevBtn = canvas.getByRole("button", { name: "השאלה הקודמת" });
    await userEvent.click(prevBtn);
    await expect(await canvas.findByRole("button", { name: /בעד ✓/ })).toBeInTheDocument();
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

import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BottomSheetProto, DesktopRailProto, InlineStackProto } from "./proto-immediate";
import { CarouselProto, CtaPeekProto } from "./proto-next-button";

/**
 * ⚠️ THROWAWAY brainstorm prototypes for the post-answer "next question" flow
 * (predictions + votes share one grammar). Play each variant: answer the first
 * question with one tap and watch what happens. The queue mixes markets and
 * vote stances ON PURPOSE to prove the grammar — prod pools stay per-feature.
 * Delete components/prototypes/ after the design decision.
 */
const meta = {
  title: "Prototypes/Next Flow",
  component: InlineStackProto,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof InlineStackProto>;

export default meta;
type Story = StoryObj<typeof meta>;

const mobile = { viewport: { value: "mobile1", isRotated: false } } as const;

const Phone = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-background">
    <div className="mx-auto w-full max-w-md p-4">{children}</div>
  </div>
);

/** A — IMMEDIATE · the answered card collapses and the next one rises under it. */
export const AInlineStack: Story = {
  name: "A · מיידי — ערימה במקום",
  globals: mobile,
  render: () => (
    <Phone>
      <InlineStackProto />
    </Phone>
  ),
};

/** B — IMMEDIATE · a thumb-zone bottom sheet rises with the next question. */
export const BBottomSheet: Story = {
  name: "B · מיידי — מגירה תחתונה",
  globals: mobile,
  render: () => (
    <Phone>
      <BottomSheetProto />
    </Phone>
  ),
};

/** C — NEXT BUTTON · confirmation + peek teaser; the button NAVIGATES to the next full page. */
export const CNextButtonNavigate: Story = {
  name: "C · כפתור — ניווט לעמוד הבא",
  globals: mobile,
  render: () => (
    <Phone>
      <CtaPeekProto />
    </Phone>
  ),
};

/** D — NEXT BUTTON · the question card swaps in place; note the stale page content below. */
export const DCarouselSwap: Story = {
  name: "D · כפתור — החלפה במקום",
  globals: mobile,
  render: () => (
    <Phone>
      <CarouselProto />
    </Phone>
  ),
};

/** Desktop adaptation shared by A/B: the next question spotlights in the existing 320px rail. */
export const DesktopRail: Story = {
  name: "דסקטופ — הבא בתור ברייל",
  render: () => (
    <div className="min-h-screen bg-background p-6">
      <DesktopRailProto />
    </div>
  ),
};

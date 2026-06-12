import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BinaryButtonsCompare } from "./proto-binary-buttons";

/**
 * ⚠️ THROWAWAY brainstorm prototypes — binary answer-button redesigns
 * (Polymarket-size targets, Polytical tokens). All one-tap: tap = answer,
 * no separate "תנו מנדט" submit. The first section renders today's pills
 * for an honest side-by-side. Delete after the design decision.
 */
const meta = {
  title: "Prototypes/Binary Buttons",
  component: BinaryButtonsCompare,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof BinaryButtonsCompare>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Phone width — where the size upgrade matters most. */
export const CompareMobile: Story = {
  name: "השוואה — מובייל",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-md p-4">
        <BinaryButtonsCompare />
      </div>
    </div>
  ),
};

/** Main-column width on desktop (post-hybrid the binary control leaves the 320px rail). */
export const CompareDesktop: Story = {
  name: "השוואה — דסקטופ",
  render: () => (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto w-full max-w-xl">
        <BinaryButtonsCompare />
      </div>
    </div>
  ),
};

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { OddsBar } from "@/components/odds-bar";
import { createBinaryMarket, createMultiMarket } from "@/components/story-mocks";

/**
 * The signature crowd-odds bar. Binary markets use the reserved
 * positive/negative tokens; multi markets use categorical segments sorted by
 * predictor counts. Widths are count-derived, so the controls expose the `outcomes` array.
 */
const meta = {
  title: "Markets/OddsBar",
  component: OddsBar,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  argTypes: {
    market: { control: "object" },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-card p-5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OddsBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Binary: Story = {
  args: { market: createBinaryMarket() },
};

export const BinaryLeaningYes: Story = {
  args: {
    market: createBinaryMarket({
      question: "האם תקציב 2026 יאושר עד המועד החוקי?",
      outcomes: [
        { id: "yes", label: "כן", predictors: 8600 },
        { id: "no", label: "לא", predictors: 1400 },
      ],
    }),
  },
};

export const Multi: Story = {
  args: { market: createMultiMarket() },
};

export const EmptyPool: Story = {
  args: {
    market: createBinaryMarket({
      outcomes: [
        { id: "yes", label: "כן", predictors: 0 },
        { id: "no", label: "לא", predictors: 0 },
      ],
    }),
  },
};

/** Interaction test: the rendered percentages must sum to 100 and match the predictor split. */
export const VerifiesPercentages: Story = {
  args: {
    market: createBinaryMarket({
      outcomes: [
        { id: "yes", label: "כן", predictors: 4200 },
        { id: "no", label: "לא", predictors: 9800 },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 4200 / 14000 = 30%, complement = 70%.
    await expect(canvas.getByText("30%")).toBeInTheDocument();
    await expect(canvas.getByText("70%")).toBeInTheDocument();
  },
};

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { VoteTotalsBar } from "@/components/vote-totals-bar";
import { createVoteTotals } from "@/components/story-mocks";

const meta = {
  title: "Votes/VoteTotalsBar",
  component: VoteTotalsBar,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  argTypes: { totals: { control: "object" } },
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-card p-5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof VoteTotalsBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Typical: Story = {
  args: { totals: createVoteTotals() },
};

export const NoAbstain: Story = {
  args: { totals: createVoteTotals({ totalAbstain: 0 }) },
};

export const Landslide: Story = {
  args: { totals: createVoteTotals({ totalFor: 110, totalAgainst: 2, totalAbstain: 0 }) },
};

/** Hand votes pending details / secret votes carry no counters at all. */
export const NoBreakdown: Story = {
  args: { totals: createVoteTotals({ totalFor: null, totalAgainst: null, totalAbstain: null }) },
};

export const VerifiesCounts: Story = {
  args: { totals: createVoteTotals() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("54")).toBeInTheDocument();
    await expect(canvas.getByText("38")).toBeInTheDocument();
    await expect(
      canvas.getByRole("img", { name: "בעד 54, נגד 38, נמנע 4" }),
    ).toBeInTheDocument();
  },
};

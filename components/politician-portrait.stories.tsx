import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PoliticianPortrait } from "@/components/politician-portrait";
import { createPolitician } from "@/components/story-mocks";

/**
 * The caricature portrait fallback (halftone + serif initials, tinted by the
 * politician's categorical color). The `card` size adds the "קריקטורה" tag.
 */
const meta = {
  title: "Cards/PoliticianPortrait",
  component: PoliticianPortrait,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    size: { control: "inline-radio", options: ["sm", "md", "card"] },
    politician: { control: "object" },
  },
} satisfies Meta<typeof PoliticianPortrait>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Card: Story = {
  args: { politician: createPolitician(), size: "card" },
  decorators: [
    (Story) => (
      <div className="w-48">
        <Story />
      </div>
    ),
  ],
};

export const Medium: Story = {
  args: { politician: createPolitician(), size: "md" },
};

export const Small: Story = {
  args: { politician: createPolitician(), size: "sm" },
};

export const Sizes: Story = {
  args: { politician: createPolitician(), size: "md" },
  render: () => (
    <div className="flex items-end gap-4">
      <PoliticianPortrait politician={createPolitician()} size="sm" />
      <PoliticianPortrait politician={createPolitician()} size="md" />
      <div className="w-40">
        <PoliticianPortrait politician={createPolitician()} size="card" />
      </div>
    </div>
  ),
};

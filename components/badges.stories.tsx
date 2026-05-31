import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CategoryBadge, Countdown, HotBadge } from "@/components/badges";
import type { Category } from "@/lib/types";

const CATEGORY_OPTIONS: Category[] = [
  "elections",
  "coalition",
  "security",
  "legislation",
  "personnel",
  "scandals",
];

/**
 * Market metadata badges: the primary-blue category overline, the gold "hot"
 * pill, and the relative-time countdown. Grouped here since they share the
 * `badges.tsx` module.
 */
const meta = {
  title: "Badges/CategoryBadge",
  component: CategoryBadge,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    category: { control: "select", options: CATEGORY_OPTIONS },
  },
} satisfies Meta<typeof CategoryBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Category_Elections: Story = {
  name: "Category — Elections",
  args: { category: "elections" },
};

export const Category_Scandals: Story = {
  name: "Category — Scandals",
  args: { category: "scandals" },
};

export const AllCategories: Story = {
  args: { category: "elections" },
  render: () => (
    <div className="flex flex-col items-start gap-2">
      {CATEGORY_OPTIONS.map((c) => (
        <CategoryBadge key={c} category={c} />
      ))}
    </div>
  ),
};

export const Hot: StoryObj<typeof HotBadge> = {
  render: () => <HotBadge />,
};

export const CountdownDays: StoryObj<typeof Countdown> = {
  render: () => (
    <Countdown closeAt={new Date(Date.now() + 3 * 86_400_000).toISOString()} />
  ),
};

export const CountdownHours: StoryObj<typeof Countdown> = {
  render: () => (
    <Countdown closeAt={new Date(Date.now() + 5 * 3_600_000).toISOString()} />
  ),
};

export const CountdownClosed: StoryObj<typeof Countdown> = {
  render: () => <Countdown closeAt={new Date(Date.now() - 3_600_000).toISOString()} />,
};

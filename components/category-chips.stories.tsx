import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { CategoryChips } from "@/components/category-chips";

/**
 * The category picker used in the wizard's "פרטים והגשה" step. Replaces a
 * native <select> with tap-friendly chips and a mint pill that springs between
 * selections (shared layoutId). No popover means nothing to clip or mis-place
 * on mobile.
 */
const CATEGORIES = [
  { key: "elections", he: "בחירות" },
  { key: "coalition", he: "קואליציה" },
  { key: "security", he: "ביטחון" },
  { key: "legislation", he: "חקיקה" },
  { key: "personnel", he: "מינויים" },
  { key: "scandals", he: "פרשות" },
];

function Demo({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="space-y-3">
      <CategoryChips categories={CATEGORIES} value={value} onChange={setValue} />
      <p className="text-xs text-muted-foreground">
        נבחר: <span className="font-bold text-foreground">{value || "—"}</span>
      </p>
    </div>
  );
}

const meta = {
  title: "Forms/SuggestMarket — CategoryChips",
  component: CategoryChips,
  parameters: { layout: "centered" },
  // Required props satisfied here; each story drives a stateful Demo via render.
  args: { categories: CATEGORIES, value: "coalition", onChange: () => {} },
  decorators: [
    (Story) => (
      <div dir="rtl" className="w-full max-w-md p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CategoryChips>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <Demo initial="coalition" /> };
export const NothingSelected: Story = { render: () => <Demo initial="" /> };

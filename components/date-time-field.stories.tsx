import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { DateTimeField } from "@/components/date-time-field";

/**
 * The "מתי השאלה תוכרע?" control. A styled native date field + time field — the
 * pickers stay native so they open the OS wheel on mobile and stay directly
 * typeable on desktop ("people can just enter it"). Emits the same
 * `YYYY-MM-DDTHH:mm` local string the old datetime-local did.
 */
function Demo({ initial, min }: { initial: string; min?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="space-y-3">
      <DateTimeField value={value} onChange={setValue} min={min} />
      <p className="text-xs text-muted-foreground">
        ערך: <span className="nums font-bold text-foreground">{value || "—"}</span>
      </p>
    </div>
  );
}

const meta = {
  title: "Forms/SuggestMarket — DateTimeField",
  component: DateTimeField,
  parameters: { layout: "centered" },
  // Required props satisfied here; each story drives a stateful Demo via render.
  args: { value: "", onChange: () => {} },
  decorators: [
    (Story) => (
      <div dir="rtl" className="w-full max-w-md p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DateTimeField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { render: () => <Demo initial="" min="2026-06-16T09:00" /> };
export const Prefilled: Story = { render: () => <Demo initial="2026-07-01T23:59" min="2026-06-16T09:00" /> };

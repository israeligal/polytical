import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { UserAvatar } from "@/components/user-avatar";

// A 1:1 sample caricature (data URI keeps the story self-contained).
const SAMPLE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><defs><radialGradient id='g'><stop offset='0%' stop-color='%2360a5fa'/><stop offset='100%' stop-color='%231e3a8a'/></radialGradient></defs><rect width='200' height='200' fill='url(%23g)'/><circle cx='100' cy='80' r='42' fill='%23fde68a'/><rect x='55' y='120' width='90' height='80' rx='40' fill='%23fde68a'/></svg>`,
  );

const meta = {
  title: "Identity/UserAvatar",
  component: UserAvatar,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
  },
} satisfies Meta<typeof UserAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Caricature: Story = {
  args: { caricatureUrl: SAMPLE, handle: "ezra", size: "lg" },
};

export const FallbackInitial: Story = {
  args: { caricatureUrl: null, handle: "ezra", size: "lg" },
};

export const HebrewFallback: Story = {
  args: { caricatureUrl: null, handle: "אריאל", size: "lg" },
};

export const NoHandleFallback: Story = {
  args: { caricatureUrl: null, handle: null, size: "lg" },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-4" dir="rtl">
      <UserAvatar caricatureUrl={SAMPLE} handle="ezra" size="sm" />
      <UserAvatar caricatureUrl={SAMPLE} handle="ezra" size="md" />
      <UserAvatar caricatureUrl={SAMPLE} handle="ezra" size="lg" />
      <UserAvatar caricatureUrl={null} handle="ezra" size="sm" />
      <UserAvatar caricatureUrl={null} handle="ezra" size="md" />
      <UserAvatar caricatureUrl={null} handle="ezra" size="lg" />
    </div>
  ),
};

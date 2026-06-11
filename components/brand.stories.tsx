import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PolyticalLogo } from "@/components/icons";

/**
 * The Polytical brand mark: an interlaced Magen David — the YES up-triangle
 * woven with the NO down-triangle. Strokes ride the `--positive`/`--negative`
 * outcome tokens, so the star is techelet blue + red on the light theme and
 * mint + coral on the dark one. The Theme stories pin `data-theme` on a local
 * wrapper (mirroring what layout.tsx sets on <html>) so both variants are
 * visible side by side regardless of the global toggle.
 */
const meta = {
  title: "Brand/PolyticalLogo",
  component: PolyticalLogo,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof PolyticalLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { className: "h-8 w-8" },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      <PolyticalLogo className="h-32 w-32" />
      <PolyticalLogo className="h-16 w-16" />
      <PolyticalLogo className="h-10 w-10" />
      <PolyticalLogo className="h-8 w-8" />
      <PolyticalLogo className="h-5 w-5" />
    </div>
  ),
};

export const LightTheme: Story = {
  name: "Light theme (תכלת)",
  render: () => (
    <div data-theme="light" className="rounded-xl bg-background p-10">
      <PolyticalLogo className="h-24 w-24" />
    </div>
  ),
};

export const DarkTheme: Story = {
  name: "Dark theme (mint)",
  render: () => (
    <div data-theme="dark" className="rounded-xl bg-background p-10">
      <PolyticalLogo className="h-24 w-24" />
    </div>
  ),
};

/** The header lockup exactly as site-header.tsx composes it: mark + Hebrew wordmark. */
export const HeaderLockup: Story = {
  name: "Header lockup — פוליטיקל",
  render: () => (
    <div className="flex flex-col gap-6">
      {(["light", "dark"] as const).map((theme) => (
        <div key={theme} data-theme={theme} className="rounded-xl bg-background px-10 py-6">
          <div className="flex items-center gap-2.5">
            <PolyticalLogo className="h-8 w-8" />
            <span className="font-display text-2xl leading-none text-foreground">פוליטיקל</span>
          </div>
        </div>
      ))}
    </div>
  ),
};

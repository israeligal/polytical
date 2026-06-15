import type React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn, expect, within, userEvent } from "storybook/test";
import { ChangeHandleForm, type ChangeHandleFormProps } from "@/components/profile/change-handle-form";

type CheckFn = NonNullable<ChangeHandleFormProps["_checkHandleAction"]>;
type ChangeFn = NonNullable<ChangeHandleFormProps["_changeHandleAction"]>;
type GenerateFn = NonNullable<ChangeHandleFormProps["_generateHandleAction"]>;

// ─── action factories (no live server) ─────────────────────────────────────────
const availableCheck: CheckFn = async () => ({ available: true });
const takenCheck: CheckFn = async () => ({ available: false, reason: "taken" });
const okChange: ChangeFn = async ({ handle }) => ({ ok: true, handle });
const failChange: ChangeFn = async () => ({ ok: false, message: "הכינוי תפוס — בחרו אחר" });
const genOk: GenerateFn = async () => ({ ok: true, handle: "מנדט_עודף" });

const meta = {
  title: "Profile/ChangeHandleForm",
  component: ChangeHandleForm,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (Story: () => React.ReactNode) => (
      <div className="mx-auto w-full max-w-md" dir="rtl">
        <Story />
      </div>
    ),
  ],
  args: {
    currentHandle: "gal",
    _checkHandleAction: fn(availableCheck) as CheckFn,
    _changeHandleAction: fn(okChange) as ChangeFn,
    _generateHandleAction: fn(genOk) as GenerateFn,
  },
} satisfies Meta<typeof ChangeHandleForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default resting state: a single, unobtrusive "edit handle" affordance. */
export const Collapsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "ערכו כינוי" })).toBeInTheDocument();
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
  },
};

/** Typing an available handle lights the free state and enables save. */
export const EditingAvailable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "ערכו כינוי" }));
    const input = canvas.getByRole("textbox", { name: "כינוי חדש" });
    await userEvent.clear(input);
    await userEvent.type(input, "knesset_nerd");
    await expect(await canvas.findByText(/פנוי/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "שמרו" })).toBeEnabled();
  },
};

/** A taken handle blocks the save. */
export const Taken: Story = {
  args: { _checkHandleAction: fn(takenCheck) as CheckFn },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "ערכו כינוי" }));
    const input = canvas.getByRole("textbox", { name: "כינוי חדש" });
    await userEvent.clear(input);
    await userEvent.type(input, "polldancer");
    await expect(await canvas.findByText(/תפוס/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "שמרו" })).toBeDisabled();
  },
};

/** Saving a valid handle collapses back to the resting state. */
export const SavesAndCollapses: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "ערכו כינוי" }));
    const input = canvas.getByRole("textbox", { name: "כינוי חדש" });
    await userEvent.clear(input);
    await userEvent.type(input, "biko2026");
    await canvas.findByText(/פנוי/);
    await userEvent.click(canvas.getByRole("button", { name: "שמרו" }));
    await expect(await canvas.findByRole("button", { name: "ערכו כינוי" })).toBeInTheDocument();
  },
};

/** A server-side rejection (lost the race) surfaces the message and stays open. */
export const SaveRejected: Story = {
  args: { _changeHandleAction: fn(failChange) as ChangeFn },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "ערכו כינוי" }));
    const input = canvas.getByRole("textbox", { name: "כינוי חדש" });
    await userEvent.clear(input);
    await userEvent.type(input, "biko2026");
    await canvas.findByText(/פנוי/);
    await userEvent.click(canvas.getByRole("button", { name: "שמרו" }));
    await expect(await canvas.findByText("הכינוי תפוס — בחרו אחר")).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "כינוי חדש" })).toBeInTheDocument();
  },
};

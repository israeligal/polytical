import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// The switcher's job is to set the active-coalition context (the call shape) and
// refresh — the action/cookie are tested separately. Mock both boundaries.
const { setActiveCoalitionAction } = vi.hoisted(() => ({ setActiveCoalitionAction: vi.fn() }));
vi.mock("@/app/actions/coalition", () => ({ setActiveCoalitionAction }));
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { GroupSwitcher, type SwitcherGroup } from "@/components/groups/group-switcher";

const GROUPS: SwitcherGroup[] = [
  { id: "g1", slug: "alpha", nameHe: "אלפא", emblem: null },
  { id: "g2", slug: "beta", nameHe: "בטא", emblem: null },
];

beforeEach(() => {
  setActiveCoalitionAction.mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GroupSwitcher", () => {
  it("labels the summary with the active coalition", () => {
    render(<GroupSwitcher groups={GROUPS} activeId="g2" />);
    // the summary label is the <span>; the menu also has a button with the name.
    // getByText throws if absent, so a truthy result IS the presence assertion.
    expect(screen.getByText("בטא", { selector: "span" })).toBeTruthy();
  });

  it("labels the summary ארצי when no coalition is active", () => {
    render(<GroupSwitcher groups={GROUPS} activeId={null} />);
    expect(screen.getByText("ארצי", { selector: "span" })).toBeTruthy();
  });

  it("selecting a coalition sets the context to that coalition's id", async () => {
    render(<GroupSwitcher groups={GROUPS} activeId={null} />);
    screen.getByRole("button", { name: "אלפא" }).click();
    await waitFor(() => expect(setActiveCoalitionAction).toHaveBeenCalledWith({ groupId: "g1" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("selecting ארצי clears the context to national (null)", async () => {
    render(<GroupSwitcher groups={GROUPS} activeId="g1" />);
    screen.getByRole("button", { name: "ארצי" }).click();
    await waitFor(() => expect(setActiveCoalitionAction).toHaveBeenCalledWith({ groupId: null }));
  });

  it("re-selecting the already-active coalition does not re-fire the action", () => {
    render(<GroupSwitcher groups={GROUPS} activeId="g1" />);
    screen.getByRole("button", { name: "אלפא" }).click();
    expect(setActiveCoalitionAction).not.toHaveBeenCalled();
  });
});

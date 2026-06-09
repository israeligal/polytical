import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// Mock the server action — the component's job is the optimistic toggle + the
// call shape; the action/service are tested separately.
const { setPushCategoryAction } = vi.hoisted(() => ({ setPushCategoryAction: vi.fn() }));
vi.mock("@/app/actions/notification-prefs", () => ({ setPushCategoryAction }));

import { NotificationPrefs } from "@/components/pwa/notification-prefs";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NotificationPrefs", () => {
  it("renders all four categories ON when nothing is muted", () => {
    render(<NotificationPrefs mutedPushTypes={[]} />);
    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBe(4);
    expect(switches.every((s) => s.getAttribute("aria-checked") === "true")).toBe(true);
  });

  it("renders a category OFF when its type is muted", () => {
    render(<NotificationPrefs mutedPushTypes={["market_closing_soon"]} />);
    expect(
      screen.getByRole("switch", { name: "שווקים שנסגרים" }).getAttribute("aria-checked"),
    ).toBe("false");
    // independent: season stays on
    expect(
      screen.getByRole("switch", { name: "תגמולי עונה" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("toggling a category off calls the action with enabled:false and reflects the returned muted set", async () => {
    setPushCategoryAction.mockResolvedValue({ ok: true, mutedPushTypes: ["season_reward"] });
    render(<NotificationPrefs mutedPushTypes={[]} />);

    screen.getByRole("switch", { name: "תגמולי עונה" }).click();

    await waitFor(() =>
      expect(setPushCategoryAction).toHaveBeenCalledWith({ category: "season", enabled: false }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "תגמולי עונה" }).getAttribute("aria-checked"),
      ).toBe("false"),
    );
  });

  it("reverts the optimistic flip when the action fails", async () => {
    setPushCategoryAction.mockResolvedValue({ ok: false, message: "האטו לרגע" });
    render(<NotificationPrefs mutedPushTypes={[]} />);

    const sw = screen.getByRole("switch", { name: "תגמולי עונה" });
    sw.click();

    await waitFor(() => expect(setPushCategoryAction).toHaveBeenCalled());
    // failed → reverts back to ON
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "תגמולי עונה" }).getAttribute("aria-checked"),
      ).toBe("true"),
    );
  });
});

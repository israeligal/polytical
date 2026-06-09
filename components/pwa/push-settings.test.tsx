import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// Mock the push-client boundary (same pattern as use-push-subscription.test.tsx):
// the status spy drives the switch state; the subscribe/unsubscribe spies let us
// assert the toggle reached the SDK boundary.
const { getPushStatus, subscribeToPush, unsubscribeFromPush } = vi.hoisted(() => ({
  getPushStatus: vi.fn(),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}));

vi.mock("@/lib/pwa/push-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pwa/push-client")>();
  return { ...actual, getPushStatus, subscribeToPush, unsubscribeFromPush };
});

import type { PushStatus } from "@/lib/pwa/push-client";
import { PushSettings } from "@/components/pwa/push-settings";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderAtStatus(status: PushStatus) {
  getPushStatus.mockResolvedValue(status);
  render(<PushSettings />);
  await waitFor(() => expect(getPushStatus).toHaveBeenCalled());
}

describe("PushSettings switch state", () => {
  it("reads ON + enabled + active hint when subscribed", async () => {
    await renderAtStatus("subscribed");
    const sw = await screen.findByRole("switch", { name: "התראות דחיפה" });
    await waitFor(() => expect(sw.getAttribute("aria-checked")).toBe("true"));
    expect((sw as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/מקבלים התראה/)).toBeTruthy();
  });

  it("reads OFF + enabled when status is 'default'", async () => {
    await renderAtStatus("default");
    const sw = await screen.findByRole("switch", { name: "התראות דחיפה" });
    await waitFor(() => expect(sw.getAttribute("aria-checked")).toBe("false"));
    expect((sw as HTMLButtonElement).disabled).toBe(false);
  });

  it("is OFF + disabled with a 'blocked' hint when 'denied'", async () => {
    await renderAtStatus("denied");
    const sw = await screen.findByRole("switch", { name: "התראות דחיפה" });
    await waitFor(() => expect((sw as HTMLButtonElement).disabled).toBe(true));
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/חסומות/)).toBeTruthy();
  });

  it("is OFF + disabled with an 'unavailable' hint when 'unsupported'", async () => {
    await renderAtStatus("unsupported");
    const sw = await screen.findByRole("switch", { name: "התראות דחיפה" });
    await waitFor(() => expect((sw as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByText(/אינן זמינות/)).toBeTruthy();
  });
});

describe("PushSettings interaction", () => {
  it("toggling ON (from default) invokes subscribeToPush", async () => {
    subscribeToPush.mockResolvedValue(undefined);
    getPushStatus.mockResolvedValueOnce("default").mockResolvedValue("subscribed");
    render(<PushSettings />);
    const sw = await screen.findByRole("switch", { name: "התראות דחיפה" });
    sw.click();
    await waitFor(() => expect(subscribeToPush).toHaveBeenCalledTimes(1));
  });

  it("toggling OFF (from subscribed) invokes unsubscribeFromPush", async () => {
    unsubscribeFromPush.mockResolvedValue(undefined);
    getPushStatus.mockResolvedValueOnce("subscribed").mockResolvedValue("default");
    render(<PushSettings />);
    const sw = await screen.findByRole("switch", { name: "התראות דחיפה" });
    await waitFor(() => expect(sw.getAttribute("aria-checked")).toBe("true"));
    sw.click();
    await waitFor(() => expect(unsubscribeFromPush).toHaveBeenCalledTimes(1));
  });
});

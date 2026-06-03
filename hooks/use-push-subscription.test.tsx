import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// Mock the push-client boundary so the component/hook run without a real
// service worker. We import the actual `urlBase64ToUint8Array` (pure, no browser
// deps) via vi.importActual so its decode test exercises the real impl. The
// async surface (getPushStatus / subscribeToPush / unsubscribeFromPush) is
// replaced with controllable spies — the status spy drives render-gating and the
// subscribe spy lets us assert the click reached the SDK boundary.
const { getPushStatus, subscribeToPush, unsubscribeFromPush } = vi.hoisted(() => ({
  getPushStatus: vi.fn(),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}));

vi.mock("@/lib/pwa/push-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pwa/push-client")>();
  return {
    ...actual,
    getPushStatus,
    subscribeToPush,
    unsubscribeFromPush,
  };
});

import { urlBase64ToUint8Array, type PushStatus } from "@/lib/pwa/push-client";
import { EnablePush } from "@/components/pwa/enable-push";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("urlBase64ToUint8Array", () => {
  it("decodes a base64url VAPID key to the right byte length", () => {
    // A real-shape VAPID public key is 65 bytes (uncompressed P-256 point).
    // base64url of 65 bytes is 87 chars (no padding). Build one deterministically.
    const bytes = new Uint8Array(65);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 7 + 3) & 0xff;
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const base64url = btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    const decoded = urlBase64ToUint8Array(base64url);
    expect(decoded).toBeInstanceOf(Uint8Array);
    expect(decoded.length).toBe(65);
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });

  it("decodes a short known string correctly", () => {
    // "aGVsbG8" is base64url for "hello" (5 bytes), no padding.
    const decoded = urlBase64ToUint8Array("aGVsbG8");
    expect(decoded.length).toBe(5);
    expect(String.fromCharCode(...decoded)).toBe("hello");
  });
});

async function renderAtStatus(status: PushStatus) {
  getPushStatus.mockResolvedValue(status);
  render(<EnablePush />);
  // mount effect resolves the real status from the (mocked) getPushStatus.
  await waitFor(() => expect(getPushStatus).toHaveBeenCalled());
}

describe("EnablePush render gating", () => {
  it("shows the Hebrew CTA when status is 'default'", async () => {
    await renderAtStatus("default");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /קבלו התראות/ })).toBeTruthy(),
    );
  });

  it("renders nothing when status is 'denied'", async () => {
    const { container } = (() => {
      getPushStatus.mockResolvedValue("denied");
      return render(<EnablePush />);
    })();
    await waitFor(() => expect(getPushStatus).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /קבלו התראות/ })).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("renders nothing when status is 'unsupported'", async () => {
    const { container } = (() => {
      getPushStatus.mockResolvedValue("unsupported");
      return render(<EnablePush />);
    })();
    await waitFor(() => expect(getPushStatus).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /קבלו התראות/ })).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("shows the 'active' row with a disable action when 'subscribed'", async () => {
    await renderAtStatus("subscribed");
    await waitFor(() => expect(screen.getByText(/ההתראות פעילות/)).toBeTruthy());
    expect(screen.getByRole("button", { name: /כבו/ })).toBeTruthy();
  });
});

describe("EnablePush interaction", () => {
  it("invokes subscribeToPush when the CTA is clicked", async () => {
    subscribeToPush.mockResolvedValue(undefined);
    // First status read → "default" (show CTA); the re-read after enable → "subscribed".
    getPushStatus.mockResolvedValueOnce("default").mockResolvedValue("subscribed");
    render(<EnablePush />);

    const cta = await screen.findByRole("button", { name: /קבלו התראות/ });
    cta.click();

    await waitFor(() => expect(subscribeToPush).toHaveBeenCalledTimes(1));
  });

  it("invokes unsubscribeFromPush when the disable action is clicked", async () => {
    unsubscribeFromPush.mockResolvedValue(undefined);
    getPushStatus.mockResolvedValueOnce("subscribed").mockResolvedValue("default");
    render(<EnablePush />);

    const disableBtn = await screen.findByRole("button", { name: /כבו/ });
    disableBtn.click();

    await waitFor(() => expect(unsubscribeFromPush).toHaveBeenCalledTimes(1));
  });
});

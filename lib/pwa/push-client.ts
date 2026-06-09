// Web-push client surface — pure TS, browser APIs only, no React.
//
// Mirrors the platform-detection idiom in lib/pwa/install.ts: iOS Safari only
// supports the Push API once the PWA is installed (display-mode: standalone), so
// a non-standalone iOS browser is treated as unsupported. The subscribe /
// unsubscribe round-trips talk to /api/push/subscribe (POST to register the
// PushSubscription, DELETE to drop it by endpoint).

/**
 * Decode a base64url VAPID public key into the Uint8Array that
 * PushManager.subscribe expects for `applicationServerKey`.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  // Back the view with a concrete ArrayBuffer (not ArrayBufferLike) so callers
  // can hand `.buffer` to PushManager.subscribe as a BufferSource.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/** Standalone (installed-PWA) detection — matches lib/pwa/install.ts. */
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes navigator.standalone instead of display-mode.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * True iff the browser exposes the full web-push stack AND we are not in an
 * iOS Safari tab (iOS only delivers push once installed to the home screen).
 */
export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  const hasApis =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  if (!hasApis) return false;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS && !isStandalone()) return false;
  return true;
}

export type PushStatus = "unsupported" | "denied" | "default" | "subscribed";

/**
 * Resolve the current push status. Reads `Notification.permission` first (cheap,
 * synchronous) then inspects the live PushManager subscription. A service worker
 * that never reaches `ready` falls back to "default" rather than hanging.
 */
export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub !== null ? "subscribed" : "default";
  } catch {
    return "default";
  }
}

/**
 * Subscribe the active service worker to push and register the subscription with
 * the server. Must be called from a user gesture so the permission prompt fires.
 */
export async function subscribeToPush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    // `.buffer` is a concrete ArrayBuffer (see urlBase64ToUint8Array) — a valid
    // BufferSource for applicationServerKey across DOM lib type versions.
    applicationServerKey: urlBase64ToUint8Array(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    ).buffer,
  });
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
}

/**
 * Drop the server-side subscription (by endpoint) then unsubscribe the browser.
 * No-op if there is no live subscription.
 */
export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  }
}

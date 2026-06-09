// PWA install logic — pure, no React. Two mutually-exclusive paths:
//  - Chromium (Android/desktop) fires `beforeinstallprompt` → capture it at
//    module init (one-shot, may fire before any component mounts) and surface a
//    real "Install" button.
//  - iOS Safari fires NOTHING → detect iOS + non-standalone + not-dismissed and
//    show a manual "Share → Add to Home Screen" hint.

// ---------- Chromium: beforeinstallprompt ----------
export type BeforeInstallPromptEvent = Event & {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
};

let stashedEvent: BeforeInstallPromptEvent | null = null;
const bipListeners = new Set<() => void>();
const notifyBip = () => bipListeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // suppress Chrome's auto mini-banner
    stashedEvent = event as BeforeInstallPromptEvent;
    notifyBip();
  });
  window.addEventListener("appinstalled", () => {
    stashedEvent = null;
    notifyBip();
  });
}

export function subscribeBip(cb: () => void): () => void {
  bipListeners.add(cb);
  if (typeof window !== "undefined") {
    window.addEventListener(BIP_DISMISS_EVENT, cb);
  }
  return () => {
    bipListeners.delete(cb);
    if (typeof window !== "undefined") {
      window.removeEventListener(BIP_DISMISS_EVENT, cb);
    }
  };
}
export function getBipSnapshot(): boolean {
  if (typeof window !== "undefined" && window.localStorage.getItem(BIP_DISMISSED_KEY) === "1") {
    return false;
  }
  return stashedEvent !== null;
}
export function getServerSnapshot(): boolean {
  return false;
}
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!stashedEvent) return "unavailable";
  const event = stashedEvent;
  stashedEvent = null; // one-shot — consume before awaiting
  notifyBip();
  await event.prompt();
  return (await event.userChoice).outcome;
}

// ---------- Chromium: dismiss (persistent) ----------
export const BIP_DISMISSED_KEY = "polytical-install-dismissed";
export const BIP_DISMISS_EVENT = "polytical-install-dismiss";

export function dismissBipHint(): void {
  window.localStorage.setItem(BIP_DISMISSED_KEY, "1");
  window.dispatchEvent(new Event(BIP_DISMISS_EVENT));
}

// ---------- iOS: manual add-to-home-screen hint ----------
export const IOS_HINT_DISMISSED_KEY = "polytical-ios-install-dismissed";
export const IOS_HINT_DISMISS_EVENT = "polytical-ios-install-dismiss";

export function subscribeIos(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(IOS_HINT_DISMISS_EVENT, cb);
  return () => window.removeEventListener(IOS_HINT_DISMISS_EVENT, cb);
}
export function getIosSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes navigator.standalone instead of display-mode
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const dismissed = window.localStorage.getItem(IOS_HINT_DISMISSED_KEY) === "1";
  return isIOS && !isStandalone && !dismissed;
}
export function dismissIosHint(): void {
  window.localStorage.setItem(IOS_HINT_DISMISSED_KEY, "1");
  window.dispatchEvent(new Event(IOS_HINT_DISMISS_EVENT));
}

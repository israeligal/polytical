"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  dismissIosHint,
  getBipSnapshot,
  getIosSnapshot,
  getServerSnapshot,
  promptInstall,
  subscribeBip,
  subscribeIos,
} from "@/lib/pwa/install";

/**
 * Install affordance. Chromium fires `beforeinstallprompt` → a real install
 * button (bottom-center pill). iOS fires nothing → a manual "Share → Add to Home
 * Screen" hint. The two are mutually exclusive in practice, so one component
 * renders whichever the platform supports.
 */
export function PwaInstall() {
  const androidAvailable = useSyncExternalStore(subscribeBip, getBipSnapshot, getServerSnapshot);
  const iosHint = useSyncExternalStore(subscribeIos, getIosSnapshot, getServerSnapshot);
  const install = useCallback(() => {
    void promptInstall();
  }, []);

  if (androidAvailable) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        <button
          type="button"
          onClick={install}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground shadow-glow-mint transition-colors hover:bg-primary-hover"
        >
          התקינו את פוליטיקל
        </button>
      </div>
    );
  }

  if (iosHint) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <aside className="mx-auto flex max-w-md items-center gap-3 rounded-card border border-border bg-card/95 px-4 py-3 shadow-3 backdrop-blur-xl">
          <span className="text-sm text-foreground">
            התקינו את האפליקציה: הקישו על{" "}
            <span className="font-bold text-primary">שיתוף</span> ואז{" "}
            <span className="font-bold text-primary">״הוסף למסך הבית״</span>.
          </span>
          <button
            type="button"
            onClick={dismissIosHint}
            className="ms-auto shrink-0 rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            לא עכשיו
          </button>
        </aside>
      </div>
    );
  }

  return null;
}

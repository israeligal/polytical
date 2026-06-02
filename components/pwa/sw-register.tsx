"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js in production only (registering in dev breaks HMR with
 * stale-cache weirdness). Test PWA features with `pnpm build && pnpm start`.
 * Mounted once in the root layout.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  }, []);
  return null;
}

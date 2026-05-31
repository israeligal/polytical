---
name: nextjs-pwa
description: Build Progressive Web Apps in Next.js 16 (App Router) with Turbopack. Covers installable PWA setup (web manifest, icons, theme color, viewport), service workers (hand-rolled per Next.js official guide vs @serwist/turbopack), iOS Safari install prompt handling, web push notifications via VAPID + web-push, headers/CSP configuration for /sw.js, and trade-offs between approaches. Use this skill whenever the user mentions PWA, Progressive Web App, "make this installable", "add to home screen", web app manifest, service worker, sw.js, push notifications in a Next.js context, web push, VAPID keys, beforeinstallprompt, app/manifest.ts, /offline page, Workbox, Serwist, @serwist/next, @serwist/turbopack, or next-pwa — even if they don't say "PWA" explicitly. Also trigger when the user wants their Next.js app to feel native on mobile, install on iOS/Android, or work offline.
---

# Building PWAs in Next.js 16 + Turbopack

A PWA in Next.js 16 has three orthogonal concerns. Treat them separately:

1. **Manifest + icons + viewport metadata** → Next.js native primitives. No library needed.
2. **Service worker** → hand-rolled `public/sw.js` (Next.js' own documented path) OR `@serwist/turbopack` if you genuinely need Workbox-style precaching.
3. **Push notifications** → `web-push` + VAPID + your existing API route or Server Action pattern.

The Next.js 16 official guide (`/docs/app/guides/progressive-web-apps`, last updated 2026-04-10) walks through the hand-rolled path end-to-end. **Default to it.** Reach for Serwist only when you need Workbox helpers (precache manifest injection, runtime caching strategies, expiration plugins) — i.e., when you're building offline-first, not just installable.

## Decision matrix — pick the right tool

| Approach | Bundler support | Maintenance | Use when |
|---|---|---|---|
| **Hand-rolled `public/sw.js` + native `app/manifest.ts`** | Bundler-agnostic (works with Turbopack and webpack) | Officially documented in Next.js docs | Installable shell, simple offline fallback, push notifications. **Default choice.** |
| **`@serwist/turbopack`** | Turbopack only (Next.js 15+ default) | Active, ~130k weekly downloads | You need Workbox helpers: precache manifest injection, runtime caching strategies, asset expiration. |
| **`@serwist/next`** | webpack only — Serwist's own example pins `next dev --webpack` | Active, ~1M weekly downloads | Existing webpack project, or you opt out of Turbopack. Don't pick this for a new Next.js 16 project. |
| **`next-pwa` / `@ducanh2912/next-pwa`** | webpack only, deprecated | Both authors moved to Serwist | Never for new code. Migrate. |

**Rule of thumb:** if `pnpm build` produces only static assets and a few precached files, you don't need a library — you need ~25 lines of `sw.js`. The library is for the precache-manifest-injection problem, which only matters once you have Workbox-shaped requirements.

## Path A: Hand-rolled (recommended default)

This is the Next.js 16 official path. Six files; no runtime dependencies; native Turbopack support.

### 1. Manifest — `app/manifest.ts`

Use Next.js' typed metadata route. Auto-served at `/manifest.webmanifest`.

```ts
// app/manifest.ts
import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Your App Name",
    short_name: "App",
    description: "Short tagline",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#608939", // sRGB hex; manifest spec doesn't accept OKLCH
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
```

**Why hex, not OKLCH:** the W3C web app manifest spec accepts CSS color strings but browsers' install UIs render `theme_color` from sRGB. OKLCH has uneven support in installer chrome — convert your design-token primary to sRGB hex once and put it here. Everywhere else in the app stays OKLCH.

### 2. Viewport + Apple meta — `app/layout.tsx`

Use the typed `viewport` export (Next.js 14+) instead of raw `<meta>` tags.

```ts
// app/layout.tsx
import type { Metadata, Viewport } from "next"

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#608939" },
    { media: "(prefers-color-scheme: dark)", color: "#3a5524" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // for iOS notch handling
}

export const metadata: Metadata = {
  title: "Your App",
  description: "...",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "App",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32" },
      { url: "/icons/favicon-16.png", sizes: "16x16" },
    ],
    apple: "/icons/apple-touch-icon.png",
    shortcut: "/icons/favicon-32.png",
  },
}
```

The `appleWebApp` block is what gives iOS a proper installed look. Without it, Add to Home Screen produces a Safari-chrome browser with the page inside.

### 3. Service worker — `public/sw.js`

Static file, served as-is. The minimal version is just install + activate handlers; push and notificationclick handlers land alongside as you wire web-push.

**This project's `public/sw.js` is at v4 — push notifications only.** The app is online-only by design (Postgres is the sole authoritative store), so the SW does NOT cache pages, intercept fetches, or provide an offline experience. Its sole job is to receive web-push notifications and route notification clicks. Removing the fetch listener also sidesteps WebKit cookie bug #219650 — without `respondWith` ever being called, Better Auth OAuth on iOS Safari can't trip the SameSite=Lax-during-redirect drop. **For our actual implementation including the inline push + notificationclick handler bodies, read `public/sw.js` directly.** The snippet below is the minimal scaffold for a new project starting from scratch.

```js
// Minimal scaffold for a NEW project — push handlers shown as TODOs.
// Our project's real public/sw.js has the bodies inline; see that file.
const CACHE_NAME = "app-shell-v1"

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  // Drop any caches owned by older SW versions on upgrade.
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      ),
    ]),
  )
})

// PUSH + notificationclick handlers — see references/push-notifications.md
// self.addEventListener("push", (event) => { ... })
// self.addEventListener("notificationclick", (event) => { ... })
```

**Bump `CACHE_NAME` (`v1` → `v2`) any time you ship SW changes.** The activate handler then deletes any cache key that doesn't match — ensures users on the old SW transition cleanly.

**If you ever do add a fetch listener:** scope it tightly. Never intercept `/api/auth/*` or any non-cached path; WebKit bug #219650 silently breaks SameSite=Lax cookies during redirects under an active SW that calls `respondWith`. Default to no fetch listener at all unless you have a specific reason.

### 4. SW registration — client component

```tsx
// components/pwa/ServiceWorkerRegistration.tsx
"use client"

import { useEffect } from "react"

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return
    navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    })
  }, [])
  return null
}
```

Mount once inside `<body>` in `app/layout.tsx`. **Gate on `NODE_ENV === "production"`** — registering the SW in dev causes stale-cache HMR breakage. Use `pnpm build && pnpm start` to test PWA features locally.

### 5. Headers — `next.config.js`

Per the Next.js 16 docs, the SW file needs specific headers. Also extend the global CSP for `worker-src` and `manifest-src`.

```js
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        // No scoped CSP — Next.js merges with the global /:path* CSP below
        // and the global one wins. Set a narrower CSP only via a different
        // mechanism (e.g. a custom route handler returning the SW).
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "connect-src 'self'",
              "worker-src 'self'",
              "manifest-src 'self'",
              "font-src 'self'",
            ].join("; "),
          },
        ],
      },
    ]
  },
}
```

`Cache-Control: no-cache` on `/sw.js` is critical — without it, browsers cache the worker file itself, so users never see your updated SW. The browser-managed Cache Storage (where the SW puts your precached pages) is separate from this HTTP cache.

### 6. Offline fallback page — `app/offline/page.tsx`

A server component that the SW serves when navigation fails.

```tsx
// app/offline/page.tsx
export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-2xl font-semibold">You're offline</h1>
        <p className="text-muted-foreground">
          Your saved progress is safe. Reconnect to continue.
        </p>
      </div>
    </main>
  )
}
```

Keep it static — no data fetching, no client state. The whole point is that this page works without the network.

## Path B: `@serwist/turbopack` (when Workbox features matter)

Pick this if you're building offline-first with significant precaching, runtime caching strategies (StaleWhileRevalidate, NetworkFirst, etc.), or asset expiration. For installable shells, hand-rolled is simpler and ships less code.

See `references/serwist.md` for the install steps, `sw.ts` template, and `package.json` script changes.

## Manifest — advanced fields (live in this project)

Beyond name/icons/display, `app/manifest.ts` declares:
- **`shortcuts`** — long-press home-screen jump-to actions. Max 4 entries before phones truncate. Each needs a 96×96 icon under `public/icons/shortcuts/`
- **`screenshots`** — required for richer install dialogs and store-listing submissions (PWABuilder MSIX, Bubblewrap TWA). At least one `form_factor: "narrow"` and one `"wide"`
- **`categories`** — store discoverability (`["productivity", "business"]`)
- **`id`** — pin a unique identifier (e.g., `"/?source=pwa"`) so future `start_url` tweaks don't re-key existing installs
- **`launch_handler.client_mode: "navigate-existing"`** — clicking a shortcut OR a push notification focuses an existing window instead of spawning a new tab. Pairs with the SW's `notificationclick` `matchAll` + `focus` pattern

## Push notifications

Add later to the same `public/sw.js`. The Next.js 16 docs walk through:
1. `web-push generate-vapid-keys` → put in `.env`
2. `push` and `notificationclick` handlers in `sw.js`
3. Subscribe endpoint (route handler or Server Action) using existing auth wrappers
4. Server-side dispatch via `web-push` library

Full code patterns and the route-handler-vs-Server-Action choice in `references/push-notifications.md`.

**This project: push backend is live, prompt is unmounted.** Backend pipeline still wired end-to-end: `src/services/push.service.ts` → `src/repositories/push-subscriptions.repository.ts` (user-scoped, `endpoint UNIQUE`); routes at `/api/push/{subscribe,unsubscribe}`; client subscribe surface at `src/lib/pwa/push-permission.ts` + `src/hooks/usePushSubscription.ts` + `src/components/pwa/EnableNotificationsCard.tsx`. PDF-ready trigger in `pdf-package-job.service.ts` still calls `sendNotificationToUser({ topic: PDF_READY })` alongside `sendPackageReadyEmail` (no-op when subs list is empty). VAPID env vars (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) gated in `src/lib/env.ts`. Lazy `webpush.setVapidDetails()` (in `ensureVapidConfigured()`) so module load doesn't read env during `next build` page-data collection. 410/404 dispatch errors automatically prune dead subscriptions; transient 5xx keeps the row. **`EnableNotificationsCard` is currently not mounted anywhere** (PR #270, 2026-05-19) — the previous mount on the download page was removed because Brave's default privacy settings block FCM delivery, iOS gates Push API on PWA install, and the package-ready email already covers the only wired trigger. Re-mount the card (or build a settings-page toggle) when a real use case ships (likely reminders).

## iOS Safari particulars

iOS doesn't fire `beforeinstallprompt` — users must tap Share → Add to Home Screen manually. You're responsible for showing the hint. iOS 16.4+ supports web push *only after* the user has installed the PWA to their home screen. iOS quirks live in `references/ios-quirks.md`.

Split into Logic → Hook → Component (so the hook is reusable, the story can import the same constants the component uses, and the dismiss-event-and-localStorage pattern doesn't get reinvented for push):

```ts
// lib/pwa/install-prompt.ts — pure functions, no React
export const INSTALL_PROMPT_STORAGE_KEY = "your-app-install-prompt-dismissed"
export const INSTALL_PROMPT_DISMISS_EVENT = "your-app-install-prompt-dismiss"

export function subscribe(callback: () => void): () => void {
  window.addEventListener(INSTALL_PROMPT_DISMISS_EVENT, callback)
  return () => window.removeEventListener(INSTALL_PROMPT_DISMISS_EVENT, callback)
}

export function getSnapshot(): boolean {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
  const dismissed = window.localStorage.getItem(INSTALL_PROMPT_STORAGE_KEY) === "1"
  return isIOS && !isStandalone && !dismissed
}

export function getServerSnapshot(): boolean { return false }

export function dismissInstallPrompt(): void {
  window.localStorage.setItem(INSTALL_PROMPT_STORAGE_KEY, "1")
  window.dispatchEvent(new Event(INSTALL_PROMPT_DISMISS_EVENT))
}
```

```tsx
// hooks/usePwaInstallPrompt.ts
"use client"
import { useCallback, useSyncExternalStore } from "react"
import { dismissInstallPrompt, getServerSnapshot, getSnapshot, subscribe } from "@/lib/pwa/install-prompt"

export function usePwaInstallPrompt() {
  const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const dismiss = useCallback(() => dismissInstallPrompt(), [])
  return { visible, dismiss }
}
```

```tsx
// components/pwa/InstallPrompt.tsx — UI only
"use client"
import { usePwaInstallPrompt } from "@/hooks/usePwaInstallPrompt"

export function InstallPrompt() {
  const { visible, dismiss } = usePwaInstallPrompt()
  if (!visible) return null
  return (
    <aside className="...">
      Tap the Share button, then "Add to Home Screen" to install.
      <button onClick={dismiss}>Not now</button>
    </aside>
  )
}
```

## Android / Desktop Chrome install button

iOS gets the share-icon hint above. Chromium-based browsers (Android Chrome, desktop Chrome/Edge) fire `beforeinstallprompt` instead — capture it and surface a native "Install" button, otherwise users only find the install option buried in the browser's three-dot menu.

Same Logic → Hook → Component split:

```ts
// lib/pwa/before-install-prompt.ts — captures the one-shot event at module init
export type BeforeInstallPromptEvent = Event & {
  readonly platforms: readonly string[]
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
  prompt(): Promise<void>
}

let stashedEvent: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault() // suppress Chrome's auto mini-banner
    stashedEvent = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener("appinstalled", () => {
    stashedEvent = null
    notify()
  })
}

export function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
export function getSnapshot(): boolean { return stashedEvent !== null }
export function getServerSnapshot(): boolean { return false }

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!stashedEvent) return "unavailable"
  const event = stashedEvent
  stashedEvent = null  // one-shot — consume before awaiting
  notify()
  await event.prompt()
  return (await event.userChoice).outcome
}
```

```tsx
// hooks/useBeforeInstallPrompt.ts
"use client"
import { useCallback, useSyncExternalStore } from "react"
import { getServerSnapshot, getSnapshot, promptInstall, subscribe } from "@/lib/pwa/before-install-prompt"

export function useBeforeInstallPrompt() {
  const available = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const prompt = useCallback(() => promptInstall(), [])
  return { available, prompt }
}
```

```tsx
// components/pwa/AndroidInstallButton.tsx
"use client"
import { useBeforeInstallPrompt } from "@/hooks/useBeforeInstallPrompt"

export function AndroidInstallButton() {
  const { available, prompt } = useBeforeInstallPrompt()
  if (!available) return null
  return <button onClick={prompt}>Install app</button>
}
```

**Why module-level capture:** the event is one-shot and may fire before any component mounts. A module-level listener stashes it; the hook reads via `useSyncExternalStore`. The `typeof window` guard keeps SSR safe.

**Mounting:** put `<AndroidInstallButton />` next to `<InstallPrompt />` in root layout. They never render simultaneously — Android fires `beforeinstallprompt`, iOS doesn't, so the iOS hint and Chromium button are mutually exclusive in practice.

## Generating icons

You need: `192x192`, `512x512`, `512x512 maskable` (with 40% safe-zone padding for the mask), `180x180 apple-touch-icon`, `32x32 + 16x16 favicons`. Use the bundled `scripts/generate-pwa-icons.ts` (sharp-based) to produce them all from a single source logo. Commit the output to `public/icons/` so production doesn't regenerate.

**JSX-only logo (no PNG source)?** Add a project-specific adapter step that rasterizes your SVG mirror onto a square brand-colored canvas first, then feed *that* PNG into the canonical generator. Keep the SVG (hex fills, manual mirror of your `BrandLogo` JSX) and the adapter in `scripts/`; wire both into `pnpm pwa:icons` via a chained command in `package.json`. Sharp needs `density: ≥ targetWidth × 72 / viewBoxWidth` on the input options or the rasterization is mud. This keeps the canonical script in lockstep with the skill.

## Testing & verification

- `pnpm build && pnpm start` (PWA features only register in production).
- Chrome DevTools → Application → Manifest: name, icons, theme color present, no warnings, "Installable" indicator green.
- Application → Service Workers: `/sw.js` activated, no console errors.
- Lighthouse → PWA category: installable, score ≥90.
- Network → Offline → reload an in-app route: `/offline` renders.
- Install on Chrome Android: install prompt appears, opens in standalone window.
- iOS Safari: tap Share → Add to Home Screen, verify standalone window with branded icon.
- HTTPS in dev (needed for SW registration on real devices): `next dev --experimental-https`.

## Common pitfalls

- **Registering the SW in dev** breaks HMR with stale-cache weirdness. Gate on `NODE_ENV === "production"` and use `pnpm build && pnpm start` to test locally.
- **Auth middleware/proxy redirecting `/sw.js`** breaks installation silently. Exclude `sw.js`, `manifest.webmanifest`, and `icons/*` from the matcher.
- **`theme_color` in OKLCH** is invalid in the manifest. Convert to sRGB hex once.
- **Caching API responses inadvertently** lets logged-in pages leak to logged-out users. The minimal SW above only intercepts `request.mode === "navigate"` — keep it that way unless you have a reason.
- **Forgetting `Cache-Control: no-cache` on `/sw.js`** means browsers serve your old SW forever. The Next.js docs spell this out — follow it.
- **Picking `@serwist/next` for a Next.js 16 project** wastes time. Their own example pins `next dev --webpack`. Use `@serwist/turbopack` or hand-rolled.
- **Skipping `appleWebApp` metadata** makes iOS installs render in Safari chrome. Add it.
- **iOS `beforeinstallprompt` doesn't exist.** Detect iOS + non-standalone and show your own hint. Don't rely on the event.
- **iOS push requires the PWA be installed first.** Don't ask for notification permission before the user adds to home screen — it'll silently fail.

## Where to extend

- **Workbox-style precaching** → `references/serwist.md`
- **Push notifications full wiring** → `references/push-notifications.md`
- **iOS-specific UX and gotchas** → `references/ios-quirks.md`
- **Wrap as Google Play app (TWA via Bubblewrap)** → `references/google-play-twa.md`
- **All user flows + update mechanism** → `references/user-flows.md`
- **Icon generation script** → `scripts/generate-pwa-icons.ts`

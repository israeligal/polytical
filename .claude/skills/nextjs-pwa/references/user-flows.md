# PWA Update Mechanism + User Flows

Behavior reference for the green-card-genius PWA. Reflects the code at `public/sw.js`, `src/app/manifest.ts`, `src/app/layout.tsx`, `src/components/pwa/*`, `src/lib/pwa/*`, `src/hooks/*PwaInstall*`. When the code changes, update this doc.

Actors used throughout:
- **User** — the human in front of the device.
- **Browser** — Chrome / Safari / Edge / etc. Includes the Chrome address bar, three-dot menu, and Add to Home Screen UI.
- **App** — our React + Next.js code (server components, client components, hooks).
- **SW** — the service worker (`/sw.js`).
- **Server** — Vercel-hosted Next.js handlers (manifest, pages, API routes).

---

## 1. Service worker lifecycle

```
                ┌─────────────────────────────────────────┐
                │  Browser fetches /sw.js (registration)  │
                └────────────────┬────────────────────────┘
                                 │
                                 ▼
                       ┌──────────────────┐
                       │   parsing        │ ← byte-compare with currently
                       └────────┬─────────┘   installed SW; identical byte-
                                │              for-byte = no install fires
                                ▼
                       ┌──────────────────┐
                       │   installing     │ ← `install` event fires once
                       │  (waitUntil)     │   precaches `/offline` into
                       └────────┬─────────┘   `gcg-shell-v1`
                                │
                                ▼
                       ┌──────────────────┐
                       │    installed     │ ← waiting until the old SW has
                       │   (waiting)      │   no controlled clients, OR we
                       └────────┬─────────┘   call `skipWaiting()` — we do
                                │
                                ▼
                       ┌──────────────────┐
                       │    activating    │ ← `activate` event; we call
                       │  (waitUntil)     │   `clients.claim()` so the new
                       └────────┬─────────┘   SW immediately controls open tabs
                                │
                                ▼
                       ┌──────────────────┐
                       │     activated    │ ← intercepts navigation requests
                       └────────┬─────────┘   per the `fetch` handler
                                │ (some time passes — new deploy, etc.)
                                ▼
                       ┌──────────────────┐
                       │    redundant     │ ← only after a successor SW
                       └──────────────────┘   activates
```

**What triggers a new SW install:** any byte change in `/sw.js`. The browser re-fetches `/sw.js` opportunistically on page navigation (because we set `Cache-Control: no-cache, no-store, must-revalidate` for that URL in `next.config.js`). If the bytes differ, install begins.

**What does NOT trigger a new SW install:** changes to manifest, icons, layout, page code, or anything else. Those propagate through normal HTML/asset reloads, independent of the SW.

**Cache invalidation:** the SW manages a single named cache, `gcg-shell-v1`. To force fresh content for the offline page or other precached assets, bump the suffix (`v1` → `v2`) when committing the SW change. The new SW's `install` event opens `v2`, the old `v1` cache is left orphaned and eventually evicted by the browser's storage manager. We don't currently delete old caches in `activate` — fine while we cache only `/offline`; revisit when we precache more.

---

## 2. Update propagation

### What "deploy" means here

A Vercel deploy of `main` produces a new immutable bundle at `https://green-card-genius.vercel.app`. Static assets get content-hashed URLs and are aggressively cacheable. HTML, manifest, and `/sw.js` use `Cache-Control: no-cache, no-store, must-revalidate` (set in `next.config.js`) so browsers always re-fetch them.

### Flow A — User opens the site after a deploy (cold load)

| # | Actor | Step |
|---|---|---|
| 1 | User | Opens the installed PWA or visits the URL in a browser tab |
| 2 | Browser | Fetches the HTML — fresh from the server (no-cache) |
| 3 | Browser | Fetches `/sw.js` — fresh, byte-compared with the installed SW |
| 4 | Browser | If bytes differ, kicks off the install lifecycle (Section 1) |
| 5 | Browser | New SW reaches `installed (waiting)` state |
| 6 | App | `skipWaiting()` in the SW's install handler skips the wait |
| 7 | Browser | New SW activates, calls `clients.claim()` and now controls all open tabs of this origin |
| 8 | User | Sees fresh HTML and assets immediately. Subsequent navigations hit the new SW |

### Flow B — User has the site open during a deploy

The deploy doesn't push to the user. They keep running the old code until they navigate or refresh.

| # | Actor | Step |
|---|---|---|
| 1 | App | User keeps interacting with currently-loaded page (old version) |
| 2 | User | Navigates within the app (link click) or refreshes |
| 3 | Browser | Re-fetches HTML for the destination — gets new version |
| 4 | Browser | Fetches `/sw.js` opportunistically on this navigation |
| 5 | (Same as Flow A from step 5) | New SW installs, skips wait, claims clients, becomes the active SW |

**Practical consequence:** open tabs see the new code on next navigation, not instantly. We don't push update notifications or force-reloads. If we ever need that, see "Edge cases — Forcing a refresh" below.

### Flow C — `CACHE_NAME` was bumped in this deploy

The `/offline` precache content might have changed (e.g., we updated the offline page).

| # | Actor | Step |
|---|---|---|
| 1 | (Same as Flow A or B until step 6) | New SW installs and `install` handler runs |
| 2 | SW | Opens `gcg-shell-v2` (new name), calls `cache.add("/offline")` against the *new* deploy's `/offline` |
| 3 | Browser | Old `gcg-shell-v1` cache still exists but is no longer referenced |
| 4 | Browser | Eventually evicts `gcg-shell-v1` under storage pressure (no manual cleanup in our SW today) |

---

## 3. Install flows

We never trigger Chrome's install programmatically without a user gesture. The browser's installability heuristics decide when the affordances become available.

### Flow D — Chromium auto-prompt (we suppress it)

Chrome on desktop / Android may decide to fire `beforeinstallprompt` at any moment after the user has engaged with the site (heuristics include time-on-page, repeat visits, etc.).

| # | Actor | Step |
|---|---|---|
| 1 | Browser | Determines installability criteria are met (HTTPS + manifest + SW + engagement) |
| 2 | Browser | Dispatches `beforeinstallprompt` event on `window` |
| 3 | App | Our module-level listener in `src/lib/pwa/before-install-prompt.ts` calls `event.preventDefault()` (suppresses Chrome's mini-banner) and stashes the event |
| 4 | App | Listeners notify `useSyncExternalStore`, `AndroidInstallButton` re-renders with `available: true` |
| 5 | User | Sees our "Install app" button |

### Flow E — User taps "Install app" (our button)

| # | Actor | Step |
|---|---|---|
| 1 | User | Taps the "Install app" button rendered by `AndroidInstallButton` |
| 2 | App | `useBeforeInstallPrompt().prompt()` calls `promptInstall()` from the logic module |
| 3 | App | Logic module consumes the stashed event (sets `stashedEvent = null` first, so re-clicks no-op) and calls `event.prompt()` |
| 4 | Browser | Shows the native install dialog ("Install this app?") |
| 5 | User | Confirms or dismisses |
| 6 | Browser | Resolves `event.userChoice` with `{ outcome: "accepted" \| "dismissed", platform }` |
| 7 | App | `promptInstall()` returns the outcome string. Our button doesn't react to the outcome today — the button has already hidden itself (event consumed in step 3) |
| 8 | Browser | If accepted: installs the app, fires `appinstalled` on `window` |
| 9 | App | `appinstalled` handler clears `stashedEvent` (already null) and notifies — confirms the button stays hidden |

### Flow F — User installs from Chrome's three-dot menu

| # | Actor | Step |
|---|---|---|
| 1 | User | Taps ⋮ → "Install app" or "Add to Home Screen" |
| 2 | Browser | Shows native install dialog directly (does not fire `beforeinstallprompt` first) |
| 3 | User | Confirms |
| 4 | Browser | Installs, fires `appinstalled` |
| 5 | App | `appinstalled` handler clears `stashedEvent` and notifies. If our button was visible, it hides |

The menu option is always present once the install criteria are met, regardless of whether `beforeinstallprompt` has fired.

### Flow G — iOS Safari install (manual, no event)

iOS Safari does **not** fire `beforeinstallprompt`. There is no programmatic install trigger.

| # | Actor | Step |
|---|---|---|
| 1 | User | Visits the site in iOS Safari |
| 2 | App | `usePwaInstallPrompt` reads `getSnapshot()` — checks UA matches `/iPad\|iPhone\|iPod/`, `display-mode: standalone` is false, `localStorage[gcg-install-prompt-dismissed]` !== "1" |
| 3 | App | If all three conditions hold, `InstallPrompt` renders a fixed bottom-aside with the share-icon hint |
| 4 | User | Either taps Share → "Add to Home Screen" (continues to step 5), OR taps "Not now" (jumps to Flow J) |
| 5 | User | Confirms install in iOS share sheet |
| 6 | Browser (iOS) | Adds the icon to the home screen using `apple-touch-icon` and `appleWebApp` metadata |
| 7 | User | Taps the home-screen icon — opens in standalone mode |
| 8 | Browser (iOS) | Subsequent visits to our origin satisfy `display-mode: standalone`; `getSnapshot()` returns `false`; `InstallPrompt` no longer renders |

### Flow H — Desktop Chrome / Edge install

Same as Flow D + E, but the affordance is also visible as an icon in the address bar (small "+ install" icon). User can use any of three paths: address bar icon, our button, or three-dot menu. All three converge on Chrome's native install dialog and `appinstalled`.

---

## 4. Already-installed reentry

### Flow I — User opens the installed PWA

| # | Actor | Step |
|---|---|---|
| 1 | User | Taps the home-screen icon (or Start Menu app) |
| 2 | OS | Launches the browser in standalone mode against `start_url: "/"` |
| 3 | Browser | Fetches `/` — checks SW cache and network as usual |
| 4 | App | Layout mounts; `ServiceWorkerRegistration` re-registers `/sw.js` (idempotent); `getSnapshot()` returns `false` for `usePwaInstallPrompt` because `display-mode: standalone` is true; install affordances all stay hidden |
| 5 | User | Sees the app, no install prompts anywhere |

---

## 5. Uninstall / reset

### Flow J — User dismisses the iOS hint

| # | Actor | Step |
|---|---|---|
| 1 | User | Taps "Not now" on the iOS `InstallPrompt` aside |
| 2 | App | `dismissInstallPrompt()` writes `localStorage[gcg-install-prompt-dismissed] = "1"` and dispatches `gcg-install-prompt-dismiss` |
| 3 | App | `useSyncExternalStore` in the hook re-reads, `getSnapshot()` returns `false`, the aside unmounts |
| 4 | User | Doesn't see the aside again on this device + this browser unless they manually clear localStorage |

### Flow K — User uninstalls the PWA from their device

| # | Actor | Step |
|---|---|---|
| 1 | User | Long-presses the home-screen icon → Uninstall (Android), or removes from home screen / Settings (iOS), or right-click "Uninstall" (desktop) |
| 2 | OS | Removes the icon |
| 3 | Browser | On most platforms the SW + Cache Storage + localStorage persist (the website is still installable) |
| 4 | User | Visiting in a regular browser tab again hits the still-registered SW, sees the install affordances re-appear (because `display-mode: standalone` is now false) |

**iOS specific:** iOS aggressively clears storage when you remove a PWA; the user is functionally a "first-time visitor" in Safari afterwards. The dismiss flag is gone — they'll see the share-icon hint again.

### Flow L — Manual reset (force re-prompt)

For development or QA — there is no in-app "reset install state" button.

| # | Actor | Step |
|---|---|---|
| 1 | User | DevTools → Application → Storage → Clear site data |
| 2 | Browser | Drops localStorage, IndexedDB, Cache Storage, and unregisters the SW |
| 3 | User | Refreshes the page |
| 4 | Browser | Re-fetches `/sw.js`, registers fresh; manifest metas re-render |
| 5 | App | All install affordances behave as for a first-time visitor |

---

## 6. Offline behavior

**The app is online-only by design.** The service worker has no `fetch` listener and no caching — every request goes through the platform default. When the network is unreachable, the browser shows its native "no internet" UI; there is no in-app offline shell. Form data is server-authoritative (Postgres) and round-trips on every save, so the only "offline state" is "you can't save right now."

This is a deliberate choice, not a missing feature — see `docs/decisions/pwa.md` for the rationale (persistent-storage UI was confusing users about a non-problem; full offline-first was over-build for a server-authoritative form).

If a future task ever wires offline writes, it would need: (1) a `fetch` listener tightly scoped to non-auth paths, (2) an IndexedDB-backed mutation queue (Dexie), (3) a foreground drainer on `online` + `visibilitychange` since WebKit has no Background Sync API, and (4) a `clientUpdatedAt` 409 protocol for "server wins" conflict resolution.

---

## 7. Edge cases

### Stale SW

**Symptom:** user sees old behavior even after a deploy.

**Cause hierarchy:**
1. The browser hasn't re-checked `/sw.js` since the deploy. Mitigated by `Cache-Control: no-cache, no-store, must-revalidate` on `/sw.js`. But the browser only re-checks on navigation; if the tab has been idle, the user keeps the old SW until they navigate or refresh.
2. `skipWaiting()` failed (e.g., the new SW's `install` event threw). The new SW is stuck `installed (waiting)`. Open DevTools → Application → Service Workers and verify the active SW's script URL.
3. Old `gcg-shell-v1` cache still serves `/offline`. If we updated the offline page without bumping `CACHE_NAME`, users see the old offline page. This is a real bug — always bump the cache name suffix when changing precached content.

**Fix path:** chrome://serviceworker-internals → unregister, OR DevTools Application → Service Workers → Unregister + reload.

### Forcing a refresh (we don't do this today)

If we ever ship a critical fix that needs to land on already-open tabs immediately:
1. SW's `activate` handler can call `self.clients.matchAll()` and post a message telling each client to reload.
2. Client-side listener on `navigator.serviceWorker.controller` change can call `window.location.reload()`.
3. Or use the `Clear-Site-Data: "cache"` HTTP header on a one-off deploy.

None of this is wired up. When the time comes, this is the documented path.

### Dismissed install prompt re-eligibility (iOS)

Once the user taps "Not now", `localStorage[gcg-install-prompt-dismissed] = "1"`. The aside never re-appears on that device + that browser profile. Re-eligibility paths:
- User clears Safari website data for our origin.
- User uninstalls iOS PWA (iOS often clears origin storage in this case).
- We bump the storage key (e.g., `gcg-install-prompt-dismissed-v2`) — every existing dismissal becomes ineligible. Use sparingly; don't nag.

### Manifest changes after install (Android / desktop Chrome)

Once a PWA is installed, the browser caches the manifest values it used at install time (name, icon, theme color). Changing `manifest.ts` only affects new installs by default.

- **Icon updates** propagate when the browser re-validates the manifest (typically within ~24h, may require an app restart).
- **Name / short_name changes** generally do NOT propagate to existing installs — Android keeps the old name on the home-screen tile. Users who care must reinstall.
- **`theme_color` / `background_color` changes** propagate within a day or two of restart.
- **`start_url` changes** propagate but may invalidate Chrome's identity check; if `id` is set (we set `id: "/"`), Chrome treats this as the same app and updates the start URL.

If we ever rename the app, document that existing users will see the old tile until they reinstall.

### Vercel preview deploys

Each preview URL is a different origin. Browsers treat each preview as a separate installable app. Setting `id` doesn't bridge origins. **QA install testing must happen on the production URL, not preview URLs**, otherwise the user accumulates orphan PWAs in their Apps list.

### Stripe Checkout iframe and the SW

Stripe Checkout opens at `checkout.stripe.com` — a different origin, not under our SW's scope. The SW never sees these requests; behavior is identical to no-SW. Webhook completion is unaffected.

The only Stripe interaction within our origin is loading `https://js.stripe.com/v3` (cross-origin script tag, not under our SW) and any Stripe iframe `src` (cross-origin, not intercepted). Both work in installed PWAs the same as in normal browser tabs.

### iOS storage isolation

iOS PWAs use storage isolated from Safari. If the user authenticates in Safari and then opens the installed PWA (or vice versa), they see two separate session states. Magic links / email-verification links opened from email apps land in Safari, not the PWA — the user authenticates there and must repeat login from inside the PWA on iOS. See `references/ios-quirks.md` for the full constraint list.

### Multiple tabs of the same PWA

Browsers allow multiple tabs of the same origin. The SW is a singleton across tabs. State changes in one tab (e.g., dismissing the iOS install prompt) propagate to other tabs via the `gcg-install-prompt-dismiss` window event in the *same tab only*; cross-tab requires either `BroadcastChannel` (not implemented) or a `storage` event listener (also not implemented). In practice each tab reads localStorage on next snapshot read, so a navigation or re-mount picks up the change.

---

## 8. Quick reference: where each behavior lives in code

| Behavior | File / Symbol |
|---|---|
| SW install + activate + offline fallback | `public/sw.js` |
| Manifest fields (name, theme, icons, id, start_url) | `src/app/manifest.ts` |
| Viewport theme color, apple-touch-icon, appleWebApp metadata | `src/app/layout.tsx` |
| SW registration (production-only) | `src/components/pwa/ServiceWorkerRegistration.tsx` |
| iOS share-icon hint logic | `src/lib/pwa/install-prompt.ts` + `src/hooks/usePwaInstallPrompt.ts` |
| iOS share-icon hint UI + dismiss | `src/components/pwa/InstallPrompt.tsx` |
| Chromium `beforeinstallprompt` capture + `appinstalled` clear | `src/lib/pwa/before-install-prompt.ts` |
| Android / desktop install button hook | `src/hooks/useBeforeInstallPrompt.ts` |
| Android / desktop install button UI | `src/components/pwa/AndroidInstallButton.tsx` |
| `/sw.js` headers (Content-Type, no-cache) and global CSP additions | `next.config.js` |
| Auth proxy exclusion for PWA assets | `src/proxy.ts` matcher |
| Brand color hex constants for manifest/viewport | `src/lib/pwa/brand.ts` |
| Offline fallback page | `src/app/offline/page.tsx` |

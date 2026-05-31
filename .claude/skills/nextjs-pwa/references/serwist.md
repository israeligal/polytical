# `@serwist/turbopack` setup

Use this when the hand-rolled SW isn't enough — i.e., you need Workbox-style runtime caching strategies, precache manifest injection, expiration plugins, or `defaultCache` route presets. For installable shells with a simple offline fallback, prefer hand-rolled (see main SKILL.md).

## Why two Serwist packages exist

Serwist is the modern Workbox-for-Next.js project (successor to `@ducanh2912/next-pwa`). It ships two integrations from the same monorepo:

- `@serwist/next` → integrates via webpack plugin (`@serwist/webpack-plugin`). **Webpack-only.** Serwist's own example pins `"dev": "next dev --webpack"` and `"build": "next build --webpack"` — they explicitly opt out of Turbopack.
- `@serwist/turbopack` → integrates via esbuild + `@swc/core` as a sibling build process. **Works with Turbopack** (Next.js 15+ default).

Both publish in lockstep (same version, same release commit). Both are MIT, signed with GitHub Actions provenance.

## When to use Serwist over hand-rolled

Use Serwist when:
- You want **precache manifest injection**: build-time list of all hashed static assets auto-baked into the SW.
- You need **runtime caching strategies** (StaleWhileRevalidate for fonts, CacheFirst for images, NetworkFirst for HTML) without writing each handler manually.
- You're using **expiration plugins** (cap caches at N entries / N days).
- You want `navigationPreload` set up correctly out of the box.

Skip Serwist when:
- You only need installability + push notifications + an offline fallback page. Hand-rolled is ~25 lines of `sw.js`; Serwist adds ~3 packages and a separate build step.
- You want zero risk of build-time integration drift across Next.js minor versions.

## Install

```bash
pnpm add -D @serwist/turbopack esbuild serwist
```

Note `esbuild` is a peer dep of `@serwist/turbopack` (or `esbuild-wasm` if you can't use the native binary). Both are optional but one is required.

## `app/sw.ts` template

Adapt from Serwist's `next-basic` example. The `__SW_MANIFEST` global is populated at build time by `@serwist/turbopack`'s precache injection.

```ts
// app/sw.ts
import { defaultCache } from "@serwist/next/worker"
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"
import { Serwist } from "serwist"

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
})

serwist.addEventListeners()
```

## `package.json` scripts

`@serwist/turbopack` runs as a **separate build process** alongside `next dev` / `next build`. The CLI watches `app/sw.ts` and emits `public/sw.js`.

Exact script wiring varies by Serwist version — consult `https://serwist.pages.dev/docs/next/turbo` for current commands. The pattern is roughly:

```json
{
  "scripts": {
    "dev": "concurrently \"next dev\" \"serwist dev\"",
    "build": "next build && serwist build",
    "start": "next start"
  }
}
```

In `pnpm` you'll likely want `concurrently` or `npm-run-all` to run both processes. In production, Serwist builds the SW into `public/sw.js` which Vercel/your host serves as a static asset.

## SW registration (same as hand-rolled)

Use the same `ServiceWorkerRegistration` client component as Path A — register `/sw.js` with `scope: "/"`, `updateViaCache: "none"`, gated on `NODE_ENV === "production"`. Serwist doesn't replace this; it just produces the SW file.

## Headers and CSP

Same as hand-rolled. Serwist doesn't change the headers story. See main SKILL.md for the `next.config.js` block.

## Gotchas specific to Serwist

- **`defaultCache` imports from `@serwist/next`, not `@serwist/turbopack`** — even when you're using the Turbopack package, the cache strategies presets are still in `@serwist/next/worker`. Don't switch the import.
- **Build output is in `public/sw.js`, not `.next/`** — gitignore it (`public/sw.js`, `public/sw.js.map`) so it doesn't pollute commits.
- **Dev mode behavior**: register the SW only in production builds, exactly as in the hand-rolled path. Serwist will still emit `sw.js` in dev, but registering it during HMR causes the same stale-cache problems.
- **`runtimeCaching: defaultCache` caches third-party requests by default** including Stripe, fonts, analytics. If you don't want that, write a smaller `runtimeCaching` array with only the rules you need.

## When Workbox won't fit

If you find yourself fighting Serwist's strategy abstractions, fall back to hand-rolled. The `Serwist` constructor is convenience over the raw service worker API — anything you can't express via its config you can express in 30 lines of `sw.js`. The split is: Serwist wins on declarative caching with many rules, hand-rolled wins on precise control with few rules.

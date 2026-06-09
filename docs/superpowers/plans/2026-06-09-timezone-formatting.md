# App-wide Israel-Time Date Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Format every displayed date/time in **Asia/Jerusalem**, centralized in one module, eliminating the React #418 hydration mismatch (server-UTC vs client-local) seen on `/notifications` — and guard against regressions with a lint rule.

**Architecture:** A small `lib/time.ts` exposing Asia/Jerusalem-pinned `Intl.DateTimeFormat` formatters (no date-fns — the repo is Intl-only). All client components import from it. An ESLint `no-restricted-syntax` rule bans ad-hoc `Intl.DateTimeFormat` / `toLocale*String` outside the sanctioned files.

**Tech:** Next.js 16 (RSC + client components), `Intl.DateTimeFormat` with `timeZone`.

---

## Root cause

The 4 date-display sites are all `"use client"` and format with the **runtime** timezone (no `timeZone` option). On Vercel the server renders in **UTC**, the browser in the **local** tz → the SSR text ≠ the hydrated text → React #418 (and wrong times for users). Pinning `timeZone: "Asia/Jerusalem"` makes both renders identical AND correct. `Intl.DateTimeFormat` with an explicit `timeZone` is deterministic regardless of the process tz — so it's hydration-safe by construction.

## Files

**Create**
- `lib/time.ts` — central formatters.
- `lib/time.test.ts` — unit tests (Israel tz + DST, tz-env-independence).

**Modify (route through `lib/time`)**
- `components/notifications/notification-feed.tsx:8,103` — local `dateFmt` (day+month+hour+minute) → `formatDateTime`. *(the confirmed #418 site)*
- `components/comments/comment-row.tsx:7,98` — local `dateFmt` (day+month) → `formatDate`.
- `components/admin/suggestion-review-row.tsx:76` — `toLocaleDateString("he-IL")` → `formatDate`.
- `components/admin/market-admin-row.tsx:74` — `toLocaleString("he-IL")` → `formatDateTime`.
- `eslint.config.mjs` — add the `no-restricted-syntax` guard.

**Left as-is (assessed, not a tz hydration source)**
- `lib/format.ts:17` `timeUntil` — a *relative duration* ("בעוד 3 ימים") from `Date.now()`, not a tz format; `Countdown` (`components/badges.tsx`) is server-rendered (no `"use client"`), so its output is static HTML — no client hydration of it.
- `lib/format.ts:5` `formatCoins` — `toLocaleString("en-US")` on a **number**, not a date (excluded from the lint rule).
- `app/lib/knesset/normalize.ts:25` — server-only data normalization, already pins `Asia/Jerusalem` (`en-CA` day key); excluded from the rule.

## Convention Compliance (`CLAUDE.md`)

| Convention | Compliance |
|---|---|
| "times display in Asia/Jerusalem, stored as UTC" | The whole point — `lib/time.ts` pins `Asia/Jerusalem`; storage stays UTC (ISO). |
| Recommended guardrail "block-direct-date-imports (force the central Asia/Jerusalem time module)" | Implemented as an ESLint `no-restricted-syntax` rule (we have no hookify plugin; lint is the enforcement we do have). |
| Named exports, RORO-ish, files <500 lines | `lib/time.ts` is tiny, named exports. Formatters take a single `string \| Date`. |
| No bare console / errors-over-fallbacks | Pure formatters; invalid input → `Invalid Date` is acceptable (callers pass real ISO/Date). |
| Logical Tailwind / tokens | No styling change — only the formatted string changes (now Israel-correct). |
| Co-located `*.test.ts`; behavior not implementation; UTC dates in tests | `lib/time.test.ts` asserts the Israel-time **output** for known UTC instants (incl. a DST and a non-DST date) and that the result is identical under a forced `TZ` env. |

## Verified third-party signatures

`Intl.DateTimeFormat(locales, options)` — `options.timeZone?: string` (IANA name). With an explicit `timeZone`, `.format(date)` yields the same string regardless of the host environment's timezone — the property we rely on for hydration-safety. (ECMA-402 `Intl.DateTimeFormat`; MDN "Intl.DateTimeFormat() constructor" → `timeZone`.) `he-IL` long month yields Hebrew month names ("ביוני"); `2-digit` hour/minute yields zero-padded 24h. No SDK/dep — JS built-in.

## Reused data structures

Searched `lib/`, `app/lib/`, `types/` — **no existing display-time module** (`normalize.ts` is data-day extraction, `format.ts` is numbers + relative time). So `lib/time.ts` is new, placed alongside `lib/format.ts` (the existing presentational-format home). No new types — formatters take `string | Date` and return `string`.

## Fixtures

None needed — inputs are ISO strings / `Date`s we already have; the test constructs known UTC instants inline (no captured payloads).

---

## Task 1 — `lib/time.ts` (TDD)

- [ ] **Write `lib/time.test.ts`** (unit):
```ts
import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, APP_TIMEZONE } from "./time";

describe("lib/time — Asia/Jerusalem formatting", () => {
  it("formatDateTime renders an Israel-time clock (summer = UTC+3)", () => {
    // 2026-06-01T20:30:00Z → 23:30 the same day in Asia/Jerusalem (IDT, UTC+3)
    const s = formatDateTime("2026-06-01T20:30:00Z");
    expect(s).toContain("23:30");
    expect(s).toContain("ביוני");
  });
  it("formatDateTime handles the winter offset (UTC+2)", () => {
    // 2026-01-01T20:30:00Z → 22:30 in Asia/Jerusalem (IST, UTC+2)
    expect(formatDateTime("2026-01-01T20:30:00Z")).toContain("22:30");
  });
  it("formatDateTime rolls the date across the Israel midnight boundary", () => {
    // 2026-06-01T22:30:00Z → 01:30 on 2026-06-02 in Asia/Jerusalem
    const s = formatDateTime("2026-06-01T22:30:00Z");
    expect(s).toContain("2"); // 2 ביוני
    expect(s).toContain("01:30");
  });
  it("formatDate renders day + Hebrew month only (no time)", () => {
    const s = formatDate("2026-06-01T20:30:00Z");
    expect(s).toContain("ביוני");
    expect(s).not.toMatch(/\d{2}:\d{2}/);
  });
  it("accepts a Date as well as an ISO string", () => {
    expect(formatDateTime(new Date("2026-06-01T20:30:00Z"))).toBe(formatDateTime("2026-06-01T20:30:00Z"));
  });
  it("is timezone-independent (the hydration-safety guarantee)", () => {
    // Forcing process.env.TZ must NOT change the output — pinned formatter.
    const before = formatDateTime("2026-06-01T20:30:00Z");
    const prev = process.env.TZ;
    process.env.TZ = "America/New_York";
    try { expect(formatDateTime("2026-06-01T20:30:00Z")).toBe(before); }
    finally { process.env.TZ = prev; }
  });
  it("exposes the timezone constant", () => { expect(APP_TIMEZONE).toBe("Asia/Jerusalem"); });
});
```
- [ ] **Run → fail** (`npx vitest run lib/time.test.ts`).
- [ ] **Write `lib/time.ts`**:
```ts
/** The single app timezone. Polytical is Israel-only; all displayed times are
 *  Asia/Jerusalem (stored as UTC). Centralized so server + client format
 *  identically — an explicit `timeZone` makes Intl deterministic regardless of
 *  the host tz, which is what prevents UTC/local hydration mismatches. */
export const APP_TIMEZONE = "Asia/Jerusalem";

const dateTimeFmt = new Intl.DateTimeFormat("he-IL", {
  timeZone: APP_TIMEZONE,
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("he-IL", {
  timeZone: APP_TIMEZONE,
  day: "numeric",
  month: "long",
});

const asDate = (v: string | Date): Date => (typeof v === "string" ? new Date(v) : v);

/** Israel-time date + time, e.g. "1 ביוני בשעה 21:33". */
export function formatDateTime(value: string | Date): string {
  return dateTimeFmt.format(asDate(value));
}

/** Israel-time date only, e.g. "1 ביוני". */
export function formatDate(value: string | Date): string {
  return dateFmt.format(asDate(value));
}
```
- [ ] **Run → pass.** **Commit.**

## Task 2 — Route the 4 sites through `lib/time` + remove local formatters

- [ ] `notification-feed.tsx`: delete the local `dateFmt`; `import { formatDateTime } from "@/lib/time"`; replace `{dateFmt.format(new Date(item.createdAtIso))}` → `{formatDateTime(item.createdAtIso)}`.
- [ ] `comment-row.tsx`: delete local `dateFmt`; `import { formatDate }`; `{dateFmt.format(new Date(createdAtIso))}` → `{formatDate(createdAtIso)}`. (Drop the stale "1 ביוני 2026" comment — there's no year.)
- [ ] `suggestion-review-row.tsx`: `import { formatDate }`; `const created = formatDate(createdAtIso);`.
- [ ] `market-admin-row.tsx`: `import { formatDateTime }`; `{formatDateTime(closeAtIso)}`. (Admin numeric → long format, now consistent app-wide.)
- [ ] **Run** `npx vitest run components/notifications components/comments` and existing component/story tests → green. **Commit.**

## Task 3 — ESLint guard (regression prevention)

- [ ] `eslint.config.mjs` — append a config block:
```js
{
  files: ["**/*.{ts,tsx}"],
  ignores: ["lib/time.ts", "lib/format.ts", "app/lib/knesset/normalize.ts"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
        message: "Use the Asia/Jerusalem formatters in @/lib/time — never `new Intl.DateTimeFormat` directly (UTC/local hydration mismatches).",
      },
      {
        selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]",
        message: "Use the Asia/Jerusalem formatters in @/lib/time — never `toLocale*String` for dates (UTC/local hydration mismatches).",
      },
    ],
  },
}
```
- [ ] **Run `pnpm lint`** → must be green (proves the 4 sites are migrated AND the rule doesn't false-flag `format.ts`/`time.ts`/`normalize.ts`). If a `*.stories.tsx` trips it, migrate it too. **Commit.**

## Task 4 — Full verify

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green.
- [ ] **Browser-QA (prod build):** `pnpm build && pnpm start`, log in, open `/notifications` → **0 console errors (the #418 is gone)** and timestamps read Israel time. Spot-check `/market/<id>` comments + `/admin`.

## Test plan (per the `testing` skill)

- Unit (`unit-node`), co-located `lib/time.test.ts`. Assert **observable output** (the formatted Hebrew string) for known UTC instants — incl. a summer (UTC+3) and winter (UTC+2) date to prove DST, a midnight-boundary roll, and **tz-env-independence** (force `process.env.TZ` → identical output) which is the literal hydration-safety property. No mocks (pure Intl). The migrated components are covered by their existing stories/tests + the browser-QA pass (hydration error is a runtime-only symptom — unit tests can't catch #418, so the browser step is the real gate).

## Verification Status

**Verified from source/docs**
| Item | Citation |
|---|---|
| 4 client sites format with no `timeZone` | `notification-feed.tsx:8`, `comment-row.tsx:7`, `suggestion-review-row.tsx:76`, `market-admin-row.tsx:74` (all `"use client"`) |
| `Intl.DateTimeFormat` `timeZone` → deterministic, host-tz-independent | ECMA-402 / MDN `Intl.DateTimeFormat` |
| `timeUntil`/`Countdown` is relative + server-rendered (not a tz source) | `lib/format.ts:17`, `components/badges.tsx` (no `"use client"`) |

**NOT verified — needs live testing**
| Item | How | Owner | Gate |
|---|---|---|---|
| #418 actually gone on prod | prod-build browser QA on `/notifications` (server-UTC vs client-local only reproduces in a real build) | dev | **HARD GATE** — the symptom is runtime-only |

## Final steps
- [ ] No fixtures to refresh.
- [ ] `/wrap-up` (advisory → `/log-decisions` / `/evergreen-documentation` if flagged; a `docs/decisions/timezone.md` entry is likely warranted).
- [ ] `/code-review` before pushing.

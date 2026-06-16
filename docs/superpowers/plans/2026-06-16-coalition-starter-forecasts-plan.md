# Plan — Coalition starter forecasts (+ delete-motion follow-up)

> Status: **DRAFT for review** · Date: 2026-06-16 · Author: Claude (per user request)
> Branch: `feat/coalition-polish`. The banner copy is implemented on this branch; the
> starter-forecasts feature below is **plan-only** for now (user said "plan it").

## Problem

A freshly created coalition lands on an **empty** scoped feed — nothing to predict,
no reason for invited members to engage on day one. We want a new coalition to be
born populated, by **cloning the latest national forecasts** into it.

## Decisions (from the user)

- **Seed on create**, integrated into the create-coalition flow (`/g/new`).
- **Default ON** — the "seed with current forecasts" option is checked by default.
- **Count:** default **top 10** latest open national forecasts; offer **all** as an
  alternative ("top 10 / all").
- Source = the **latest open national** forecasts (the same ones on the feed).

## How it slots into existing code (verified)

- **Clone primitive already exists.** `cloneForecastToGroupAction` (`app/actions/groups.ts:196`)
  re-reads a national market via `getMarketBundle` and re-creates it in a group via
  `createGroupMotion` (rejects cloning a group motion; carries outcomes + personIds).
  The starter-seed is **N clones in a loop** of that same logic.
- **"Latest national" source:** `listOpenMarkets({ groupScope: null })` (already returns
  open national markets, `createdAt DESC`). Take `slice(0, 10)` for top-10, or all.
- **Create flow:** `createGroupAction` (`app/actions/groups.ts:39`) → `createGroup`
  (`app/lib/groups/service.ts:51`). Form: `components/groups/group-create-form.tsx`.

## Build steps (when approved)

1. **Schema/input** — extend `createGroupSchema` (`app/lib/groups/schemas.ts`) with
   `seedForecasts: z.boolean().default(true)` + `seedCount: z.enum(["top10","all"]).default("top10")`.
   Define-and-import; no inline Zod.
2. **Service** — add `seedGroupFromNational({ db, groupId, ownerId, limit })` in
   `app/lib/groups/motions.ts` (or a new `seed.ts`): read top-N open national markets,
   clone each into the group reusing the `cloneForecastToGroup` core (extract the clone
   body from the action into a service fn both call). Runs in/after the create tx;
   tolerate per-motion failures (skip + log, don't fail the whole create). Closes-at:
   carry the source `closeAt` if future, else default +14d.
3. **Action** — `createGroupAction` accepts `{ seedForecasts, seedCount }`, calls the
   seeder after `createGroup`. Rate-limit already covers create.
4. **Form** — `group-create-form.tsx`: a checkbox "התחילו עם התחזיות הלאומיות האחרונות"
   (default checked) + a top-10/all toggle, shown only when checked. RTL, tokens, Hebrew.
5. **Tests (PGLite)** — seed 12 national markets → create a group with `top10` → exactly
   10 group motions cloned (groupId set), national untouched; `all` → all 12; `seedForecasts:false`
   → 0. Assert cloned motions are sandboxed (not in global reads).
6. **Docs** — decision-log entry; refresh the `groups` skill (create flow now seeds).

## Open questions

- **[product]** Re-seed on *join*, or only on *create*? (Plan assumes create-only.)
- **[product]** If fewer than 10 national forecasts are open, seed what's available (yes,
  assumed) — confirm.
- **[product]** Clone the crowd's predictions too, or start each motion at 0? (Plan: start
  at 0 — the coalition predicts fresh; `cloneForecastToGroup` already copies only the
  question/outcomes/politicians, not bets.)

---

## Follow-up (separate, plan later) — delete a coalition forecast

Today a coalition motion can only be **created** + **resolved** — there is **no delete**
(`deleteMarket`/`voidMarket` reject `groupId`; no `deleteGroupMotion`). When we plan it:
owner/admin-gated `deleteGroupMotion` mirroring `resolveGroupMotion`'s sandbox (hard-delete
the `markets` row by id + cascade its bets/comments; never touches global stats). Likely a
small action + a delete control on the motion's market page for owners/admins.

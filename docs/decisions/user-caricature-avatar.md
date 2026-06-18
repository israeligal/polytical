# Decisions — User Caricature Avatar

> Newest on top. Entries immutable. Design spec:
> `docs/superpowers/specs/2026-06-17-user-caricature-avatar-design.md`.

## 2026-06-18 — Test DB needs a committed migration, not just a schema column

`createTestDb` (`app/lib/testing/create-test-db.ts`) builds the PGlite schema by
**replaying `./drizzle/*.sql`** via the migrator, not from the live Drizzle
schema. So adding `users.caricatureUrl` to `schema.ts` alone is invisible to
tests — it needs a committed migration (`0033_user_caricature_url.sql`) **and** a
`drizzle/meta/_journal.json` entry. Prod (single DB, no dev twin) is applied with
the guarded `scripts/apply-caricature-migration.ts` (`pnpm caricature:migrate`,
`ALLOW_PROD_INGEST=1`). `db:push` avoided (destructive TTY prompts / drops the
trigram GIN indexes).

## 2026-06-18 — Upload via base64 data URL, not multipart

The client center-crops + downscales the image to a 512px WebP on a canvas
(`lib/image-normalize.ts`) and sends it to `setCaricatureAction` as a base64 data
URL. This keeps the established plain-object Server-Action shape + `ActionResult`
(no new route handler), and the normalization bounds the payload (~1.5 MB cap,
enforced server-side in `parseCaricatureDataUrl`). The blob `put` is injected in
tests so they need no token/network.

## 2026-06-18 — BYO generation now, automated API later

Gemini can't be opened pre-filled (no native URL prompt param; can't auto-attach
a photo — verified). So v1 is bring-your-own: copy the prompt + open Gemini +
upload the result back. The schema (`caricatureUrl`), Blob storage, `UserAvatar`,
and the shared prompt constant (`lib/caricature-prompt.ts`) are built so a
one-click Gemini-API path drops in later with no schema/UI-shell change. No API
cost in v1.

## 2026-06-18 — Caricature is the avatar everywhere; handle-initial is the fallback

One shared `UserAvatar` renders the caricature if present, else the handle-initial
circle (coalesced to `FALLBACK_HANDLE`, `<bdi>`, never `users.name` — AGENTS.md).
Swapped into header, profile, comments, leaderboard, and group roster/scoreboard/
vote-stances (the group surfaces were text-only before — they gain a 28px
avatar). The Google `image` is never shown as an avatar.

## 2026-06-18 — No pre-moderation in v1; admin reset via CLI

Caricatures render to other users (leaderboard/comments/groups) → an abuse
surface. v1 is self-serve with no pre-publish moderation. Mitigation:
`pnpm reset:caricature <handle>` clears a user's avatar (there is no admin users
UI to hang an in-app button on yet). A user-report path is deferred. Flagged the
same way as the groups privacy carve-out.

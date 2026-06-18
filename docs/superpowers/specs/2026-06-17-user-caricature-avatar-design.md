# User Caricature Avatar — Design Spec

**Date:** 2026-06-17
**Status:** Approved (brainstorm) → ready for implementation plan
**Branch:** `feat/user-caricature-avatar`

## Summary

Let a user give themselves a **caricature avatar** — a fun, stylized comic-book
portrait generated from their photo — and use it as their avatar **everywhere**
in the app (header, profile, leaderboard, comments, group lists). For v1 the
generation is **bring-your-own (BYO)**: the app hands the user a ready-made
prompt and opens Gemini for them; the user generates the image in their own
Gemini, then uploads the result back. The schema and upload plumbing are built
so an **automated Gemini-API path can drop in later** without rework.

This mirrors the existing politician caricature cards (`public/caricatures/...`)
but for users it must be self-service and automated-enough to scale — the
manual, admin-driven Chrome+clipboard pipeline used for politicians cannot.

## Goals

- A user can produce a caricature and have it shown as their avatar across the
  whole app, with the handle-initial circle as the fallback when they have none.
- v1 ships with **no image-generation API cost** — the user generates in their
  own Gemini and uploads the result.
- The data model + upload flow are forward-compatible with a one-click
  automated API path (no schema churn to add it later).

## Non-goals (YAGNI)

- **Automated Gemini-API generation.** Designed-for, not built in v1.
- **Crop UI.** `object-cover` handles the circular crop; no client cropper.
- **Content-moderation pipeline.** v1 is self-serve with an admin reset only
  (see Known Risks).
- **Sharing / downloading the caricature as a card.** Out of scope.

## Decisions (from brainstorm)

1. **Role:** the caricature is the user's **avatar everywhere** (not a
   profile-only hero or a framed collectible).
2. **Photo source:** for the *future API path*, default to the Google OAuth
   photo with an upload override. For *BYO v1*, the user supplies whatever photo
   they like directly to Gemini — the app doesn't need the source photo at all.
3. **Generation path:** **BYO now, API-ready later.**
4. **Entry points:** **both** — a skippable nudge in onboarding *and* a full
   editor on the profile page.
5. **Moderation:** none pre-publish for v1; admin can reset. (Known Risk.)

## Why "open Gemini with the prompt" is limited

`gemini.google.com` has **no native URL prompt parameter** — `?prompt=` / `?q=`
only work with a third-party Chrome extension, and even then the **photo can
never be auto-attached** via URL. So the "Open Gemini" affordance is: **copy the
prompt to clipboard + open `gemini.google.com/app` in a new tab**, with
instructions to paste and attach a photo. The generated image must be brought
back into the app by the user (upload/paste) — Gemini cannot push it to us.

## The prompt

Adapted from the politician trading-card prompt: frame, name banner, stats, and
the 4:5 ratio removed; reshaped into a square, centered head-and-shoulders that
crops cleanly to a circle.

> Use the attached photo as the exact likeness reference for the person's face.
> Create a bold, fun caricature avatar of this person — a centered
> head-and-shoulders portrait, facing forward (slight 3/4), filling the frame so
> it crops cleanly into a circle. Exaggerated caricature features (slightly
> oversized head, expressive larger-than-life face), clean comic-book ink
> linework with cel shading, dramatic rim lighting, rich saturated colors, on a
> simple solid background with a subtle Israeli-blue energy glow behind them.
> Square 1:1. NO frame, NO text, NO banner, NO logos — just the character on a
> clean background. Punchy, friendly, iconic. Clearly a stylized caricature, NOT
> photorealistic. Keep the face true to the attached photo — same hairline, same
> features.

Stored as a single exported constant (e.g. `lib/caricature/user-prompt.ts`) so
the UI copy-button and the future API call share one source of truth.

## Architecture

### Data model
- Add nullable column `caricatureUrl text` to the `user` table
  (`app/lib/schema.ts`). Holds the Vercel Blob URL of the final image.
- **Not** a reuse of `user.image` (the Google OAuth photo); they are distinct.
- Migration: single prod DB, no dev DB (see project memory). Declare in schema,
  apply via a guarded one-off runner / `drizzle-kit push` per the project's
  Neon/Drizzle rules. No data backfill needed (default `null`).

### Storage (Vercel Blob)
- Add `@vercel/blob`; require `BLOB_READ_WRITE_TOKEN`.
- Final image at `avatars/<userId>.png` (overwrite on replace).
- Add the Blob host to `next.config` `images.remotePatterns` so `next/image`
  may serve it.

### Shared `UserAvatar` component — the "everywhere"
- New `components/user-avatar.tsx`: props `{ caricatureUrl, handle, size }`.
  - `caricatureUrl` present → `next/image`, circular, `object-cover`.
  - else → the existing initial circle: first char of `handle` (coalesced to
    `FALLBACK_HANDLE`), rendered with `<bdi>`, never `users.name`.
- Replace the hand-rolled initial circles in: `components/site-header.tsx`,
  `app/profile/page.tsx`, `components/comments/comment-row.tsx`,
  `components/leaderboard-row.tsx`, and group member lists
  (`components/groups/*`). One component, all surfaces.
- Add a Storybook story (sizes × with/without caricature × RTL).

### Display repositories (blast radius)
Repos that join `user` for display must additionally `select`
`users.caricatureUrl` next to `handle`, threaded through their return types and
**all call sites** (unified-pattern rule). At minimum: comments, leaderboard,
group members. Scope guards and the never-select-`name` rule are unchanged.

### BYO editor (profile)
A client component (`components/profile/caricature-editor.tsx`) with three parts:
1. **Generate** — render the prompt, a **Copy prompt** button, an **Open
   Gemini** button (new tab → `gemini.google.com/app`), and short Hebrew
   instructions (paste → attach photo → generate → download/copy).
2. **Upload result** — dropzone + paste-to-upload + preview → server action
   `setCaricature`. Validation: image MIME allow-list, max size (~4 MB),
   sane dimensions. Rate-limited (per project rule on uploads).
3. **Replace / Remove** — re-run upload, or `clearCaricature`.

### Server actions / repo
- `app/actions/caricature.ts`: `setCaricature({ blobUrl|file })` and
  `clearCaricature()`, both returning `ActionResult`.
- Action → service (validate) → repo (`requireUserId` scope guard first line) →
  Blob `put` + update `users.caricatureUrl`. Routes/components never touch
  Drizzle directly (layering rule).

### Onboarding nudge
A skippable card in the existing handle+arena wizard
(`app/lib/onboarding/` + `app/onboarding/onboarding-wizard.tsx`): "רוצה אווטאר
קריקטורה? אפשר עכשיו או אחר כך" → opens the same editor or skips. Never blocks
`onboardedAt`.

## Known risks

- **Abuse surface:** caricatures render to *other* users (leaderboard,
  comments). v1 has no pre-moderation. Mitigations: admin can reset a user's
  caricature (reuse existing admin/role-gated patterns); a user "report" path is
  deferred. Flagged the same way as the groups legal carve-out.
- **BYO friction / availability:** image generation in Gemini is not free for
  every account/region; some users will be unable to complete step 2. Acceptable
  for v1; the automated API path is the long-term fix.

## Testing

- PGlite integration tests for `setCaricature` / `clearCaricature` (real Drizzle
  + scope guard; wrong-user cannot mutate another's avatar).
- Unit tests for upload validation (MIME / size / dimensions).
- `UserAvatar` story covering caricature, fallback initial, sizes, RTL.

## Forward-compatibility (the API path, later)

The same `caricatureUrl` column, Blob storage, `UserAvatar`, and prompt constant
are reused. Adding automation = a server route that sends the source photo
(Google `image` or an uploaded selfie) + the prompt to the Gemini image API,
stores the result in Blob, and sets `caricatureUrl` — no schema or UI-shell
change.

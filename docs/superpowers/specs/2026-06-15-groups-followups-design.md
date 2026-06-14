# Groups follow-ups — share-to-vote · clone-to-group · stance-sharing (Phase 2)

> Design doc, 2026-06-15. Three additive extensions to the shipped groups feature (PR #83). Grounded in the design dossier (workflow `wf_50dca23a`) which carries the file-level plan + tests. Frontend follows the EXISTING design system (OKLCH tokens, RTL, the shipped `components/groups/*` patterns) — refined, consistent, not a new aesthetic.

## Phasing (dossier-recommended)
- **PR B1** (branch `feat/groups-followups`, already has the polish): **Feature 3 (share-to-vote)** + **Feature 2 (clone-to-group)** — low-risk, no/known schema.
- **PR C** (separate branch): **Feature 1 (Phase 2 stance-sharing)** — migration `0031`, privacy carve-out, isolated for review. Opt-in, default OFF → merging exposes no data until a user explicitly consents.

---

## Feature 3 — Share a group-motion vote link (smallest)
A "🔗 שתפו קישור הצבעה" copy button on a **group** motion (the `/market/[id]` page header CTA row, `groupId`-gated) and per-motion in the group feed (`/g/[slug]`, as a sibling of the card `<Link>`, not nested → `preventDefault`/`stopPropagation`). Clones the only clipboard pattern (`group-action-bar.tsx` copyInvite): `${origin}/market/${marketId}`, 2s "הועתק ✓" confirmation.
- **Vote link (`/market/<id>`) ≠ invite link (`/g/join/<code>`)** — kept distinct; a non-member with a vote link gets `notFound()` (no preview — sandboxed content stays private).
- **Adopt the logged-out-member fix:** in `app/market/[id]/page.tsx`, when `groupId && !session?.user` → `redirect("/login?callbackUrl=/market/<id>")` instead of `notFound()` (so a logged-out member follows the link → login → back to vote).
- No schema, no action, no notification (the create-time `group_motion_posted` push is already the "vote now" nudge). Decision: **no extra nudge** in v1.

## Feature 2 — Clone a global forecast into a group (non-destructive)
A "הביאו לקואליציה" button on the **global** market detail (`!groupId && session.user`, near the existing suggest CTA) → a group-picker (the `group-switcher` disclosure pattern over `listMyGroups`) with a `closeAt` date field → creates a NEW group motion mirroring `questionHe`/`category`/`type`/outcomes (incl. `personId`)/`personIds`. The global market is untouched.
- **Gap to close:** `createGroupMotion` (`motions.ts`) drops politician links — widen its signature to `outcomes?: {labelHe; personId?}[]` + `personIds?: number[]`, thread `personId` through `buildOutcomeRows`, pass `personIds` to `createMarket` (which already supports it).
- **New action** `cloneForecastToGroupAction` (mirrors `createGroupMotionAction`): session+rate-limit, **server-side re-read** the source bundle (never trust client), reject if `bundle.market.groupId != null`, map binary→`outcomes:null` / multi→real rows, `closeAt` from the picker (default: source closeAt if future, else +7d).
- Any **active member** can clone (existing `createGroupMotion` guard). Clone **counts** against the per-(user,group) daily cap. v1: detail page only (cards deferred); no dedup/provenance.

## Feature 1 — Phase 2: opt-in stance sharing in a group (for discussion, not scored)
A per-member **consent** to reveal their Knesset-vote *stances* (`for`/`against`) to fellow **active + consenting** members of one private group. The first-ever member-to-member direction reveal → mandatory carve-out doc.
- **New table** `group_stance_consent (groupId→groups cascade, userId→users cascade, consentedAt, PK(groupId,userId))` in `schema-groups.ts`; presence = opted-in, DELETE = opted-out. Migration **0031** (regenerate number on merge if collision).
- **The 4-way reveal gate** (`getGroupVoteStances`, modeled on `getGroupMotionPicks`): returns a member's direction ONLY when **viewer is an active member + viewer consented + target consented + target is active**. Any failure → empty, **never an error carrying a direction**.
- **Invariants preserved:** global/public stance surfaces keep the k≥10 floor (untouched); the k-floor is waived ONLY inside the consenting private group; direction never logged (`track` carries `groupId` only; no raw-Drizzle rethrow); cascade on account AND group; active-membership filter so a leave drops the reveal immediately. The match engine + existing stance service/repo are NOT modified.
- **UI:** an opt-in toggle on the group page ("שתפו את העמדות שלי בקבוצה"; default OFF; clear copy); a "איך הקבוצה הצביעה" block on `/vote/[id]` for consenting active members (fellow consenting members' directions + an "X מתוך Y חברים שיתפו" denominator to flag the selection effect); below-consent/non-member → the existing aggregate (unchanged).
- **Docs:** `docs/decisions/groups-stances.md` (carve-out, immutable) + a privacy clause in `app/privacy/page.tsx` — **flagged for your/legal review** (Israel PPL Amendment 13). Default-OFF means merging exposes nothing pre-consent.
- **Product decisions (locked):** per-group blanket consent (not per-vote); decisive `user_stances` only (v1); un-share hides past directions immediately (with a warning in the toggle copy).

## Tests (PGLite) + QA
Per the dossier: clone (multi keeps personId + market_politicians union; binary uses BINARY_OUTCOMES; fresh groupId/status; non-member rejected; group-source rejected), stance reveal 4-way gate (empty for each failing condition incl. target-left), cascade, global-k-gate regression, direction-never-logged. Then browser-QA all three against the prod DB; clean up test data.

# Decision Log — Group stance sharing (Phase 2)

> Newest on top. Entries are immutable: supersede, don't edit. Spec: `docs/superpowers/specs/2026-06-15-groups-followups-design.md`. Branch `feat/groups-followups`. ⚠️ The privacy copy + this carve-out need product/legal sign-off before the feature is publicized.

---

## 2026-06-15 — A narrow, consent-gated carve-out from "stance direction never leaves the DB"

**The standing invariant.** A user's Knesset-vote stance (`for`/`against`, `user_stances`) is read back ONLY for the owning user (every per-user read is `requireUserId`-guarded) or as a **≥10-person k-anonymous aggregate percentage** (`getStanceState`, `AGGREGATE_MIN_STANCERS = 10`). The direction is never logged (analytics carry `voteId` only; the stance action never rethrows raw Drizzle errors, whose messages embed bound params). Until this feature, **no query anywhere returned another identified user's stance direction.** (Israel PPL Amendment 13 — political opinion is sensitive personal data; cited in `app/privacy/page.tsx`.)

**Decision.** Introduce the FIRST member-to-member direction reveal, behind a deliberate, narrow waiver: a member's stance direction MAY be shown to a fellow member of one private group **only when ALL FOUR hold** — (1) the viewer is an *active* member of that group, (2) the viewer has an active consent row, (3) the target has an active consent row, (4) the target is an *active* member. Consent is per-group (presence in `group_stance_consent` = opted-in; DELETE = opted-out), default OFF, revocable (un-sharing hides past directions immediately), and cascade-deleted with both the account and the group. The reveal (`getGroupVoteStances`) returns `[]` on any gate failure — **never an error**, since a Drizzle error message could carry a direction. The k-anonymity floor is waived **only inside the consenting private group**; every global/public aggregate keeps `k ≥ 10` untouched (`stances/service.ts`, `agenda-stances/service.ts` unchanged). The match engine and existing stance service/repo are NOT modified — this is purely additive (new `group_stance_consent` table + new gated read + new action).

**Why this is acceptable.** Exposure requires explicit, mutual, revocable opt-in among members of a private, invite-only group; nothing leaves that group; default OFF means shipping the code exposes no one's data until two members both choose to share. The selection effect (only sharers are shown) is surfaced via an "X מתוך Y שיתפו" denominator.

**Rejected.** Per-vote consent (too heavy; couples to `user_stances`); one-sided reveal (a viewer seeing others without sharing their own — unfair + weaker consent); reusing the match engine (wrong primitive — user↔MK, self-only); waiving the global k-floor (the waiver is strictly group-scoped).

**Open / needs sign-off.** Product + legal review of `app/privacy/page.tsx`'s new clause before publicizing; whether to surface a retraction-confirmation warning; whether agenda (pre-vote) stances are included (v1: decisive `user_stances` only — pre-votes adopt into `user_stances` on resolution, so they flow in automatically).

# Decision Log — Group stance sharing (Phase 2)

> Newest on top. Entries are immutable: supersede, don't edit. Spec: `docs/superpowers/specs/2026-06-15-groups-followups-design.md`. Branches `feat/groups-followups` → `feat/groups-discovery`. ✅ Product owner accepted the carve-out (see 2026-06-15 entry below) — no formal legal counsel review.

---

## 2026-06-15 — Product owner accepts the carve-out; pre-votes shared immediately; un-share confirmed

**Decision (product owner).** Ship the consent-gated stance-sharing carve-out as designed, **without a formal legal-counsel review.** Rationale given: Polytical does not sell data, does not share personal information with any external party, and runs no analytics/ad tracking (per `app/privacy/page.tsx`); the only exposure is a member's own direction to fellow members of a private group, and only when **both** sides explicitly, mutually, and revocably opt in. This entry records the owner's risk acceptance — it is **not itself a legal opinion.** The earlier "needs product/legal sign-off" gate (see header + the 2026-06-15 carve-out entry's "Open" item) is hereby **closed by product decision.**

**Two refinements decided in the same call:**
1. **Agenda (pre-vote) stances are now shareable IMMEDIATELY in-group** — superseding the prior "v1: decisive `user_stances` only" choice. A new `getGroupAgendaStances` (the agenda twin of `getGroupVoteStances`, same 4-way gate, reads `agenda_stances` by `agendaItemId`) surfaces fellow consenting members' pre-vote positions on the bill page ("עמדת הקואליציה"), before the plenum vote exists. The global k≥10 floor on the public agenda aggregate (`agenda-stances/service.ts`) stays untouched — the waiver remains strictly in-group. On resolution the sweep still adopts pre-votes into `user_stances`, after which the decisive reveal takes over (and `getAnnouncedAgendaItemByBill` returns null, so the agenda reveal stops rendering — clean handoff, no double-display).
2. **Turning sharing OFF now requires a confirmation** (`StanceSharingToggle`) — "לכבות שיתוף עמדות? העמדות שלכם יוסתרו מיד מחברי הקואליציה." Turning it ON stays frictionless.

**Still strictly scoped.** Default OFF; reveal returns `[]` on any gate failure (never an error); cascade-deleted with the account and the group; nothing leaves the private group.

---

## 2026-06-15 — A narrow, consent-gated carve-out from "stance direction never leaves the DB"

**The standing invariant.** A user's Knesset-vote stance (`for`/`against`, `user_stances`) is read back ONLY for the owning user (every per-user read is `requireUserId`-guarded) or as a **≥10-person k-anonymous aggregate percentage** (`getStanceState`, `AGGREGATE_MIN_STANCERS = 10`). The direction is never logged (analytics carry `voteId` only; the stance action never rethrows raw Drizzle errors, whose messages embed bound params). Until this feature, **no query anywhere returned another identified user's stance direction.** (Israel PPL Amendment 13 — political opinion is sensitive personal data; cited in `app/privacy/page.tsx`.)

**Decision.** Introduce the FIRST member-to-member direction reveal, behind a deliberate, narrow waiver: a member's stance direction MAY be shown to a fellow member of one private group **only when ALL FOUR hold** — (1) the viewer is an *active* member of that group, (2) the viewer has an active consent row, (3) the target has an active consent row, (4) the target is an *active* member. Consent is per-group (presence in `group_stance_consent` = opted-in; DELETE = opted-out), default OFF, revocable (un-sharing hides past directions immediately), and cascade-deleted with both the account and the group. The reveal (`getGroupVoteStances`) returns `[]` on any gate failure — **never an error**, since a Drizzle error message could carry a direction. The k-anonymity floor is waived **only inside the consenting private group**; every global/public aggregate keeps `k ≥ 10` untouched (`stances/service.ts`, `agenda-stances/service.ts` unchanged). The match engine and existing stance service/repo are NOT modified — this is purely additive (new `group_stance_consent` table + new gated read + new action).

**Why this is acceptable.** Exposure requires explicit, mutual, revocable opt-in among members of a private, invite-only group; nothing leaves that group; default OFF means shipping the code exposes no one's data until two members both choose to share. The selection effect (only sharers are shown) is surfaced via an "X מתוך Y שיתפו" denominator.

**Rejected.** Per-vote consent (too heavy; couples to `user_stances`); one-sided reveal (a viewer seeing others without sharing their own — unfair + weaker consent); reusing the match engine (wrong primitive — user↔MK, self-only); waiving the global k-floor (the waiver is strictly group-scoped).

**Open / needs sign-off.** Product + legal review of `app/privacy/page.tsx`'s new clause before publicizing; whether to surface a retraction-confirmation warning; whether agenda (pre-vote) stances are included (v1: decisive `user_stances` only — pre-votes adopt into `user_stances` on resolution, so they flow in automatically).

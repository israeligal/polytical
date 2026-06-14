# Answer deck (markets + votes)

## 2026-06-12 — Hybrid deck on detail pages, swipe = cast only

**Decision.** Post-answer "next question" flow ships as a single client deck
(`components/question-deck.tsx`) mounted on `/vote/[id]` and `/market/[id]`:

- **Hybrid embed** — the page's own question renders as a plain widget; the
  deck chrome (nav arrows, dots, peek card) appears only after the first
  answer. The page below the deck keeps belonging to the original question;
  every card links to its own page ("לעמוד התחזית" / "לעמוד ההצבעה").
- **One-tap everywhere** — binary markets drop the separate "תנו מנדט" submit
  and move from the 320px aside into the main column (Design-1 52px equal
  buttons). Multi rows and stance pills already were one-tap.
- **Swipe = cast, only** — dragging exists solely on *unanswered two-option*
  cards (right = first/positive option, left = second/negative, matching the
  RTL button placement). Multi-choice and answered cards never drag; back/next
  buttons + dots are the only navigation. One gesture, one meaning — and the
  buttons remain the complete non-gesture path (a11y).
- **Gesture safety** (from the 4-lens adversarial review): `pointercancel`
  always aborts and never casts (OS back-swipe/scroll takeover would otherwise
  record an answer the user never released); 36px edge dead-zones; 110px
  threshold with a discrete armed state ("שחררו לאישור"); 34° axis lock;
  drags require a live pointerdown (`active` ref — hover can never drag);
  a card flies off only after the server action confirms (no silently lost
  answers); swipe-casts get a 5s undo snackbar (stance → toggle-retract;
  market → return to the editable card, since predictions have no delete).
- **Queues are per-feature**, newest-first, server-built:
  `getUnansweredDeckVotes` (decisive ∧ no user stance, anti-join) and
  `getUnpredictedOpenMarketCards` (open ∧ no bet, reusing the feed bundle
  pipeline). Existing server actions are reused unchanged — rate limits,
  P0-9 stance privacy and revalidation semantics stay in one place.

**Why.** Answering momentum (vote → immediately vote again) is the growth
loop; the embedded hybrid keeps detail pages honest (no successful analog
keeps an advancing deck inside a contextual page — so the deck *starts* as the
page's own widget and the user opts into the run by answering). Swipe-only-
casts kills the motor-habit hazard where "swipe = next" learned on multi cards
silently casts נגד on a binary card.

**Rejected.** Bottom-sheet next-question (modal guilt, no desktop twin);
navigate-per-question (kills momentum on mobile); in-place swap with swipe
navigation (stale-context + gesture ambiguity); desktop rail "next up" panel
(superseded by the same deck working at desktop widths; rail revisit possible
later). Prototypes for all variants live in `components/prototypes/` (Storybook
→ Prototypes/*) until the deck stabilizes in prod.

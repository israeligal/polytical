# Runbook: 26th Knesset (K26) cutover

Election expected Oct 2026. This is the election-night checklist to move the app from K25 to K26. It is a living checklist, not a decision record.

**Do NOT start any people-curation step until certified K26 results exist in OData** (`KNS_Faction` and `KNS_PersonToPosition` rows with `KnessetNum eq 26`). Guessing winners, leaders, or the next PM violates the sourcing invariant. Bumping the term before K26 exists in OData is destructive: roster ingest returns zero rows and marks every current MK inactive.

## What auto-heals vs what is manual

**Auto-heals** (re-derived from OData every ingest, keyed by stable `personId`): `active`, `roleHe` (+ `לשעבר`), `party`/`factionId` (via stable FactionID), `facts`, `nameHe`/`gender`/`inKnessetSince`, roster membership. Therefore the **sitting-PM (legendary), minister/Speaker (uncommon), and rank-and-file (common) tiers auto-heal** via the `roleHe` regexes in `lib/rarity.ts`. No set edits for those.

**Manual curation** (untouched by ingest): the two term constants; `FORMER_PM_PERSON_IDS` + `PARTY_LEADER_PERSON_IDS` (`lib/rarity.ts`); `LEADERLESS_OK` (`scripts/check-roster.ts`); one test; new-MK caricature PNGs. `politicians.imageUrl` is carved out of the ingest upsert, so re-ingest never wipes card art.

## Checklist

1. **Precondition.** Confirm certified K26 rows exist in OData (see above). Do nothing before this.

2. **Bump the term (config).**
   - `app/lib/knesset/odata.ts:16` — `CURRENT_KNESSET` 25 -> 26. This single constant drives every executable term filter (roster/bills/laws ingest, `check-roster`, `politicians/repo`, `agenda/curate`, politician activity split, and the politician-page term label). Single-sourced as of the readiness PR. It does NOT drive marketing/guide copy (see "Stale copy" below) or the `enrich-vote-items` legacy backfill (see step 8).
   - `scripts/ingest-votes.ts:16` — `K25_START` is the vote-backfill date floor, NOT a term filter. Set it to the K26 first-sitting date (or pass `--from`). Rename optional.

3. **Ingest the roster.** Run `pnpm ingest:knesset` (members step at minimum). This re-derives all auto-heal fields by stable `personId`.

4. **Generate the worklist.** Run `pnpm check:roster`. It emits (a) every seated K26 party with active members but no curated leader, and (b) every `PARTY_LEADER_PERSON_IDS` id no longer active (this is where Odeh 30066 drops out if he did not return). It is the worklist generator and the green gate. NB: OData exposes only the faction whip (`יו״ר סיעה`), never "party leader", so it cannot NAME a leader, only flag the gap.

5. **Rebuild `PARTY_LEADER_PERSON_IDS` (`lib/rarity.ts:35`) — manual.** For each party flagged in 4a, determine its real leader from certified party/gov.il sources (NOT the whip role). Confirm the stable `personId` by reading the ingested `politicians` row (sanity-check `nameHe`/`party`) and store the number. Remove every id flagged in 4b. Never add or remove by Hebrew-name match.

6. **Rebuild `FORMER_PM_PERSON_IDS` (`lib/rarity.ts:23`) — manual, additive.** Keep 23594 (Lapid) and 23511 (Bennett). Add the outgoing PM's stable id (965, Netanyahu) ONLY IF a new PM is sworn in AND ingest shows 965's derived `roleHe` no longer satisfies `isSittingPmRole`. If he stays caretaker or forms the next government he remains legendary. Also revisit the caricature-cards skill note "sitting PM (965) keeps a hand-supplied gold card" if the PM changes.

7. **Rebuild `LEADERLESS_OK` (`scripts/check-roster.ts:116`) — manual, from scratch.** Keep only K26 parties whose curated leader legitimately cannot appear among that party's actives (extra-parliamentary leader, or a seatless Norwegian-Law-minister leader). Re-justify each against the K26 roster; do not carry K25 entries forward blindly.

8. **Fix coupled code (neither blocks ingestion).**
   - `app/lib/politicians/activity.test.ts` seeds bills at `knessetNum: 25` as "current" and 24 as "earlier"; `getPoliticianActivity` splits on `eq/ne(bills.knessetNum, CURRENT_KNESSET)`. Re-base to 26=current / 25=earlier, or parameterize on `CURRENT_KNESSET`.
   - `scripts/enrich-vote-items.ts` agenda fetch is hardcoded `KnessetNum eq 25` (a legacy backfill, deliberately NOT term-driven). Widen it to cover K25+K26 (or add a `--knesset` arg) so unclassified K26 agenda votes still match.
   - All vote/item fixtures are source-driven and stay valid forever (no new K26 fixtures needed).

9. **Green gate.** Re-run `pnpm check:roster` until it exits 0, then `pnpm lint` + `pnpm typecheck` + tests.

10. **Cards.** Generate caricatures for new MKs and re-check departed MKs via the `caricature-cards` skill + `pnpm check:caricatures`. Tier changes (new leaders/PM) force a frame regen.

## Stale user-facing copy (follow-up, not a blocker)

Hardcoded "כנסת ה-25" and K25-specific counts ("6,979" votes, "458" roll-calls) will read wrong at K26 but do not gate ingestion. Decide per string whether copy tracks the term or is frozen K25 history; the vote counts are K25 facts and must be re-sourced for K26, not blindly interpolated. Load the `seo` skill before editing marketing/guide pages.

Authoritative discovery (re-run at cutover; line numbers drift): `grep -rn "ה-25" app/ --include="*.ts" --include="*.tsx"`. Current surfaces:
- Guides: `app/guides/knesset-votes/` (page.tsx + jsonld) and `app/guides/mk-match/` (page.tsx + jsonld).
- Marketing: `app/about/page.tsx` + `about-jsonld.ts`, `app/votes/page.tsx`.
- App: `app/politician/[id]/page.tsx` empty state (the rest of that page renders the term via `CURRENT_KNESSET`).
- The "6,979"/"458" counts: the knesset-votes guide, plus English "K25" comments in `app/lib/schema-votes.ts:24`, `app/lib/votes/normalize.ts:27`, `app/lib/knesset/odata-types.ts`.

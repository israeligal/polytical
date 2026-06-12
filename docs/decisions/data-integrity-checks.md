# Key Decisions: Data-Integrity Check Scripts

### Two read-only gates: check:caricatures + check:roster (2026-06-12, main)
Recurring incident class: data that LOOKS lost but is actually a coverage gap. (1) The roster re-ingest activated 12 Norwegian-Law ministers who never had card art — read as "we lost tons of images" though nothing was ever deleted (card files live in git; `imageUrl` is carved out of the ingest upsert SET). (2) Goldknopf returned to his seat in 2025-06 and surfaced as a plain MK because the curated `PARTY_LEADER_PERSON_IDS` set had no mechanical freshness check (a name-spelling variant also hid him from an ad-hoc query). Fix: `pnpm check:caricatures` (active-without-card / pointer-without-file / file-without-pointer) and `pnpm check:roster` (active-flag drift vs official open K25 positions, minister/deputy role drift, party-leader curation coverage + curated-leaders-still-active). Both exit 1 on findings so preflight/CI can gate.

### Curated-leader coverage uses an explicit, justified allowlist (2026-06-12)
Some parties legitimately have no curated leader among their actives: העבודה (leader extra-parliamentary), הציונות הדתית + הימין הממלכתי (Smotrich/Sa'ar ARE curated but their own rows carry no faction membership — OData truth for seatless ministers, so the party-string grouping can't see them). `LEADERLESS_OK` in check-roster.ts lists each with the reason; an unexplained leaderless party is a finding.

### imageUrl flips only AFTER the file deploys (2026-06-12, process)
Pointing `politicians.imageUrl` at a card file before the Vercel deploy serves it shows a broken image in prod (happened with Michaeli; compounded by the RGBA-favicon deploy freeze). Order is: commit file → push → poll the prod URL for 200 → then update the DB pointer.

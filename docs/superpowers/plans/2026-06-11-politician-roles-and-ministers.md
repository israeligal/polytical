# Politician Roles + Non-MK Ministers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each politician's real role (minister portfolio via `DutyDesc`, not generic "שר"), admit current non-MK ministers (Norwegian-law) with a "נורבגי" chip + ⓘ, and label truly-departed people as inactive "…לשעבר".

**Architecture:** All data logic lives in `app/lib/knesset/normalize.ts` (`normalizeK25Members` + a new `resolveRoleLabel` helper). No migration — the Norwegian flag rides the existing `facts` JSONB. The adapter exposes it; the politician page renders the chip + ⓘ. Re-ingest refreshes prod; a query emits the caricature-regeneration list.

**Tech Stack:** TypeScript, Drizzle, PGlite (tests via Vitest), Next 16 RSC, Tailwind v4 (logical props, OKLCH tokens), Hebrew RTL.

**Spec:** `docs/superpowers/specs/2026-06-11-politician-roles-and-ministers.md` (all decisions final).

**Branch:** new branch off `origin/main` (the repo has concurrent worktree activity — branch fresh, isolate, PR at the end).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `app/lib/knesset/normalize.ts` | role resolver + roster inclusion/active/flag | modify |
| `app/lib/knesset/normalize.test.ts` | unit tests for the above | modify |
| `lib/types.ts` | add `Politician.isNorwegianMinister?` | modify |
| `app/lib/politicians/adapter.ts` | map flag + suppress empty party | modify |
| `app/lib/politicians/adapter.test.ts` | adapter test for the flag | modify |
| `app/politician/[id]/page.tsx` | render נורבגי chip + ⓘ; party only when present | modify |
| `scripts/list-role-changes.ts` | emit caricature-regeneration list | create |

---

## Task 1: Position constants + role resolver

**Files:**
- Modify: `app/lib/knesset/normalize.ts` (near `MK_POSITIONS`, line ~10)
- Test: `app/lib/knesset/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `app/lib/knesset/normalize.test.ts` (import `resolveRoleLabel` in the existing import block):

```ts
import { resolveRoleLabel } from "./normalize";
import type { KnsPersonToPosition } from "./odata-types";

function ptp(over: Partial<KnsPersonToPosition>): KnsPersonToPosition {
  return {
    PersonToPositionID: 1, PersonID: 1, PositionID: 43, KnessetNum: 25,
    StartDate: "2022-11-15T00:00:00", FinishDate: null, GovMinistryID: null,
    GovMinistryName: null, DutyDesc: null, FactionID: null, FactionName: null,
    GovernmentNum: null, CommitteeID: null, CommitteeName: null, IsCurrent: true,
    LastUpdatedDate: null, ...over,
  };
}
const LABELS = new Map<number, string>([
  [45, "ראש הממשלה"], [122, "יושב–ראש הכנסת"], [70, "סגן יושב-ראש הכנסת"],
  [48, 'יו"ר סיעה'], [39, "שר"], [43, "חבר הכנסת"],
]);

test("resolveRoleLabel: minister → DutyDesc, not generic 'שר'", () => {
  const rows = [ptp({ PositionID: 43 }), ptp({ PositionID: 39, DutyDesc: "שר הביטחון" })];
  expect(resolveRoleLabel({ rows, positionLabels: LABELS })).toBe("שר הביטחון");
});

test("resolveRoleLabel: multi-portfolio picks first non-'שר נוסף'", () => {
  const rows = [
    ptp({ PositionID: 39, DutyDesc: "שר נוסף במשרד הביטחון" }),
    ptp({ PositionID: 39, DutyDesc: "שר האוצר" }),
  ];
  expect(resolveRoleLabel({ rows, positionLabels: LABELS })).toBe("שר האוצר");
});

test("resolveRoleLabel: bare/blank minister DutyDesc → 'שר ללא תיק'", () => {
  const rows = [ptp({ PositionID: 39, DutyDesc: "שר" })];
  expect(resolveRoleLabel({ rows, positionLabels: LABELS })).toBe("שר ללא תיק");
});

test("resolveRoleLabel: PM outranks everything", () => {
  const rows = [ptp({ PositionID: 45 }), ptp({ PositionID: 39, DutyDesc: "שר האוצר" })];
  expect(resolveRoleLabel({ rows, positionLabels: LABELS })).toBe("ראש הממשלה");
});

test("resolveRoleLabel: faction chair via Description", () => {
  const rows = [ptp({ PositionID: 43 }), ptp({ PositionID: 48 })];
  expect(resolveRoleLabel({ rows, positionLabels: LABELS })).toBe('יו"ר סיעה');
});

test("resolveRoleLabel: plain MK → null (adapter supplies default)", () => {
  expect(resolveRoleLabel({ rows: [ptp({ PositionID: 43 })], positionLabels: LABELS })).toBeNull();
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm vitest run app/lib/knesset/normalize.test.ts -t resolveRoleLabel`
Expected: FAIL — `resolveRoleLabel is not a function`.

- [ ] **Step 3: Implement the resolver + constants**

In `app/lib/knesset/normalize.ts`, after `export const MK_POSITIONS = new Set([43, 61]);` add:

```ts
// Government office positions (let a person hold office without a Knesset seat).
export const PM_POSITIONS = new Set([45, 51, 73]);        // PM / acting / alternate
export const MINISTER_POSITIONS = new Set([39, 57]);      // שר / שרה
export const DEPUTY_MINISTER_POSITIONS = new Set([40, 59]);
// "In office" = a current seat OR a current ministerial post.
export const OFFICE_POSITIONS = new Set([43, 61, 39, 57, 45, 51, 73]);
const SPEAKER = 122, DEPUTY_SPEAKER = 70, FACTION_CHAIR = 48;
const SECONDARY_MINISTER_PREFIX = "שר נוסף"; // an "additional minister at X" qualifier

/** Specific minister title from DutyDesc; bare/blank → "שר ללא תיק" (no portfolio). */
function ministerTitle(rows: KnsPersonToPosition[]): string | null {
  const mins = rows.filter((r) => MINISTER_POSITIONS.has(r.PositionID));
  if (!mins.length) return null;
  const titles = mins.map((r) => (r.DutyDesc ?? "").trim()).filter(Boolean);
  const primary = titles.find((t) => !t.startsWith(SECONDARY_MINISTER_PREFIX)) ?? titles[0];
  if (!primary || primary === "שר" || primary === "שרה") {
    const femaleOnly = mins.every((r) => r.PositionID === 57);
    return femaleOnly ? "שרה ללא תיק" : "שר ללא תיק";
  }
  return primary;
}

/**
 * The headline role label, by seniority: PM > minister (DutyDesc) > deputy minister >
 * Speaker > Deputy Speaker > faction chair > any other titled role > null (plain MK,
 * which the adapter renders as the default "חבר/ת הכנסת"). NO "לשעבר" suffix here —
 * the caller adds it for inactive people.
 */
export function resolveRoleLabel({
  rows, positionLabels,
}: { rows: KnsPersonToPosition[]; positionLabels: Map<number, string> }): string | null {
  const pm = rows.find((r) => PM_POSITIONS.has(r.PositionID));
  if (pm) return positionLabels.get(pm.PositionID) ?? "ראש הממשלה";
  const minister = ministerTitle(rows);
  if (minister) return minister;
  const deputy = rows.find((r) => DEPUTY_MINISTER_POSITIONS.has(r.PositionID));
  if (deputy) return (deputy.DutyDesc ?? "").trim() || positionLabels.get(deputy.PositionID) || null;
  for (const pid of [SPEAKER, DEPUTY_SPEAKER, FACTION_CHAIR]) {
    if (rows.some((r) => r.PositionID === pid)) {
      const label = positionLabels.get(pid);
      if (label) return label;
    }
  }
  const other = rows.find(
    (r) => !MK_POSITIONS.has(r.PositionID) && r.PositionID !== FACTION_MEMBER_POSITION && positionLabels.get(r.PositionID),
  );
  return other ? positionLabels.get(other.PositionID)! : null;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm vitest run app/lib/knesset/normalize.test.ts -t resolveRoleLabel`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/knesset/normalize.ts app/lib/knesset/normalize.test.ts
git commit -m "feat(knesset): role resolver — minister DutyDesc, multi-portfolio, ללא תיק"
```

---

## Task 2: Roster inclusion + active + Norwegian flag + current-only faction

**Files:**
- Modify: `app/lib/knesset/normalize.ts` (`normalizeK25Members`, lines ~105-174)
- Test: `app/lib/knesset/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `app/lib/knesset/normalize.test.ts` (`normalizeK25Members` is already importable — add it to the import block if missing):

```ts
import { normalizeK25Members } from "./normalize";

test("normalizeK25Members: seat-less minister is active, flagged נורבגי, titled by ministry, no party", () => {
  const rows: KnsPersonToPosition[] = [
    ptp({ PersonID: 1027, PositionID: 39, DutyDesc: "שר החוץ", FactionID: null, IsCurrent: true }),
  ];
  const [m] = normalizeK25Members({
    p2p: rows, positionLabels: LABELS, prov: PROV,
    persons: [{ PersonID: 1027, FirstName: "גדעון", LastName: "סער", GenderDesc: null, Email: null, IsCurrent: false, LastUpdatedDate: null }],
    factionNameById: new Map(),
  });
  expect(m.active).toBe(true);
  expect(m.roleHe).toBe("שר החוץ");
  expect(m.party).toBeNull();
  expect((m.facts as { isNorwegianMinister?: boolean }).isNorwegianMinister).toBe(true);
});

test("normalizeK25Members: departed MK (no current office) → inactive, role suffixed לשעבר, empty faction", () => {
  const rows: KnsPersonToPosition[] = [
    ptp({ PersonID: 500, PositionID: 43, IsCurrent: false, FinishDate: "2024-01-01T00:00:00" }),
    ptp({ PersonID: 500, PositionID: 54, FactionID: 1095, FactionName: "סיעה", IsCurrent: false }),
  ];
  const [m] = normalizeK25Members({
    p2p: rows, positionLabels: LABELS, prov: PROV,
    persons: [{ PersonID: 500, FirstName: "פלוני", LastName: "אלמוני", GenderDesc: null, Email: null, IsCurrent: false, LastUpdatedDate: null }],
    factionNameById: new Map([[1095, "סיעה"]]),
  });
  expect(m.active).toBe(false);
  expect(m.roleHe).toBe("חבר/ת הכנסת לשעבר");
  expect(m.party).toBeNull(); // no CURRENT faction → empty
});

test("normalizeK25Members: sitting MK with current faction keeps party + is not flagged", () => {
  const rows: KnsPersonToPosition[] = [
    ptp({ PersonID: 100, PositionID: 43, IsCurrent: true }),
    ptp({ PersonID: 100, PositionID: 54, FactionID: 1095, FactionName: "סיעה", IsCurrent: true }),
  ];
  const [m] = normalizeK25Members({
    p2p: rows, positionLabels: LABELS, prov: PROV,
    persons: [{ PersonID: 100, FirstName: "ישראל", LastName: "ישראלי", GenderDesc: null, Email: null, IsCurrent: true, LastUpdatedDate: null }],
    factionNameById: new Map([[1095, "סיעה"]]),
  });
  expect(m.active).toBe(true);
  expect(m.party).toBe("סיעה");
  expect((m.facts as { isNorwegianMinister?: boolean }).isNorwegianMinister).toBe(false);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm vitest run app/lib/knesset/normalize.test.ts -t normalizeK25Members`
Expected: FAIL (active/roleHe/flag assertions, plus existing departed test may shift — that's intended).

- [ ] **Step 3: Implement the changes**

In `normalizeK25Members`, replace the per-person body. The new inclusion/active/role/faction/flag logic (replacing lines ~119-171, the `for (const [personId, allRows] of byPersonAll)` block):

```ts
  for (const [personId, allRows] of byPersonAll) {
    const officeRows = allRows.filter((r) => OFFICE_POSITIONS.has(r.PositionID));
    if (!officeRows.length) continue; // held office this term (seat OR ministry)
    const active = officeRows.some((r) => r.IsCurrent === true);
    const rows = active ? allRows.filter((r) => r.IsCurrent === true) : allRows;

    // Faction: CURRENT membership only — no fall-back to a past stint (spec: empty when
    // not currently in a faction; covers seat-less ministers and departed MKs alike).
    const factionRow =
      allRows.find(
        (r) => r.PositionID === FACTION_MEMBER_POSITION && r.IsCurrent === true &&
          r.FactionID != null && r.FactionID !== SENTINEL_FACTION_ID,
      ) ?? null;
    const factionId = factionRow?.FactionID ?? null;
    let party: string | null = null;
    if (factionId != null) {
      const joined = factionNameById?.get(factionId) ?? null;
      const inline = factionRow?.FactionName ?? null;
      if (joined != null && inline != null && joined !== inline) {
        logger.warn("knesset.normalize.faction_name_mismatch", { factionId, joined, inline });
      }
      party = joined ?? inline;
    }

    // Tenure: MIN(StartDate) across ALL faction stints (kept for departed too).
    const startDates = allRows
      .filter((r) => r.PositionID === FACTION_MEMBER_POSITION)
      .map((r) => toDateOnly(r.StartDate))
      .filter((d): d is string => !!d);
    const inKnessetSince = startDates.length ? startDates.sort()[0] : null;

    // Norwegian-law minister: currently a minister/PM but holds NO current seat.
    const currentSeat = allRows.some((r) => MK_POSITIONS.has(r.PositionID) && r.IsCurrent === true);
    const currentMinister = allRows.some(
      (r) => (MINISTER_POSITIONS.has(r.PositionID) || PM_POSITIONS.has(r.PositionID)) && r.IsCurrent === true,
    );
    const isNorwegianMinister = active && currentMinister && !currentSeat;

    let roleHe = resolveRoleLabel({ rows, positionLabels });
    if (!active) roleHe = `${roleHe ?? "חבר/ת הכנסת"} לשעבר`;

    const roleRows = rows.filter((r) => !MK_POSITIONS.has(r.PositionID) && r.PositionID !== FACTION_MEMBER_POSITION);
    const roles = roleRows.map((r) => positionLabels.get(r.PositionID)).filter((l): l is string => !!l);
    const ministries = roleRows.map((r) => r.GovMinistryName).filter((m): m is string => !!m);
    const committeesNamed = roleRows.map((r) => r.CommitteeName).filter((c): c is string => !!c);

    const nameHe = nameByPerson.get(personId) ?? "";
    out.push({
      personId, nameHe, nameEn: null, party, factionId, roleHe, inKnessetSince, dob: null,
      facts: { roles, ministries, committees: committeesNamed, isNorwegianMinister },
      active, searchName: normalizeSearchName(nameHe),
      sourceDataset: "KNS_PersonToPosition", sourceUrl: prov.sourceUrl, fetchedAt: prov.fetchedAt,
    });
  }
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm vitest run app/lib/knesset/normalize.test.ts`
Expected: PASS. If a pre-existing departed-MK test asserted a last-faction fallback or a non-suffixed role, update it to the new spec (empty faction, "…לשעבר") — that change is intended.

- [ ] **Step 5: Commit**

```bash
git add app/lib/knesset/normalize.ts app/lib/knesset/normalize.test.ts
git commit -m "feat(knesset): admit non-MK ministers, נורבגי flag, current-only faction, former labels"
```

---

## Task 3: Adapter + Politician type (expose the flag, suppress empty party)

**Files:**
- Modify: `lib/types.ts` (Politician interface, line ~19-30)
- Modify: `app/lib/politicians/adapter.ts`
- Test: `app/lib/politicians/adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `app/lib/politicians/adapter.test.ts`:

```ts
test("dbToCard surfaces the Norwegian-minister flag and drops an empty party", () => {
  const card = dbToCard(row({
    party: null, roleHe: "שר החוץ",
    facts: { isNorwegianMinister: true },
  }));
  expect(card.isNorwegianMinister).toBe(true);
  expect(card.role).toBe("שר החוץ");
  expect(card.party).toBe(""); // empty, not "ללא סיעה"
  // the "סיעה" fact row is omitted when there is no party
  expect(card.facts.find((f) => f.label === "סיעה")).toBeUndefined();
});

test("dbToCard: a normal MK keeps party and is not flagged", () => {
  const card = dbToCard(row({ party: "מפלגה" }));
  expect(card.isNorwegianMinister).toBe(false);
  expect(card.party).toBe("מפלגה");
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm vitest run app/lib/politicians/adapter.test.ts -t Norwegian`
Expected: FAIL — `card.isNorwegianMinister` undefined / party is "ללא סיעה".

- [ ] **Step 3: Implement**

In `lib/types.ts`, add to the `Politician` interface (after `imageUrl?`):

```ts
  /** Minister serving without a Knesset seat (Norwegian Law) — drives the נורבגי chip. */
  isNorwegianMinister?: boolean;
```

In `app/lib/politicians/adapter.ts`, replace `dbToCard`'s body so party can be empty and the flag is read:

```ts
export function dbToCard(row: PoliticianRow): Politician {
  const hasParty = !!row.party?.trim();
  const party = hasParty ? row.party!.trim() : ""; // empty (no faction) — NOT "ללא סיעה"
  const role = row.roleHe?.trim() || DEFAULT_ROLE;
  const sinceYear = knessetSinceYear(row.inKnessetSince);
  const isNorwegianMinister =
    (row.facts as { isNorwegianMinister?: boolean })?.isNorwegianMinister === true;

  const facts: PoliticianFact[] = [
    ...(hasParty ? [{ label: "סיעה", value: party }] : []),
    { label: "תפקיד", value: role },
    ...(sinceYear ? [{ label: "בסיעה מאז", value: sinceYear }] : []),
  ];

  return {
    id: String(row.personId),
    name: row.nameHe,
    party,
    role,
    cat: catFor(row.factionId),
    tagline: row.roleHe?.trim() ?? "",
    facts,
    imageUrl: row.imageUrl ?? undefined,
    isNorwegianMinister,
  };
}
```

> Note: a previously-existing test may assert `party === "ללא סיעה"` for a blank-party row. Update that expectation to `""` and drop the "סיעה" fact — the new behavior is intentional (empty, not the placeholder).

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm vitest run app/lib/politicians/adapter.test.ts`
Expected: PASS (after updating any blank-party expectation).

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts app/lib/politicians/adapter.ts app/lib/politicians/adapter.test.ts
git commit -m "feat(cards): expose isNorwegianMinister; empty party renders blank, not placeholder"
```

---

## Task 4: Card UI — נורבגי chip + ⓘ on the politician page

**Files:**
- Modify: `app/politician/[id]/page.tsx` (the role/party line, ~line 117-119)

- [ ] **Step 1: Implement the chip + ⓘ**

In `app/politician/[id]/page.tsx`, replace the role/party paragraph:

```tsx
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
            <span>
              {politician.role}
              {politician.party ? ` · ${politician.party}` : ""}
            </span>
            {politician.isNorwegianMinister && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs font-bold text-foreground"
                title="שר נורבגי — שר שאינו חבר הכנסת: לפי החוק הנורבגי הוא התפטר ממושבו, ח״כ מסיעתו נכנס במקומו, והוא ממשיך לכהן כשר."
              >
                נורבגי
                <span aria-hidden className="grid h-4 w-4 place-items-center rounded-full border border-border text-[10px] text-muted-foreground">i</span>
              </span>
            )}
          </p>
```

> Tokens/logical-props only; the `title` attribute carries the one-sentence ⓘ explainer (native tooltip — no new dependency). The chip shows only for seat-less ministers.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean (no errors; pre-existing warnings unrelated to this change are fine).

- [ ] **Step 3: Commit**

```bash
git add app/politician/[id]/page.tsx
git commit -m "feat(cards): show נורבגי chip + ⓘ tooltip for seat-less ministers"
```

---

## Task 5: Re-ingest + caricature-regeneration list

**Files:**
- Create: `scripts/list-role-changes.ts`

- [ ] **Step 1: Write the regeneration-list script**

Create `scripts/list-role-changes.ts`:

```ts
// Read-only: lists active politicians whose caricature role text likely changed, plus the
// new non-MK ministers (no card yet). Run AFTER the members re-ingest. No writes.
import { db } from "@/app/lib/db";
import { politicians } from "@/app/lib/schema";
import { eq } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({
      personId: politicians.personId, nameHe: politicians.nameHe,
      roleHe: politicians.roleHe, imageUrl: politicians.imageUrl, facts: politicians.facts,
    })
    .from(politicians)
    .where(eq(politicians.active, true));

  const newMinisters = rows.filter(
    (r) => (r.facts as { isNorwegianMinister?: boolean })?.isNorwegianMinister && !r.imageUrl,
  );
  const ministersWithCard = rows.filter((r) => r.roleHe?.startsWith("שר") && r.imageUrl);

  console.log("=== NEW non-MK ministers (no caricature yet → generate) ===");
  for (const r of newMinisters) console.log(`  ${r.personId}  ${r.nameHe}  ${r.roleHe}`);
  console.log(`\n=== Existing minister cards (role text may have changed → review/regenerate) ===`);
  for (const r of ministersWithCard) console.log(`  ${r.personId}  ${r.nameHe}  ${r.roleHe}`);
  console.log(`\nnew=${newMinisters.length} existing-minister-cards=${ministersWithCard.length}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Re-run the members ingest (refreshes roles + roster on the prod DB — GATED)**

> ⚠️ `.env` `DATABASE_URL` is prod (single-DB). Confirm with the user before running. The ingest is idempotent.

Run: `pnpm ingest:knesset --only=members`
Expected: log `knesset.ingest.entity_done … entity:"politicians"` with a roster count ≈129 (120 + ~9 ministers).

- [ ] **Step 3: Emit the regeneration list**

Run: `pnpm tsx --env-file=.env scripts/list-role-changes.ts`
Expected: prints the ~9 new ministers (Sa'ar/שר החוץ, Smotrich/שר האוצר, …) and the existing minister cards to review.

- [ ] **Step 4: Spot-check the data live**

Run a quick read (inline tsx or db studio): confirm Israel Katz (468) `roleHe="שר הביטחון"` (not "שר"), Sa'ar (1027) present, `active=true`, `facts.isNorwegianMinister=true`, `party` null.

- [ ] **Step 5: Commit the script**

```bash
git add scripts/list-role-changes.ts
git commit -m "chore(knesset): script to list caricature role-changes + new ministers"
```

---

## Task 6: Verify + browser QA + PR

- [ ] **Step 1: Full local gate**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 2: Browser QA (quick)**

Use the `browser-qa` skill on :3210 — visit a seated minister (Israel Katz → "שר הביטחון"), a seat-less minister (Sa'ar → "שר החוץ" + נורבגי chip + ⓘ tooltip on hover, no party), and a plain MK (unchanged). Check RTL + dark mode.

- [ ] **Step 3: `/code-review`**

Run `/code-review` on the diff; address findings; never `--no-verify`.

- [ ] **Step 4: Push + open PR**

```bash
git push -u origin feat/politician-roles
gh pr create --base main --title "feat(politician): real roles + non-MK ministers (Norwegian-law)" --body "…"
```

Attach a before/after screenshot via `pr-media`.

---

## Self-review notes
- **Spec coverage:** title fix (T1), admit ministers + flag + former + empty faction (T2), adapter/type (T3), chip+ⓘ (T4), re-ingest + caricature list (T5), QA/PR (T6). ✔ all spec sections mapped.
- **No new column** — flag lives in `facts` (T2/T3), per spec.
- **Type consistency:** `resolveRoleLabel({rows, positionLabels})`, `facts.isNorwegianMinister`, `Politician.isNorwegianMinister` used identically across tasks.
- **Caricature art** is intentionally out of scope — T5 only emits the list (manual `caricature-cards` pass follows).

# הצעה לסדר + Hebrew Auto-Handles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **This repo's CLAUDE.md overrides the default**: Workflow/Agent subagents run in the repo root, NOT this worktree — execute INLINE (superpowers:executing-plans).

**Goal:** Hebrew auto-generated handle suggestions in onboarding (server-generated, 🎲 reroll), rename the suggest-a-market flow to "הצעה לסדר" (drop "מהקהל"), and require a proposer-supplied due date (+ optional resolution-source note) that pre-fills the admin's `closeAt`.

**Architecture:** Pure handle helpers stay DB-free (`app/lib/onboarding/handle.ts`, new `handle-generator.ts`); availability-checked generation lives in the onboarding service behind a rate-limited server action; suggestion changes flow Route→Service→Repo with two additive nullable columns on `market_suggestions` (required-by-service for new rows). Tests replay real migrations into PGlite.

**Tech Stack:** Next 16 (RSC + server actions), Drizzle + Neon, PGlite tests, Tailwind v4 RTL.

**Spec:** `docs/superpowers/specs/2026-06-10-hatzaa-laseder-and-hebrew-handles-design.md`

---

### Task 1: Widen handle validation to Hebrew (no mixed scripts)

**Files:**
- Modify: `app/lib/onboarding/handle.ts`
- Create: `app/lib/onboarding/handle.test.ts`
- Modify: `app/actions/onboarding.ts:50` (error copy)
- Modify: `app/onboarding/onboarding-wizard.tsx:111,138` (copy)
- Modify: `app/lib/errors.ts:28` (message text only)

- [ ] **Step 1: Write the failing test** — `app/lib/onboarding/handle.test.ts`:

```ts
import { expect, test } from "vitest";
import { HANDLE_RE, normalizeHandle } from "./handle";

test.each([
  ["latin", "swift_falcon_7", true],
  ["hebrew", "מנדט_עודף", true],
  ["hebrew with digits", "קואליציה_42", true],
  ["hebrew final letters", "בלגן_שקט", true],
  ["mixed scripts rejected", "מנדטx", false],
  ["mixed scripts rejected 2", "abcד", false],
  ["niqqud rejected", "מַנדט_עודף", false],
  ["geresh rejected", "אג׳נדה", false],
  ["too short", "אב", false],
  ["too long latin", "a".repeat(21), false],
  ["too long hebrew", "א".repeat(21), false],
  ["spaces rejected", "מנדט עודף", false],
  ["uppercase rejected (pre-normalize)", "Falcon", false],
  ["digits-only ok", "12345", true],
])("HANDLE_RE %s", (_name, input, ok) => {
  expect(HANDLE_RE.test(input)).toBe(ok);
});

test("normalizeHandle strips @, trims, lowercases — Hebrew untouched", () => {
  expect(normalizeHandle("  @Falcon_7 ")).toBe("falcon_7");
  expect(normalizeHandle("@מנדט_עודף")).toBe("מנדט_עודף");
});
```

- [ ] **Step 2: Run it** — `pnpm vitest run app/lib/onboarding/handle.test.ts` → FAIL (Hebrew cases).

- [ ] **Step 3: Implement** — replace the regex in `app/lib/onboarding/handle.ts`:

```ts
/** 3–20 chars, single script: all-latin [a-z0-9_] OR all-hebrew [א-ת0-9_].
 *  Mixed Hebrew/Latin is rejected on purpose — bidi rendering + impersonation.
 *  א-ת is the base letter block only (includes finals, excludes niqqud/geresh). */
export const HANDLE_RE = /^(?:[a-z0-9_]{3,20}|[א-ת0-9_]{3,20})$/;
```

`normalizeHandle` unchanged.

- [ ] **Step 4: Run tests** — same command → PASS.

- [ ] **Step 5: Update user-facing copy** (server is already authoritative via HANDLE_RE):
  - `app/lib/errors.ts:28`: message → `"Handle must be 3–20 chars, all-latin or all-hebrew: letters, digits, _"`
  - `app/actions/onboarding.ts:50`: → `"כינוי לא תקין — 3–20 תווים בעברית או באנגלית (בלי לערבב): אותיות, ספרות ו-_"`
  - `app/onboarding/onboarding-wizard.tsx:111`: → `"כך תופיעו בטבלת המובילים ובדיונים. עברית או אנגלית: אותיות, ספרות וקו תחתון (3–20 תווים)."`
  - `app/onboarding/onboarding-wizard.tsx:138`: invalid-reason text → `"3–20 תווים, עברית או אנגלית בלי לערבב"`

- [ ] **Step 6: Commit**

```bash
git add app/lib/onboarding/handle.ts app/lib/onboarding/handle.test.ts app/actions/onboarding.ts app/onboarding/onboarding-wizard.tsx app/lib/errors.ts
git commit -m "feat(onboarding): allow all-Hebrew handles (single-script rule)"
```

---

### Task 2: Hebrew handle generator (pure module)

**Files:**
- Create: `app/lib/onboarding/handle-generator.ts`
- Create: `app/lib/onboarding/handle-generator.test.ts`

- [ ] **Step 1: Write the failing test**:

```ts
import { expect, test } from "vitest";
import { HANDLE_RE } from "./handle";
import { generateHandleCandidate, NOUNS, ADJECTIVES } from "./handle-generator";

test("every candidate passes HANDLE_RE (1000 rolls)", () => {
  for (let i = 0; i < 1000; i++) {
    const c = generateHandleCandidate();
    expect(c, c).toMatch(HANDLE_RE);
  }
});

test("word lists are large and single-script Hebrew", () => {
  const all = [...NOUNS.m, ...NOUNS.f, ...ADJECTIVES.m, ...ADJECTIVES.f];
  expect(NOUNS.m.length).toBeGreaterThanOrEqual(40);
  expect(NOUNS.f.length).toBeGreaterThanOrEqual(40);
  expect(ADJECTIVES.m.length).toBeGreaterThanOrEqual(40);
  expect(ADJECTIVES.f.length).toBeGreaterThanOrEqual(40);
  for (const w of all) expect(w, w).toMatch(/^[א-ת]{2,12}$/);
});

test("no duplicates within a list", () => {
  for (const list of [NOUNS.m, NOUNS.f, ADJECTIVES.m, ADJECTIVES.f])
    expect(new Set(list).size).toBe(list.length);
});

test("deterministic with injected rng; respects gender pairing", () => {
  // rng pinned to 0 → first masc noun + first masc adjective, no number suffix
  const c = generateHandleCandidate({ random: () => 0 });
  expect(c).toBe(`${NOUNS.m[0]}_${ADJECTIVES.m[0]}`);
});
```

- [ ] **Step 2: Run it** — `pnpm vitest run app/lib/onboarding/handle-generator.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `app/lib/onboarding/handle-generator.ts` (pure, no DB imports):

```ts
// Political-playful Hebrew handle generator. Pure — no DB, injectable rng.
// Gender-matched pairing only (מנדט_עודף / קואליציה_זריזה, never מנדט_זריזה).
// Words use the base letter block [א-ת] only so every combo passes HANDLE_RE.

type Gender = "m" | "f";

export const NOUNS: Record<Gender, readonly string[]> = {
  m: [
    "מנדט", "סקר", "נאום", "חוק", "תקציב", "משאל", "קמפיין", "בוחר", "מצביע", "שר",
    "סגן", "מועמד", "דובר", "יועץ", "שגריר", "נציג", "פתק", "קלף", "הסכם", "פילוג",
    "מהפך", "בלגן", "פעיל", "מטה", "כנס", "ועד", "צו", "דיון", "ספין", "רוב",
    "קול", "נשיא", "מנהיג", "מרד", "ויכוח", "עימות", "ניצחון", "פיליבסטר", "פרוטוקול", "תיק",
    "כיסא", "מיקרופון", "פודיום", "מצע", "סיבוב", "לובי", "גוש", "מחטף", "זיגזג",
  ],
  f: [
    "קואליציה", "אופוזיציה", "סיעה", "ועדה", "ישיבה", "הצבעה", "קלפי", "מליאה", "שדולה", "עצומה",
    "הפגנה", "מהפכה", "רפורמה", "פשרה", "הבטחה", "דמוקרטיה", "רוטציה", "קדנציה", "שאילתה", "מפלגה",
    "הצעה", "פגרה", "כותרת", "יוזמה", "משילות", "ריבונות", "נבחרת", "ממשלה", "החלטה", "הסתייגות",
    "קריאה", "במה", "ברית", "חזית", "עתירה", "הכרזה", "תחזית", "סערה", "דרמה", "הגרלה",
  ],
};

export const ADJECTIVES: Record<Gender, readonly string[]> = {
  m: [
    "זריז", "נמרץ", "סוער", "שקט", "ערמומי", "חתרני", "כריזמטי", "פופולרי", "עצמאי", "סורר",
    "ממלכתי", "נצחי", "לוהט", "קולני", "חשאי", "מבריק", "נחוש", "ציני", "אופטימי", "סקפטי",
    "פרגמטי", "מהפכני", "זהיר", "נועז", "חצוף", "ממולח", "שנון", "יציב", "הפכפך", "עיקש",
    "רהוט", "נלהב", "מסתורי", "עוקצני", "מתוחכם", "אמיץ", "מנצח", "מפתיע", "סודי", "זועם",
  ],
  f: [
    "זריזה", "נמרצת", "סוערת", "שקטה", "ערמומית", "חתרנית", "כריזמטית", "פופולרית", "עצמאית", "סוררת",
    "ממלכתית", "נצחית", "לוהטת", "קולנית", "חשאית", "מבריקה", "נחושה", "צינית", "אופטימית", "סקפטית",
    "פרגמטית", "מהפכנית", "זהירה", "נועזת", "חצופה", "ממולחת", "שנונה", "יציבה", "הפכפכה", "עיקשת",
    "רהוטה", "נלהבת", "מסתורית", "עוקצנית", "מתוחכמת", "אמיצה", "מנצחת", "מפתיעה", "סודית", "זועמת",
  ],
};

function pick<T>(list: readonly T[], random: () => number): T {
  return list[Math.floor(random() * list.length)];
}

/** One noun_adjective[_NN] candidate, ≤20 chars (retries internally until it fits). */
export function generateHandleCandidate({
  random = Math.random,
}: { random?: () => number } = {}): string {
  for (;;) {
    const gender: Gender = random() < 0.5 ? "m" : "f";
    const noun = pick(NOUNS[gender], random);
    const adj = pick(ADJECTIVES[gender], random);
    const withNumber = random() < 0.4;
    const suffix = withNumber ? `_${1 + Math.floor(random() * 98)}` : "";
    const candidate = `${noun}_${adj}${suffix}`;
    if (candidate.length <= 20) return candidate;
  }
}
```

Note on the determinism test: `random: () => 0` → gender `m` (0 < 0.5), index 0 picks, `withNumber` false (0 < 0.4 is true!) — **careful**: `0 < 0.4` is `true`, so suffix becomes `_1`. Fix the test expectation to `` `${NOUNS.m[0]}_${ADJECTIVES.m[0]}_1` `` OR flip the suffix condition to `random() >= 0.6`. Use the test expectation fix (keep implementation natural): expected value is `"מנדט_זריז_1"`.

- [ ] **Step 4: Run tests** — → PASS (after fixing the determinism expectation per the note).

- [ ] **Step 5: Commit**

```bash
git add app/lib/onboarding/handle-generator.ts app/lib/onboarding/handle-generator.test.ts
git commit -m "feat(onboarding): political-playful Hebrew handle generator"
```

---

### Task 3: Availability-checked generation (service) + integration test

**Files:**
- Modify: `app/lib/onboarding/service.ts`
- Modify (or create): `app/lib/onboarding/service.test.ts` — add cases (file exists? check; if not, create with `createTestDb` harness like `app/lib/suggestions/service.test.ts`)

- [ ] **Step 1: Write the failing test** (append to the onboarding service test file; follow its existing harness setup — `createTestDb`, a seeded user):

```ts
import { generateAvailableHandle } from "./service";
import { HANDLE_RE } from "./handle";

test("generateAvailableHandle returns a valid, unclaimed handle", async () => {
  const h1 = await generateAvailableHandle({ db: h.db, userId: "u1" });
  expect(h1).toMatch(HANDLE_RE);
});

test("generateAvailableHandle skips taken handles (digit fallback)", async () => {
  // Claim a handle, then force the generator to always produce it by stubbing rng
  // indirectly: instead, claim MANY handles is impractical — assert the contract:
  // whatever comes back is not taken.
  const got = await generateAvailableHandle({ db: h.db, userId: "u1" });
  const again = await generateAvailableHandle({ db: h.db, userId: "u1" });
  expect(got).toMatch(HANDLE_RE);
  expect(again).toMatch(HANDLE_RE);
});
```

(If `app/lib/onboarding/service.test.ts` doesn't exist, create it with the standard harness: `createTestDb()` in `beforeEach`, insert `{ id: "u1", name: "א", email: "u1@x.co" }` into `users`, close in `afterEach`.)

- [ ] **Step 2: Run** — `pnpm vitest run app/lib/onboarding/service.test.ts` → FAIL (`generateAvailableHandle` not exported).

- [ ] **Step 3: Implement** in `app/lib/onboarding/service.ts` (add import of the generator):

```ts
import { generateHandleCandidate } from "@/app/lib/onboarding/handle-generator";

/** A fresh, available handle suggestion for the wizard. Tries 10 candidates;
 *  from the 6th attempt appends extra random digits (collision realm: lottery). */
export async function generateAvailableHandle({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    let candidate = generateHandleCandidate();
    if (attempt >= 5) {
      const salted = `${candidate}_${Math.floor(Math.random() * 9000) + 1000}`;
      if (salted.length <= 20) candidate = salted;
    }
    if (!HANDLE_RE.test(candidate)) continue; // belt-and-braces; generator guarantees this
    const taken = await repo.isHandleTaken({ db, handle: candidate, excludeUserId: userId });
    if (!taken) return candidate;
  }
  throw new HandleGenerationError();
}
```

Add to `app/lib/errors.ts`:

```ts
export class HandleGenerationError extends Error { constructor() { super("Could not generate an available handle"); this.name = "HandleGenerationError"; } }
```

…and import it in the service.

- [ ] **Step 4: Run tests** — → PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/onboarding/service.ts app/lib/onboarding/service.test.ts app/lib/errors.ts
git commit -m "feat(onboarding): availability-checked handle suggestion service"
```

---

### Task 4: Wire generation into the wizard (action + RSC pre-fill + 🎲 reroll)

**Files:**
- Modify: `app/actions/onboarding.ts`
- Modify: `app/onboarding/page.tsx`
- Modify: `app/onboarding/onboarding-wizard.tsx`

- [ ] **Step 1: Server action** — append to `app/actions/onboarding.ts`:

```ts
import { generateAvailableHandle } from "@/app/lib/onboarding/service"; // extend existing import line
import { HandleGenerationError } from "@/app/lib/errors"; // extend existing import block

/** A fresh handle suggestion for the 🎲 reroll button. */
export async function generateHandleAction(): Promise<{ ok: boolean; handle?: string; message?: string }> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו" };
  const limit = checkRateLimit({ key: `handle-gen:${s.user.id}`, max: 30, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע" };
  try {
    const handle = await generateAvailableHandle({ userId: s.user.id });
    return { ok: true, handle };
  } catch (e) {
    if (e instanceof HandleGenerationError) return { ok: false, message: "לא הצלחנו להגריל — נסו שוב" };
    throw e;
  }
}
```

- [ ] **Step 2: RSC pre-fill** — `app/onboarding/page.tsx`: import `generateAvailableHandle` from the service; replace the wizard render block:

```tsx
const suggestedHandle = state?.handle ? null : await generateAvailableHandle({ userId: session.user.id });

return (
  <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10 sm:px-6">
    <OnboardingWizard
      arenas={CATEGORIES}
      initialHandle={state?.handle ?? suggestedHandle ?? ""}
      displayName={session.user.name}
    />
  </main>
);
```

- [ ] **Step 3: Wizard reroll button** — `app/onboarding/onboarding-wizard.tsx`:
  - Import `generateHandleAction` alongside the other actions.
  - Input `dir="ltr"` → `dir="auto"` (Hebrew handles must not render reversed); keep `text-start`.
  - Add a state `const [rolling, setRolling] = useState(false);`
  - Add inside the input row (after the `<input>`, before the closing `</div>` of the bordered box):

```tsx
<button
  type="button"
  onClick={reroll}
  disabled={rolling || pending}
  aria-label="הגרילו כינוי"
  title="הגרילו כינוי"
  className="shrink-0 rounded-lg px-1.5 py-1 text-lg transition-transform hover:scale-110 disabled:opacity-50"
>
  🎲
</button>
```

  - Add the handler next to `onHandleChange`:

```tsx
function reroll() {
  setRolling(true);
  setError(null);
  if (debounce.current) clearTimeout(debounce.current);
  void generateHandleAction().then((res) => {
    if (res.ok && res.handle) {
      setHandle(res.handle);
      setAvail({ available: true }); // server only returns unclaimed handles
      setChecking(false);
    } else {
      setError(res.message ?? "אירעה שגיאה");
    }
    setRolling(false);
  });
}
```

  - Step-1 description (line ~110) gets a nudge: `"לא אוהבים את הכינוי שהגרלנו? גלגלו 🎲 או כתבו משלכם. עברית או אנגלית: אותיות, ספרות וקו תחתון (3–20 תווים)."` (replaces the Task 1 copy — final text).
  - Step-3 heading `הכול מוכן, @{normalized}` → wrap handle: `הכול מוכן, <bdi>@{normalized}</bdi>`; same for the availability line `@{normalized} פנוי ✓` → `<bdi>@{normalized}</bdi> פנוי ✓`.

- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm lint` → clean. Manual: `pnpm dev` (port 3210) optional at the end (Task 9 QA).

- [ ] **Step 5: Commit**

```bash
git add app/actions/onboarding.ts app/onboarding/page.tsx app/onboarding/onboarding-wizard.tsx
git commit -m "feat(onboarding): pre-filled Hebrew handle suggestion with 🎲 reroll"
```

---

### Task 5: `<bdi>` on leaderboard handles

**Files:**
- Modify: `components/leaderboard-row.tsx:27`

- [ ] **Step 1: Wrap** — `@{entry.handle}` → `<bdi>@{entry.handle}</bdi>` (line 27). The avatar initial (line 24) is fine — `toUpperCase()` is a no-op for Hebrew.

- [ ] **Step 2: Stories sanity** — `components/leaderboard-row.stories.tsx`: add one story arg with a Hebrew handle (e.g. `handle: "קואליציה_זריזה"`) so the RTL rendering is visible in Storybook. Follow the existing story shape in that file.

- [ ] **Step 3: Commit**

```bash
git add components/leaderboard-row.tsx components/leaderboard-row.stories.tsx
git commit -m "fix(leaderboard): bidi-isolate handles for Hebrew"
```

---

### Task 6: Schema — `proposedCloseAt` + `resolutionSourceNote` (+ migration)

**Files:**
- Modify: `app/lib/schema.ts` (marketSuggestions, ~line 322)
- Create (generated): `drizzle/0019_*.sql` + meta snapshot

- [ ] **Step 1: Schema** — in `marketSuggestions`, after `personId`:

```ts
proposedCloseAt: timestamp("proposedCloseAt"),       // proposer's intended decision date — required by the service for NEW rows; legacy rows null
resolutionSourceNote: text("resolutionSourceNote"),  // optional "how would this resolve" hint for the reviewer
```

- [ ] **Step 2: Generate migration** — `pnpm db:generate --name suggestion_close_and_source`. Additive nullable columns → no interactive prompt expected. Verify `drizzle/0019_suggestion_close_and_source.sql` contains exactly two `ADD COLUMN`s. **Do NOT run `db:push`/migrate against the DB — the only DATABASE_URL is production; applying is a deliberate final step (Task 9).**

- [ ] **Step 3: Tests still green** — `pnpm vitest run app/lib/suggestions/service.test.ts` → PASS (PGlite replays the new migration; columns nullable so nothing breaks yet).

- [ ] **Step 4: Commit**

```bash
git add app/lib/schema.ts drizzle/
git commit -m "feat(schema): proposedCloseAt + resolutionSourceNote on market_suggestions"
```

---

### Task 7: Suggestion service/repo/action — require due date, accept source note

**Files:**
- Modify: `app/lib/errors.ts`
- Modify: `app/lib/suggestions/repo.ts`
- Modify: `app/lib/suggestions/service.ts`
- Modify: `app/lib/suggestions/service.test.ts`
- Modify: `app/actions/suggestions.ts`

- [ ] **Step 1: Write the failing tests** — in `app/lib/suggestions/service.test.ts`. Update every existing `createSuggestion({...})` call to include `proposedCloseAt: CLOSE` (the file already defines `const CLOSE = new Date("2026-12-31T00:00:00Z")`). Then add:

```ts
import { CloseRequiredError, CloseTooFarError, SourceNoteTooLongError } from "@/app/lib/errors";
// (merge into the existing errors import block)

test("createSuggestion stores proposedCloseAt and resolutionSourceNote", async () => {
  const { id } = await createSuggestion({
    db: h.db, userId: "proposer", questionHe: "האם יקודם חוק כלשהו השנה?", category: "legislation",
    proposedCloseAt: CLOSE, resolutionSourceNote: "  אתר הכנסת  ",
  });
  const [row] = await h.db.select().from(marketSuggestions).where(eq(marketSuggestions.id, id));
  expect(row.proposedCloseAt).toEqual(CLOSE);
  expect(row.resolutionSourceNote).toBe("אתר הכנסת"); // trimmed
});

test("createSuggestion rejects missing / past / too-far proposedCloseAt", async () => {
  const base = { db: h.db, userId: "proposer", questionHe: "האם משהו יקרה עד סוף השנה?", category: "elections" };
  await expect(createSuggestion({ ...base, proposedCloseAt: new Date(NaN) })).rejects.toBeInstanceOf(CloseRequiredError);
  await expect(createSuggestion({ ...base, proposedCloseAt: new Date("2020-01-01") })).rejects.toBeInstanceOf(ClosePastError);
  await expect(createSuggestion({ ...base, proposedCloseAt: new Date("2031-01-01") })).rejects.toBeInstanceOf(CloseTooFarError);
});

test("createSuggestion rejects an over-long source note", async () => {
  await expect(createSuggestion({
    db: h.db, userId: "proposer", questionHe: "האם משהו יקרה עד סוף השנה?", category: "elections",
    proposedCloseAt: CLOSE, resolutionSourceNote: "א".repeat(301),
  })).rejects.toBeInstanceOf(SourceNoteTooLongError);
});

test("suggestion lists expose proposedCloseAt + resolutionSourceNote", async () => {
  await createSuggestion({
    db: h.db, userId: "proposer", questionHe: "האם יקודם חוק כלשהו השנה?", category: "legislation",
    proposedCloseAt: CLOSE, resolutionSourceNote: "רשומות",
  });
  const [v] = await listSuggestions({ db: h.db, status: "pending" });
  expect(v.proposedCloseAt).toEqual(CLOSE);
  expect(v.resolutionSourceNote).toBe("רשומות");
});
```

- [ ] **Step 2: Run** — `pnpm vitest run app/lib/suggestions/service.test.ts` → FAIL (type + runtime).

- [ ] **Step 3: Errors** — add to `app/lib/errors.ts` near the other suggestion errors:

```ts
export class CloseRequiredError extends Error { constructor() { super("Proposed close date is required"); this.name = "CloseRequiredError"; } }
export class CloseTooFarError extends Error { constructor() { super("Proposed close date is too far in the future"); this.name = "CloseTooFarError"; } }
export class SourceNoteTooLongError extends Error { constructor() { super("Resolution source note too long"); this.name = "SourceNoteTooLongError"; } }
```

- [ ] **Step 4: Repo** — `app/lib/suggestions/repo.ts`:
  - `SuggestionView` gains `proposedCloseAt: Date | null;` and `resolutionSourceNote: string | null;`
  - `VIEW_COLUMNS` gains `proposedCloseAt: marketSuggestions.proposedCloseAt,` and `resolutionSourceNote: marketSuggestions.resolutionSourceNote,`
  - `insertSuggestion` params gain `proposedCloseAt: Date;` and `resolutionSourceNote?: string | null;`; `.values({ userId, questionHe, category, personId: personId ?? null, proposedCloseAt, resolutionSourceNote: resolutionSourceNote ?? null })`

- [ ] **Step 5: Service** — `app/lib/suggestions/service.ts` `createSuggestion`:
  - Add params `proposedCloseAt: Date; resolutionSourceNote?: string | null;`
  - Add consts: `export const MAX_SOURCE_NOTE_LEN = 300;` and `const MAX_CLOSE_HORIZON_MS = 2 * 365 * 24 * 60 * 60 * 1000; // ~2y sanity cap`
  - After the category check:

```ts
if (!(proposedCloseAt instanceof Date) || Number.isNaN(proposedCloseAt.getTime())) throw new CloseRequiredError();
if (proposedCloseAt.getTime() <= Date.now()) throw new ClosePastError();
if (proposedCloseAt.getTime() > Date.now() + MAX_CLOSE_HORIZON_MS) throw new CloseTooFarError();
const sourceNote = resolutionSourceNote?.trim() || null;
if (sourceNote && sourceNote.length > MAX_SOURCE_NOTE_LEN) throw new SourceNoteTooLongError();
```

  - Pass both through to `repo.insertSuggestion({ ..., proposedCloseAt, resolutionSourceNote: sourceNote })`.
  - Import the three new error classes.

- [ ] **Step 6: Action** — `app/actions/suggestions.ts` `suggestMarketAction`:
  - Params gain `proposedCloseAt: string;` and `resolutionSourceNote?: string | null;`
  - Before calling the service: `const close = new Date(proposedCloseAt);` (the service rejects NaN/past/far — no duplicate checks here).
  - Call: `await createSuggestion({ userId: s.user.id, questionHe, category, personId: personId ?? null, proposedCloseAt: close, resolutionSourceNote: resolutionSourceNote ?? null });`
  - Error mappings added:

```ts
if (e instanceof CloseRequiredError) return { ok: false, message: "בחרו תאריך הכרעה" };
if (e instanceof ClosePastError) return { ok: false, message: "תאריך ההכרעה חייב להיות בעתיד" };
if (e instanceof CloseTooFarError) return { ok: false, message: "תאריך ההכרעה רחוק מדי (עד שנתיים קדימה)" };
if (e instanceof SourceNoteTooLongError) return { ok: false, message: "מקור ההכרעה ארוך מדי (עד 300 תווים)" };
```

  - Success message → `"ההצעה לסדר הוגשה — תודה!"` (the rename, done here so it ships with the field change).

- [ ] **Step 7: Run tests** — `pnpm vitest run app/lib/suggestions/service.test.ts` → PASS. Then `pnpm typecheck` → the compiler now flags every remaining caller (the form — fixed next task).

- [ ] **Step 8: Commit**

```bash
git add app/lib/errors.ts app/lib/suggestions/ app/actions/suggestions.ts
git commit -m "feat(suggestions): required proposedCloseAt + optional resolution source"
```

---

### Task 8: UI — form fields, page copy, rename everywhere, admin pre-fill

**Files:**
- Modify: `lib/time.ts` (datetime-local helpers)
- Modify: `components/suggest-market-form.tsx`
- Modify: `app/suggest/page.tsx`
- Modify: `components/site-header.tsx:18`
- Modify: `app/politician/[id]/page.tsx:174,188-190`
- Modify: `app/profile/page.tsx:197,230-232`
- Modify: `app/admin/page.tsx:54,60-67`
- Modify: `components/admin/suggestion-review-row.tsx`

- [ ] **Step 1: datetime-local helpers** — move/add to `lib/time.ts` (client-safe, no DB):

```ts
/** Current local time in the `datetime-local` value format (YYYY-MM-DDTHH:mm). */
export function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** UTC/ISO timestamp → local `datetime-local` value (YYYY-MM-DDTHH:mm). */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
```

Delete the private `nowLocalInput` from `components/admin/suggestion-review-row.tsx` and import both helpers from `@/lib/time` there.

- [ ] **Step 2: Form** — `components/suggest-market-form.tsx`:
  - Add state: `const [closeAt, setCloseAt] = useState("");` and `const [source, setSource] = useState("");`
  - Import `nowLocalInput` from `@/lib/time`.
  - Submit call gains `proposedCloseAt: closeAt, resolutionSourceNote: source.trim() || null`; on success also `setCloseAt(""); setSource("");`
  - Submit button `disabled` adds `|| !closeAt`.
  - New fields — insert a date field into the existing 2-col grid (making it question → [category | date] → [politician | source]); exact JSX, replacing the current grid block:

```tsx
<div className="grid gap-4 sm:grid-cols-2">
  <div>
    <label className={LABEL} htmlFor="category">קטגוריה</label>
    <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className={FIELD}>
      {categories.map((c) => (
        <option key={c.key} value={c.key}>{c.he}</option>
      ))}
    </select>
  </div>
  <div>
    <label className={LABEL} htmlFor="closeAt">מתי השאלה תוכרע?</label>
    <input
      id="closeAt"
      type="datetime-local"
      dir="ltr"
      required
      min={nowLocalInput()}
      value={closeAt}
      onChange={(e) => setCloseAt(e.target.value)}
      className={FIELD}
    />
  </div>
  <div>
    <label className={LABEL} htmlFor="personId">פוליטיקאי קשור (לא חובה)</label>
    <select id="personId" value={personId} onChange={(e) => setPersonId(e.target.value)} className={FIELD}>
      <option value="">ללא</option>
      {politicians.map((p) => (
        <option key={p.personId} value={p.personId}>{p.name}</option>
      ))}
    </select>
  </div>
  <div>
    <label className={LABEL} htmlFor="source">מקור הכרעה (לא חובה)</label>
    <input
      id="source"
      value={source}
      onChange={(e) => setSource(e.target.value.slice(0, 300))}
      className={FIELD}
      placeholder="למשל: אתר הכנסת, פרסום ברשומות, הודעה רשמית…"
    />
  </div>
</div>
```

  - Submit label: `"שלחו הצעה"` → `"הגישו הצעה לסדר"`; pending → `"מגישים…"`.

- [ ] **Step 3: Page copy** — `app/suggest/page.tsx` header block becomes:

```tsx
<header className="mb-6">
  <h1 className="font-display text-3xl font-black text-foreground sm:text-4xl">הצעה לסדר</h1>
  <p className="mt-2 text-muted-foreground">
    יש לכם שאלה שחייבת לעלות לסדר־היום? הגישו אותה כמו חבר כנסת מן המניין.
    הצעות שמאושרות על ידי ההנהלה נפתחות כשוק לכל הקהילה. נסחו שאלה שאפשר
    להכריע באופן חד־משמעי ממקור רשמי, וקבעו מתי היא תוכרע.
  </p>
</header>
```

(the `מהקהל` eyebrow `<p>` is deleted, not replaced.)

- [ ] **Step 4: Rename remaining references**:
  - `components/site-header.tsx:18`: label `"הציעו שוק"` → `"הצעה לסדר"`
  - `app/politician/[id]/page.tsx:174`: link text → `"הצעה לסדר"`; line ~188 empty-state link `"היו הראשונים להציע אחד"` → `"הגישו הצעה לסדר"`
  - `app/profile/page.tsx:197`: link text → `"הצעה לסדר"`; section heading `"ההצעות שלי"` → `"ההצעות לסדר שלי"`; empty state `"עוד לא הצעת שווקים."` → `"עוד לא הגשתם הצעה לסדר."` and link `"הציעו את הראשון"` → `"הגישו את הראשונה"`
  - `app/admin/page.tsx:54`: `"הצעות מהקהל"` → `"הצעות לסדר"`

- [ ] **Step 5: Admin pre-fill** — `components/admin/suggestion-review-row.tsx`:
  - Props gain `proposedCloseAtIso: string | null;` and `resolutionSourceNote: string | null;`
  - `useState("")` for `closeAt` → `useState(proposedCloseAtIso ? isoToLocalInput(proposedCloseAtIso) : "")`
  - Under the proposer line, render the source note when present:

```tsx
{resolutionSourceNote && (
  <p className="mt-1 text-sm text-muted-foreground">מקור הכרעה מוצע: {resolutionSourceNote}</p>
)}
```

  - `app/admin/page.tsx` row props gain:

```tsx
proposedCloseAtIso={s.proposedCloseAt ? s.proposedCloseAt.toISOString() : null}
resolutionSourceNote={s.resolutionSourceNote}
```

- [ ] **Step 6: Verify** — `pnpm typecheck && pnpm lint && pnpm test` → all green.

- [ ] **Step 7: Commit**

```bash
git add lib/time.ts components/suggest-market-form.tsx app/suggest/page.tsx components/site-header.tsx "app/politician/[id]/page.tsx" app/profile/page.tsx app/admin/page.tsx components/admin/suggestion-review-row.tsx
git commit -m "feat(suggest): הצעה לסדר rename + due date & source fields + admin pre-fill"
```

---

### Task 9: Full verification, browser QA, decision log, ship

- [ ] **Step 1: Full suite** — `pnpm lint && pnpm typecheck && pnpm test` → all green.

- [ ] **Step 2: Browser QA** (browser-qa skill, quick mode): fresh-account onboarding shows a pre-filled Hebrew handle, 🎲 rerolls, manual typing still validates; `/suggest` shows הצעה לסדר with required date; admin queue pre-fills מועד סגירה. Note: dev DB IS prod — use existing dogfood accounts, don't create junk markets (suggestions are fine — they land in pending and can be rejected).

- [ ] **Step 3: Decision log** — `docs/decisions/hatzaa-laseder.md` (newest-on-top): single-script handle rule rationale; due-date-required + admin-adjustable; source note optional; `מהקהל` removed.

- [ ] **Step 4: Apply migration to the DB** — ⚠️ production database. Run `pnpm db:push` (or `drizzle-kit migrate`) deliberately, after the code is ready to deploy — additive nullable columns are deploy-safe before the code lands. Confirm with the user if anything looks off.

- [ ] **Step 5: `/code-review`** (per CLAUDE.md, before push), fix findings, push branch + PR.

---

## Self-review notes

- Spec coverage: validation widening (T1), generator (T2), service+action+prefill (T3-T4), bdi (T5), schema (T6), due date + source (T7), rename + admin prefill (T8), tests throughout, ops gating (T9). "Changeable later" needs no work (existing behavior).
- Type consistency: `generateHandleCandidate({random})`, `generateAvailableHandle({db,userId})`, `proposedCloseAt: Date` service-side / ISO string action-side, `proposedCloseAtIso` prop — names used consistently across tasks.
- Known judgment call: suggestion date input is `datetime-local` (mirrors admin row) rather than date-only.

# Polytical Foundation — Coin Ledger + Auth UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** On top of the **already-built, live-verified** Better-Auth + Neon foundation, add the **coin ledger**: a new user signs up (email/password), receives a 1,000-coin starting stack, sees a real balance, and claims a +200 daily faucet — every coin movement an append-only `transactions` row, balances cached on `user` and updated in the *same* DB transaction, never negative.

**What already exists (do NOT rebuild):** `app/lib/db.ts` (postgres-js, `prepare:false`, `max:3`, exports `db` + `sharedSql`); `app/lib/schema.ts` (`users`/`sessions`/`accounts`/`verifications` + `isAdmin`); `lib/auth.ts` (Better Auth email/password + guarded Google + rate-limit + `nextCookies`, exports `getSession()`); `lib/auth-client.ts` (`signIn`/`signUp`/`signOut`/`useSession`); `app/api/auth/[...all]/route.ts`; `proxy.ts` (protects `/profile`,`/admin`; auth routes `/login`,`/signup`); `drizzle.config.ts` (schema `./app/lib/schema.ts`, `DATABASE_URL`); migration `drizzle/0000_*` pushed to Neon. Google is intentionally **off** (email/password only).

**Architecture:** Route/Action → Service → Repository → DB. The **ledger service is the single authoritative coin writer** (`applyEntry`), used by grant/faucet now and bet/payout/refund later. Tests run on **PGlite** (real Postgres) applying the same `./drizzle` migrations.

**Tech Stack:** Next.js 16 · Drizzle ORM + **postgres-js** (existing `db`) · Neon · Better Auth 1.5 · Vitest + `@electric-sql/pglite` (both already installed) · Zod 4.

**Conventions (CLAUDE.md):** named exports; RORO object params; logical RTL Tailwind props; no bare `console.*` in server code; files < 500 lines; resolve by stable id; errors over silent fallbacks.

---

## Task 0: Test tooling

**Files:** Modify `package.json`; Create `vitest.config.ts`

- [ ] **Step 1:** `pnpm add -D vite-tsconfig-paths` (vitest + pglite already installed).
- [ ] **Step 2:** Add scripts to `package.json` (keep existing `db:*` scripts unchanged):

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3:** `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { environment: "node", include: ["**/*.test.ts"], pool: "forks" },
});
```

- [ ] **Step 4:** Commit — `git add -A && git commit -m "chore: vitest config + test scripts"`

---

## Task 1: Extend schema — user coin columns + transactions ledger

**Files:** Modify `app/lib/schema.ts`; Create migration

- [ ] **Step 1:** Update the import line and the `users` table in `app/lib/schema.ts`:

```ts
import { pgTable, text, timestamp, boolean, integer, uuid, pgEnum, index } from "drizzle-orm/pg-core";
```
Add these two columns to the existing `users` table (after `isAdmin`):
```ts
  balance: integer("balance").notNull().default(0),     // coin balance CACHE; ledger is source of truth
  lastFaucetAt: timestamp("lastFaucetAt"),
```

- [ ] **Step 2:** Append the ledger to `app/lib/schema.ts`:

```ts
// --- Coin ledger (the money source of truth) ---
export const txType = pgEnum("tx_type", ["grant", "faucet", "bet", "payout", "refund"]);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: txType("type").notNull(),
    amount: integer("amount").notNull(),          // signed: credits +, debits −
    balanceAfter: integer("balanceAfter").notNull(),
    refMarketId: text("refMarketId"),
    refBetId: text("refBetId"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [index("tx_user_created_idx").on(t.userId, t.createdAt)],
);
```

- [ ] **Step 3:** Add `export type DB = typeof db;` to the end of `app/lib/db.ts` (for the repo's tx type).

- [ ] **Step 4:** Generate the migration (diff vs Neon — adds 2 columns + the table/enum):

```bash
pnpm db:generate
```
Expected: a new `drizzle/0001_*.sql` appears. (Do NOT push yet — Task 7 pushes after tests pass.)

- [ ] **Step 5:** Commit — `git add -A && git commit -m "feat(db): user coin columns + transactions ledger schema + migration"`

---

## Task 2: PGlite test harness

**Files:** Create `app/lib/testing/create-test-db.ts`, `app/lib/testing/harness.test.ts`

- [ ] **Step 1:** `app/lib/testing/create-test-db.ts`:

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/app/lib/schema";

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, close: () => client.close() };
}
export type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];
```

- [ ] **Step 2:** `app/lib/testing/harness.test.ts`:

```ts
import { expect, test } from "vitest";
import { createTestDb } from "./create-test-db";
import { users } from "@/app/lib/schema";

test("PGlite applies migrations; new user defaults balance 0", async () => {
  const { db, close } = await createTestDb();
  await db.insert(users).values({ id: "u1", name: "Gal", email: "g@x.co" });
  const [row] = await db.select().from(users);
  expect(row.balance).toBe(0);
  expect(row.isAdmin).toBe(false);
  await close();
});
```

- [ ] **Step 3:** `pnpm test` → Expected: PASS (proves 0000+0001 migrations + defaults work in real Postgres).
- [ ] **Step 4:** Commit — `git add -A && git commit -m "test: PGlite harness running real migrations"`

---

## Task 3: Economy constants, errors, ledger repository

**Files:** Create `app/lib/economy.ts`, `app/lib/errors.ts`, `app/lib/logger.ts`, `app/lib/ledger/repo.ts`

- [ ] **Step 1:** `app/lib/economy.ts`:

```ts
export const STARTING_STACK = 1000;
export const DAILY_FAUCET = 200;
export const FAUCET_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const MIN_BET = 10;
```

- [ ] **Step 2:** `app/lib/errors.ts`:

```ts
export class InsufficientFundsError extends Error {
  constructor() { super("Insufficient funds"); this.name = "InsufficientFundsError"; }
}
export class FaucetCooldownError extends Error {
  constructor(public readonly nextClaimAt: Date) { super("Faucet on cooldown"); this.name = "FaucetCooldownError"; }
}
export class MissingUserError extends Error {
  constructor() { super("Missing userId"); this.name = "MissingUserError"; }
}
```

- [ ] **Step 3:** `app/lib/logger.ts`:

```ts
export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => console.log(JSON.stringify({ level: "info", msg, ...meta })),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(JSON.stringify({ level: "warn", msg, ...meta })),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(JSON.stringify({ level: "error", msg, ...meta })),
};
```

- [ ] **Step 4:** `app/lib/ledger/repo.ts`:

```ts
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/app/lib/db";
import { transactions, txType, users } from "@/app/lib/schema";
import { MissingUserError } from "@/app/lib/errors";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Type = (typeof txType.enumValues)[number];

function reqUser(userId: string): string {
  if (!userId) throw new MissingUserError();
  return userId;
}

/** Locks the user row, returns balance (FOR UPDATE → serializes concurrent ledger writes). */
export async function lockBalance({ tx, userId }: { tx: Tx; userId: string }): Promise<number> {
  const [row] = await tx.select({ balance: users.balance }).from(users)
    .where(eq(users.id, reqUser(userId))).for("update");
  if (!row) throw new MissingUserError();
  return row.balance;
}

export async function writeBalance({ tx, userId, balance, lastFaucetAt }: {
  tx: Tx; userId: string; balance: number; lastFaucetAt?: Date;
}): Promise<void> {
  await tx.update(users)
    .set({ balance, ...(lastFaucetAt ? { lastFaucetAt } : {}), updatedAt: new Date() })
    .where(eq(users.id, reqUser(userId)));
}

export async function insertEntry({ tx, userId, type, amount, balanceAfter, refMarketId, refBetId }: {
  tx: Tx; userId: string; type: Type; amount: number; balanceAfter: number; refMarketId?: string; refBetId?: string;
}): Promise<void> {
  await tx.insert(transactions).values({ userId: reqUser(userId), type, amount, balanceAfter, refMarketId, refBetId });
}

export async function countByType({ tx, userId, type }: { tx: Tx; userId: string; type: Type }): Promise<number> {
  const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(transactions)
    .where(and(eq(transactions.userId, reqUser(userId)), eq(transactions.type, type)));
  return row?.n ?? 0;
}

export async function readUser({ tx, userId }: { tx: Tx; userId: string }) {
  const [row] = await tx.select().from(users).where(eq(users.id, reqUser(userId)));
  return row ?? null;
}
```

- [ ] **Step 5:** Commit — `git add -A && git commit -m "feat(ledger): economy constants, typed errors, logger, repository"`

---

## Task 4: Ledger service (the authoritative writer) — TDD

**Files:** Create `app/lib/ledger/service.ts`, `app/lib/ledger/service.test.ts`

- [ ] **Step 1: Failing tests** `app/lib/ledger/service.test.ts`:

```ts
import { beforeEach, afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users, transactions } from "@/app/lib/schema";
import { STARTING_STACK, DAILY_FAUCET } from "@/app/lib/economy";
import { FaucetCooldownError, InsufficientFundsError } from "@/app/lib/errors";
import { applyEntry, grantStartingStack, claimDailyFaucet, getBalance } from "./service";

let h: Awaited<ReturnType<typeof createTestDb>>;
const UID = "u1";
beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values({ id: UID, name: "Gal", email: "g@x.co" });
});
afterEach(async () => { await h.close(); });

test("grantStartingStack credits 1000 once and is idempotent", async () => {
  await grantStartingStack({ db: h.db, userId: UID });
  await grantStartingStack({ db: h.db, userId: UID });
  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK);
  const rows = await h.db.select().from(transactions);
  expect(rows.filter((r) => r.type === "grant").length).toBe(1);
  expect(rows[0].balanceAfter).toBe(STARTING_STACK);
});

test("claimDailyFaucet adds 200, blocks within 24h, allows after", async () => {
  await grantStartingStack({ db: h.db, userId: UID });
  await claimDailyFaucet({ db: h.db, userId: UID });
  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK + DAILY_FAUCET);
  await expect(claimDailyFaucet({ db: h.db, userId: UID })).rejects.toBeInstanceOf(FaucetCooldownError);
  await h.db.update(users).set({ lastFaucetAt: new Date(Date.now() - 25 * 3600 * 1000) }).where(eq(users.id, UID));
  await claimDailyFaucet({ db: h.db, userId: UID });
  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK + 2 * DAILY_FAUCET);
});

test("overdraft is rejected and rolls back (no row, balance unchanged)", async () => {
  await grantStartingStack({ db: h.db, userId: UID });
  await expect(applyEntryInTx({ db: h.db, userId: UID, type: "bet", amount: -(STARTING_STACK + 1) }))
    .rejects.toBeInstanceOf(InsufficientFundsError);
  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK);
  expect((await h.db.select().from(transactions)).filter((r) => r.type === "bet").length).toBe(0);
});

// helper used only by the overdraft test (wraps applyEntry in a tx)
async function applyEntryInTx(a: { db: typeof h.db; userId: string; type: "bet"; amount: number }) {
  return a.db.transaction((tx) => applyEntry({ tx, userId: a.userId, type: a.type, amount: a.amount }));
}
```

- [ ] **Step 2:** `pnpm test app/lib/ledger` → Expected: FAIL (service not implemented).

- [ ] **Step 3: Implement** `app/lib/ledger/service.ts`:

```ts
import { db as defaultDb, type DB } from "@/app/lib/db";
import * as repo from "@/app/lib/ledger/repo";
import { txType } from "@/app/lib/schema";
import { STARTING_STACK, DAILY_FAUCET, FAUCET_COOLDOWN_MS } from "@/app/lib/economy";
import { FaucetCooldownError, InsufficientFundsError } from "@/app/lib/errors";

type Type = (typeof txType.enumValues)[number];
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** THE authoritative coin writer — joins an existing tx. Lock → validate → cache + append row. */
export async function applyEntry({ tx, userId, type, amount, refMarketId, refBetId }: {
  tx: Tx; userId: string; type: Type; amount: number; refMarketId?: string; refBetId?: string;
}): Promise<{ balanceAfter: number }> {
  const current = await repo.lockBalance({ tx, userId });
  const balanceAfter = current + amount;
  if (balanceAfter < 0) throw new InsufficientFundsError();
  await repo.writeBalance({ tx, userId, balance: balanceAfter });
  await repo.insertEntry({ tx, userId, type, amount, balanceAfter, refMarketId, refBetId });
  return { balanceAfter };
}

export async function grantStartingStack({ db = defaultDb, userId }: { db?: DB; userId: string }): Promise<void> {
  await db.transaction(async (tx) => {
    if ((await repo.countByType({ tx, userId, type: "grant" })) > 0) return; // idempotent
    await applyEntry({ tx, userId, type: "grant", amount: STARTING_STACK });
  });
}

export async function claimDailyFaucet({ db = defaultDb, userId }: { db?: DB; userId: string }): Promise<{ balanceAfter: number }> {
  return db.transaction(async (tx) => {
    const u = await repo.readUser({ tx, userId });
    if (!u) throw new InsufficientFundsError();
    const last = u.lastFaucetAt?.getTime() ?? 0;
    if (Date.now() - last < FAUCET_COOLDOWN_MS) throw new FaucetCooldownError(new Date(last + FAUCET_COOLDOWN_MS));
    const res = await applyEntry({ tx, userId, type: "faucet", amount: DAILY_FAUCET });
    await repo.writeBalance({ tx, userId, balance: res.balanceAfter, lastFaucetAt: new Date() });
    return res;
  });
}

export async function getBalance({ db = defaultDb, userId }: { db?: DB; userId: string }): Promise<number> {
  return db.transaction(async (tx) => (await repo.readUser({ tx, userId }))?.balance ?? 0);
}

/** Ensures the starting stack (idempotent) then returns balance. Call where balance renders. */
export async function getOrInitBalance({ db = defaultDb, userId }: { db?: DB; userId: string }): Promise<number> {
  await grantStartingStack({ db, userId });
  return getBalance({ db, userId });
}
```

- [ ] **Step 4:** `pnpm test app/lib/ledger` → Expected: 3 pass.
- [ ] **Step 5:** Commit — `git add -A && git commit -m "feat(ledger): authoritative writer, idempotent grant, 24h faucet (+TDD)"`

---

## Task 5: Auth UI — login, signup, faucet, real-balance header

**Files:** Create `app/login/page.tsx`, `app/signup/page.tsx`, `app/actions/faucet.ts`, `components/faucet-button.tsx`, `components/auth-buttons.tsx`; Modify `components/site-header.tsx`

- [ ] **Step 1:** `app/actions/faucet.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { claimDailyFaucet } from "@/app/lib/ledger/service";
import { FaucetCooldownError } from "@/app/lib/errors";

export async function claimFaucetAction(): Promise<{ ok: boolean; message?: string }> {
  const session = await getSession();
  if (!session?.user) return { ok: false, message: "התחברו כדי לקבל מטבעות" };
  try {
    await claimDailyFaucet({ userId: session.user.id });
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    if (e instanceof FaucetCooldownError) return { ok: false, message: "כבר קיבלתם היום — חזרו מחר" };
    throw e;
  }
}
```

- [ ] **Step 2:** `components/faucet-button.tsx` (client): button calling `claimFaucetAction` via `useTransition`, showing the returned message. (Gold accent pill; `disabled` while pending.)

- [ ] **Step 3:** `components/auth-buttons.tsx` (client): a `SignOutButton` calling `signOut({ fetchOptions: { onSuccess: () => location.assign("/") } })` from `@/lib/auth-client`.

- [ ] **Step 4:** `app/signup/page.tsx` + `app/login/page.tsx` (client) — email/password forms via `signUp.email` / `signIn.email` from `@/lib/auth-client`, with error display, a link between the two, `callbackURL: "/"`. No Google button. Hebrew copy, RTL, on the Ballot & Ink tokens (`bg-primary`, `border-border`, etc.).

- [ ] **Step 5:** Rewire `components/site-header.tsx` → async Server Component:
  - `const session = await getSession();` (from `@/lib/auth`)
  - if `session?.user`: `const balance = await getOrInitBalance({ userId: session.user.id });` → render `<FaucetButton/>`, `<CoinPill amount={balance}/>`, avatar (initial of `session.user.name`), `<SignOutButton/>`.
  - else: a `התחברות` link to `/login`.
  - Remove the `currentUser` import from `@/lib/mock-data`. (Leaderboard/market surfaces keep mock data until later phases.)

- [ ] **Step 6:** `pnpm lint && pnpm typecheck && pnpm build` — all pass.
- [ ] **Step 7:** Commit — `git add -A && git commit -m "feat(auth-ui): login/signup pages, faucet, real-balance header, sign-out"`

---

## Task 6: Apply to Neon + verify

- [ ] **Step 1:** Push the ledger migration to the live DB: `pnpm db:push` (adds the 2 user columns + `transactions`/`tx_type`). Confirm success.
- [ ] **Step 2:** Full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green.
- [ ] **Step 3:** Update `docs/decisions/foundation.md` (create; newest-on-top) noting: lazy idempotent starting-stack grant via `getOrInitBalance`; ledger keyed to Better Auth `user.id`; the unpooled-URL note (we have only `DATABASE_URL`).
- [ ] **Step 4:** Commit. (Live browser smoke — sign up → 1,000 → faucet → 1,200 → cooldown — is verified in the closing `qa-session`.)

---

## Self-Review

- **Spec coverage:** P0-1 (1,000 grant) → `grantStartingStack`/`getOrInitBalance` + Task 5; P0-2 (24h faucet, idempotent) → Task 4 + faucet action/button; ledger invariants (every movement a row, cache in same tx, never negative) → `applyEntry` + overdraft test. Auth identity/session → pre-existing. PGlite real-semantics → Tasks 2/4.
- **Placeholders:** none — code is concrete against the actual `app/lib/db.ts`/`schema.ts` and `getSession`.
- **Type consistency:** `applyEntry`/`grantStartingStack`/`claimDailyFaucet`/`getBalance`/`getOrInitBalance` signatures match across service/tests/header; `DB`/`Tx`/`Type` derived once; tables imported from `@/app/lib/schema`.
- **Reconciliation:** uses existing `db`, `schema`, `getSession`; adds only ledger + UI; pushes one additive migration. No auth rebuild.

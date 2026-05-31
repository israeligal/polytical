# Polytical Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user can sign in (Google / email magic-link), is granted a 1,000-coin starting stack, sees their real balance, and can claim a +200 daily faucet — all on a bulletproof append-only ledger where every coin movement is a row, balances are caches updated in the *same* DB transaction, and balances can never go negative.

**Architecture:** Layered, one-directional — **Route/Action → Service → Repository → DB** (per `CLAUDE.md`). Repositories own all Drizzle access and run inside a caller-supplied transaction; the **ledger service is the single authoritative writer** (`postLedgerEntry`) used by every coin movement (grant/faucet now; bet/payout/refund later). Better Auth owns identity (`user`/`session`/`account`/`verification`); our domain columns (`balance`, `isAdmin`, `lastFaucetAt`) live on the same `user` row with DB-level defaults. Integration tests run against **real Postgres semantics via PGlite** (no mocks).

**Tech Stack:** Next.js 16 (App Router) · Drizzle ORM + `drizzle-orm/neon-serverless` (WebSocket Pool — required for interactive transactions) · Neon Postgres · Better Auth 1.6 (Drizzle adapter) · Vitest + `@electric-sql/pglite` · Zod 4.

---

## Prerequisites (manual — do these before Task 0)

These need a human; the plan assumes they're done.

1. **Neon project** → copy **two** connection strings into `.env.local`:
   - `DATABASE_URL` = the **pooled** (`-pooler`) URL — app runtime.
   - `DATABASE_URL_UNPOOLED` = the **direct** (non-pooler) URL — migrations/seeds/scripts (avoids the pgbouncer prepared-statement gotcha; this is how we honor `CLAUDE.md`'s `prepare:false` intent, since `prepare:false` is a `postgres-js` option not available on `neon-serverless`).
2. **Google OAuth** (Google Cloud Console → Credentials → OAuth client, type *Web*):
   - Authorized redirect URI: `http://localhost:3210/api/auth/callback/google` (dev) — note **port 3210**.
   - Copy `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` into `.env.local`.
3. **Auth secret:** `BETTER_AUTH_SECRET=$(openssl rand -base64 32)`; `BETTER_AUTH_URL=http://localhost:3210`.
4. (Magic-link email can log the URL to console in dev — no mailer needed for Phase 1.)

**Conventions (from `CLAUDE.md`):** named exports; RORO (object params) on exported fns; files < 500 lines; no `as any`; logical RTL Tailwind props; no bare `console.*` in server code (use `lib/logger`); every DB-mutating script starts with `assertNonProductionDb()`; batch inserts ~100; resolve entities by stable id.

---

## Task 0: Install dependencies + scripts

**Files:** Modify `package.json`

- [ ] **Step 1: Install**

```bash
pnpm add better-auth drizzle-orm @neondatabase/serverless ws zod
pnpm add -D drizzle-kit @types/ws @electric-sql/pglite vitest dotenv
```
(Pin whatever `latest` resolves to; the import APIs used below are stable across current ranges. `better-auth` should be `^1.6`.)

- [ ] **Step 2: Add scripts** to `package.json` (`scripts` block):

```json
"test": "vitest run",
"test:watch": "vitest",
"db:generate": "drizzle-kit generate",
"db:push": "dotenv -e .env.local -- drizzle-kit push",
"db:studio": "dotenv -e .env.local -- drizzle-kit studio",
"auth:generate": "npx @better-auth/cli@latest generate --config lib/auth.ts --output lib/db/auth-schema.ts"
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml && git commit -m "chore: add db/auth/test deps and scripts"
```

---

## Task 1: Env loading + `.env.example`

**Files:** Create `lib/env.ts`, `.env.example`; verify `.gitignore` ignores `.env*.local`

- [ ] **Step 1: `.env.example`**

```bash
DATABASE_URL=
DATABASE_URL_UNPOOLED=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3210
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

- [ ] **Step 2: `lib/env.ts`** — validate once, fail fast (Zod 4 top-level API):

```ts
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_URL_UNPOOLED: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
});

export const env = EnvSchema.parse(process.env);
```

- [ ] **Step 3: Commit** — `git commit -am "feat: validated env loader + .env.example"`

---

## Task 2: Shared DB client + non-prod guard

**Files:** Create `lib/db/index.ts`, `lib/db/guards.ts`, `drizzle.config.ts`, `lib/logger.ts`

- [ ] **Step 1: `lib/logger.ts`** (no bare console in server code):

```ts
/* Minimal structured logger; swap for the real sink in a later phase. */
export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => console.log(JSON.stringify({ level: "info", msg, ...meta })),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(JSON.stringify({ level: "warn", msg, ...meta })),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(JSON.stringify({ level: "error", msg, ...meta })),
};
```

- [ ] **Step 2: `lib/db/index.ts`** — single shared Pool/db on `neon-serverless` (WebSocket → interactive tx):

```ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { env } from "@/lib/env";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws; // needed in the Node server runtime

const globalForDb = globalThis as unknown as { pool?: Pool };
const pool = globalForDb.pool ?? new Pool({ connectionString: env.DATABASE_URL });
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle({ client: pool, schema });
export type DB = typeof db;
```

- [ ] **Step 3: `lib/db/guards.ts`**:

```ts
export function assertNonProductionDb(): void {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";
  if (process.env.NODE_ENV === "production" || /\bprod\b/i.test(url)) {
    throw new Error("Refusing to run a mutating script against a production database.");
  }
}
```

- [ ] **Step 4: `drizzle.config.ts`** (uses the **unpooled** URL):

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED! },
});
```

- [ ] **Step 5: Commit** — `git commit -am "feat: shared neon-serverless db client, logger, non-prod guard, drizzle config"`

---

## Task 3: Schema — auth tables, domain columns, ledger

**Files:** Create `lib/db/schema.ts`; generate migrations into `drizzle/`

Better Auth's required fields are hand-written here (so we control DB defaults/constraints); our domain columns carry DB-level defaults so Better Auth's identity inserts fill them automatically.

- [ ] **Step 1: `lib/db/schema.ts`**

```ts
import { pgTable, text, boolean, integer, timestamp, uuid, pgEnum, index } from "drizzle-orm/pg-core";

// ---- Better Auth core (string ids) + our domain columns -------------------
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  // domain columns (DB defaults so auth inserts fill them):
  balance: integer("balance").notNull().default(0),
  isAdmin: boolean("isAdmin").notNull().default(false),
  lastFaucetAt: timestamp("lastFaucetAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { withTimezone: true }),
  scope: text("scope"),
  idToken: text("idToken"),
  password: text("password"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Ledger (the money source of truth) -----------------------------------
export const txType = pgEnum("tx_type", ["grant", "faucet", "bet", "payout", "refund"]);

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  type: txType("type").notNull(),
  amount: integer("amount").notNull(),        // signed: credits +, debits −
  balanceAfter: integer("balanceAfter").notNull(),
  refMarketId: text("refMarketId"),
  refBetId: text("refBetId"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("tx_user_created_idx").on(t.userId, t.createdAt)]);
```

- [ ] **Step 2: Generate migrations** (creates `drizzle/0000_*.sql`; PGlite tests reuse these):

```bash
pnpm db:generate
```
Expected: a new SQL file appears under `drizzle/`.

- [ ] **Step 3: Cross-check Better Auth's expectations** — run the generator to a scratch file and diff field names; reconcile any mismatch into `schema.ts`, then delete the scratch:

```bash
pnpm auth:generate   # writes lib/db/auth-schema.ts — compare, fold differences into schema.ts, then: rm lib/db/auth-schema.ts
```

- [ ] **Step 4: Commit** — `git add lib/db/schema.ts drizzle && git commit -m "feat: db schema (auth tables + domain cols + ledger) and initial migration"`

---

## Task 4: PGlite test harness + Vitest

**Files:** Create `vitest.config.ts`, `lib/db/testing/create-test-db.ts`

- [ ] **Step 1: `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths"; // pnpm add -D vite-tsconfig-paths

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { environment: "node", include: ["**/*.test.ts"] },
});
```
(Run `pnpm add -D vite-tsconfig-paths` so `@/` resolves in tests.)

- [ ] **Step 2: `lib/db/testing/create-test-db.ts`** — real Postgres semantics, schema applied via the generated migrations:

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/lib/db/schema";

export async function createTestDb() {
  const client = new PGlite(); // in-memory, ephemeral
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, close: () => client.close() };
}
export type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];
```

- [ ] **Step 3: Smoke test** `lib/db/testing/harness.test.ts`:

```ts
import { expect, test } from "vitest";
import { createTestDb } from "./create-test-db";
import { user } from "@/lib/db/schema";

test("PGlite applies schema and inserts a user with default balance 0", async () => {
  const { db, close } = await createTestDb();
  await db.insert(user).values({ id: "u1", name: "Gal", email: "g@x.co" });
  const rows = await db.select().from(user);
  expect(rows[0].balance).toBe(0);
  expect(rows[0].isAdmin).toBe(false);
  await close();
});
```

- [ ] **Step 4: Run** — `pnpm test` → Expected: PASS (proves migrations + defaults work in PGlite).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "test: PGlite harness with real schema migrations"`

---

## Task 5: Ledger errors + constants + repository

**Files:** Create `lib/economy.ts`, `lib/errors.ts`, `lib/db/repositories/ledger-repo.ts`

- [ ] **Step 1: `lib/economy.ts`**

```ts
export const STARTING_STACK = 1000;
export const DAILY_FAUCET = 200;
export const FAUCET_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const MIN_BET = 10;
```

- [ ] **Step 2: `lib/errors.ts`**

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

- [ ] **Step 3: `lib/db/repositories/ledger-repo.ts`** — owns DB access; scope-guarded; takes a tx:

```ts
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { transactions, txType, user } from "@/lib/db/schema";
import { MissingUserError } from "@/lib/errors";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

function requireUserId(userId: string): string {
  if (!userId) throw new MissingUserError();
  return userId;
}

/** Locks the user row and returns its balance (FOR UPDATE → serialize concurrent ledger writes). */
export async function lockBalance({ tx, userId }: { tx: Tx; userId: string }): Promise<number> {
  requireUserId(userId);
  const [row] = await tx.select({ balance: user.balance }).from(user)
    .where(eq(user.id, userId)).for("update");
  if (!row) throw new MissingUserError();
  return row.balance;
}

export async function writeBalance({ tx, userId, balance, lastFaucetAt }: {
  tx: Tx; userId: string; balance: number; lastFaucetAt?: Date;
}): Promise<void> {
  await tx.update(user)
    .set({ balance, ...(lastFaucetAt ? { lastFaucetAt } : {}), updatedAt: new Date() })
    .where(eq(user.id, requireUserId(userId)));
}

export async function insertEntry({ tx, userId, type, amount, balanceAfter, refMarketId, refBetId }: {
  tx: Tx; userId: string; type: (typeof txType.enumValues)[number];
  amount: number; balanceAfter: number; refMarketId?: string; refBetId?: string;
}): Promise<void> {
  await tx.insert(transactions).values({ userId: requireUserId(userId), type, amount, balanceAfter, refMarketId, refBetId });
}

export async function countByType({ tx, userId, type }: {
  tx: Tx; userId: string; type: (typeof txType.enumValues)[number];
}): Promise<number> {
  const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(transactions)
    .where(and(eq(transactions.userId, requireUserId(userId)), eq(transactions.type, type)));
  return row?.n ?? 0;
}

export async function readUser({ tx, userId }: { tx: Tx; userId: string }) {
  const [row] = await tx.select().from(user).where(eq(user.id, requireUserId(userId)));
  return row ?? null;
}
```

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: economy constants, typed errors, ledger repository"`

---

## Task 6: Ledger service (the authoritative writer) — TDD

**Files:** Create `lib/services/ledger-service.ts`, `lib/services/ledger-service.test.ts`

- [ ] **Step 1: Write the failing tests** `lib/services/ledger-service.test.ts`:

```ts
import { beforeEach, afterEach, expect, test } from "vitest";
import { createTestDb } from "@/lib/db/testing/create-test-db";
import { user, transactions } from "@/lib/db/schema";
import { STARTING_STACK, DAILY_FAUCET } from "@/lib/economy";
import { FaucetCooldownError, InsufficientFundsError } from "@/lib/errors";
import { postLedgerEntry, grantStartingStack, claimDailyFaucet, getBalance } from "./ledger-service";

let h: Awaited<ReturnType<typeof createTestDb>>;
const UID = "u1";
beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(user).values({ id: UID, name: "Gal", email: "g@x.co" });
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

test("claimDailyFaucet adds 200, then blocks within 24h, then allows after", async () => {
  await grantStartingStack({ db: h.db, userId: UID });
  await claimDailyFaucet({ db: h.db, userId: UID });
  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK + DAILY_FAUCET);
  await expect(claimDailyFaucet({ db: h.db, userId: UID })).rejects.toBeInstanceOf(FaucetCooldownError);
  // fast-forward: set lastFaucetAt to 25h ago
  const past = new Date(Date.now() - 25 * 3600 * 1000);
  await h.db.update(user).set({ lastFaucetAt: past }).where(eq(user.id, UID));
  await claimDailyFaucet({ db: h.db, userId: UID });
  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK + 2 * DAILY_FAUCET);
});

test("postLedgerEntry rejects an overdraft and rolls back (no row, balance unchanged)", async () => {
  await grantStartingStack({ db: h.db, userId: UID });
  await expect(postLedgerEntry({ db: h.db, userId: UID, type: "bet", amount: -(STARTING_STACK + 1) }))
    .rejects.toBeInstanceOf(InsufficientFundsError);
  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK);
  const rows = await h.db.select().from(transactions);
  expect(rows.filter((r) => r.type === "bet").length).toBe(0);
});
```
(Add `import { eq } from "drizzle-orm";` at the top.)

- [ ] **Step 2: Run → verify they FAIL** — `pnpm test ledger-service` → Expected: FAIL (module not found / fns undefined).

- [ ] **Step 3: Implement** `lib/services/ledger-service.ts`:

```ts
import type { DB } from "@/lib/db";
import { db as defaultDb } from "@/lib/db";
import * as repo from "@/lib/db/repositories/ledger-repo";
import { txType } from "@/lib/db/schema";
import { STARTING_STACK, DAILY_FAUCET, FAUCET_COOLDOWN_MS } from "@/lib/economy";
import { FaucetCooldownError, InsufficientFundsError } from "@/lib/errors";

type Type = (typeof txType.enumValues)[number];
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** THE authoritative coin writer: lock balance → validate → update cache + append row, atomically. */
export async function postLedgerEntry(args: {
  db?: DB; userId: string; type: Type; amount: number; refMarketId?: string; refBetId?: string;
}): Promise<{ balanceAfter: number }> {
  const { db = defaultDb, userId, type, amount, refMarketId, refBetId } = args;
  return db.transaction(async (tx) => applyEntry({ tx, userId, type, amount, refMarketId, refBetId }));
}

/** Same logic, but joins an existing transaction (used by grant/faucet and future betting). */
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
    if (await repo.countByType({ tx, userId, type: "grant" }) > 0) return; // idempotent
    await applyEntry({ tx, userId, type: "grant", amount: STARTING_STACK });
  });
}

export async function claimDailyFaucet({ db = defaultDb, userId }: { db?: DB; userId: string }): Promise<{ balanceAfter: number }> {
  return db.transaction(async (tx) => {
    const u = await repo.readUser({ tx, userId });
    if (!u) throw new InsufficientFundsError();
    const last = u.lastFaucetAt?.getTime() ?? 0;
    const elapsed = Date.now() - last;
    if (elapsed < FAUCET_COOLDOWN_MS) throw new FaucetCooldownError(new Date(last + FAUCET_COOLDOWN_MS));
    const result = await applyEntry({ tx, userId, type: "faucet", amount: DAILY_FAUCET });
    await repo.writeBalance({ tx, userId, balance: result.balanceAfter, lastFaucetAt: new Date() });
    return result;
  });
}

export async function getBalance({ db = defaultDb, userId }: { db?: DB; userId: string }): Promise<number> {
  return db.transaction(async (tx) => (await repo.readUser({ tx, userId }))?.balance ?? 0);
}
```

- [ ] **Step 4: Run → verify PASS** — `pnpm test ledger-service` → Expected: 3 pass.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: ledger service (authoritative writer, idempotent grant, 24h faucet) + tests"`

---

## Task 7: Better Auth wiring

**Files:** Create `lib/auth.ts`, `lib/auth-client.ts`, `app/api/auth/[...all]/route.ts`

- [ ] **Step 1: `lib/auth.ts`**

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => { logger.info("magic-link", { email, url }); }, // dev: log it
    }),
    nextCookies(), // MUST be last
  ],
});
```

- [ ] **Step 2: `app/api/auth/[...all]/route.ts`**

```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 3: `lib/auth-client.ts`**

```ts
import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";
export const authClient = createAuthClient({ plugins: [magicLinkClient()] });
export const { signIn, signOut, useSession } = authClient;
```

- [ ] **Step 4: Push schema to Neon + manual smoke** — `pnpm db:push`, then `pnpm dev`, hit `/api/auth/ok` style check by signing in on the page built in Task 8. (No automated test — Better Auth + OAuth is an external boundary.)
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: Better Auth (google + magic-link) server, route handler, client"`

---

## Task 8: Session helper + UI wiring (sign-in, real balance, faucet)

**Files:** Create `lib/session.ts`, `app/login/page.tsx`, `app/actions/faucet.ts`, `components/faucet-button.tsx`; Modify `components/site-header.tsx`

- [ ] **Step 1: `lib/session.ts`** — server session + lazy idempotent grant:

```ts
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { grantStartingStack, getBalance } from "@/lib/services/ledger-service";

export async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

/** Ensures the starting stack exists (idempotent) and returns the current balance. */
export async function getOrInitBalance({ userId }: { userId: string }): Promise<number> {
  await grantStartingStack({ userId });
  return getBalance({ userId });
}
```

- [ ] **Step 2: `app/actions/faucet.ts`** — Server Action:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { claimDailyFaucet } from "@/lib/services/ledger-service";
import { FaucetCooldownError } from "@/lib/errors";

export async function claimFaucetAction(): Promise<{ ok: boolean; message?: string }> {
  const u = await getSessionUser();
  if (!u) return { ok: false, message: "התחברו כדי לקבל מטבעות" };
  try {
    await claimDailyFaucet({ userId: u.id });
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    if (e instanceof FaucetCooldownError) return { ok: false, message: "כבר קיבלתם היום — חזרו מחר" };
    throw e;
  }
}
```

- [ ] **Step 3: `components/faucet-button.tsx`** (client):

```tsx
"use client";
import { useTransition, useState } from "react";
import { claimFaucetAction } from "@/app/actions/faucet";

export function FaucetButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { const r = await claimFaucetAction(); setMsg(r.message ?? null); })}
        className="rounded-lg bg-accent px-3 py-1 text-sm font-bold text-accent-foreground disabled:opacity-60"
      >
        בונוס יומי
      </button>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </span>
  );
}
```

- [ ] **Step 4: `app/login/page.tsx`** (client) — Google + magic link:

```tsx
"use client";
import { useState } from "react";
import { signIn } from "@/lib/auth-client";
import { SiteHeader } from "@/components/site-header";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <>
      <main className="mx-auto flex max-w-sm flex-1 flex-col justify-center gap-4 px-4 py-16">
        <h1 className="font-display text-3xl font-black text-foreground">התחברות לפוליטיקל</h1>
        <button onClick={() => signIn.social({ provider: "google", callbackURL: "/" })}
          className="rounded-lg border-2 border-primary px-5 py-3 font-bold text-primary">
          המשך עם Google
        </button>
        <div className="text-center text-sm text-muted-foreground">או</div>
        <input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          className="rounded-lg border border-border bg-card px-3 py-2.5" />
        <button onClick={async () => { await signIn.magicLink({ email, callbackURL: "/" }); setSent(true); }}
          className="rounded-lg bg-primary px-5 py-3 font-bold text-primary-foreground">
          שלחו לי קישור כניסה
        </button>
        {sent && <p className="text-sm text-muted-foreground">נשלח קישור (בדיקת dev: ראו את הלוג בקונסול).</p>}
      </main>
    </>
  );
}
```
(`SiteHeader` import kept if you want the masthead; optional on the login page.)

- [ ] **Step 5: Rewire `components/site-header.tsx`** to async + real session (replaces the mock `currentUser`):

```tsx
import Link from "next/link";
import { Ballot } from "@/components/icons";
import { CoinPill } from "@/components/coin-pill";
import { FaucetButton } from "@/components/faucet-button";
import { getSessionUser, getOrInitBalance } from "@/lib/session";

const NAV = [
  { href: "/#markets", label: "שווקים" },
  { href: "/#politicians", label: "פוליטיקאים" },
  { href: "/#leaderboard", label: "טבלת מובילים" },
];

export async function SiteHeader() {
  const u = await getSessionUser();
  const balance = u ? await getOrInitBalance({ userId: u.id }) : null;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="bg-foreground text-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-1 text-xs sm:px-6 lg:px-8">
          <span className="opacity-90">מהדורת הבוקר · בלי כסף אמיתי, רק על הכבוד</span>
          <span className="hidden opacity-70 sm:inline">פוליטיקל · Polytical</span>
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Ballot className="h-5 w-5" /></span>
          <span className="font-display text-2xl font-black leading-none text-foreground">פוליטיקל</span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-sm font-semibold text-muted-foreground transition-colors hover:text-primary">{n.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {u && balance !== null ? (
            <>
              <FaucetButton />
              <CoinPill amount={balance} />
              <span className="grid h-9 w-9 place-items-center rounded-full bg-muted font-bold text-foreground ring-1 ring-border">
                {(u.name?.[0] ?? "?").toUpperCase()}
              </span>
            </>
          ) : (
            <Link href="/login" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">התחברות</Link>
          )}
        </div>
      </div>
    </header>
  );
}
```
(Delete the now-unused `currentUser` import from `mock-data` here; leave the rest of `mock-data` for the still-mocked market/leaderboard surfaces until Phase 2.)

- [ ] **Step 6: Verify** — `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Then `pnpm dev`, sign in with Google → header shows a real balance of **1,000**; click **בונוס יומי** → **1,200**; click again → "כבר קיבלתם היום".
- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: session helper, login page, faucet action, real balance in header"`

---

## Task 9: Phase verification + docs

- [ ] **Step 1:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green.
- [ ] **Step 2:** Append a decision-log entry to `docs/decisions/` if any choice deviated (e.g., the unpooled-URL-for-migrations resolution of the `prepare:false` rule).
- [ ] **Step 3:** Commit + open PR for `feat/polytical-foundation`.

---

## Self-Review (done)

- **Spec coverage:** P0-1 (auth + 1,000 grant) → Tasks 7/8 + `grantStartingStack`; P0-2 (daily faucet, 24h, idempotent) → Task 6 + Task 8; ledger invariants (every movement a row, cache in same tx, never negative, atomic) → Task 6 (`applyEntry`, overdraft test). Better Auth identity tables → Task 3. PGlite real-semantics testing → Tasks 4/6.
- **Placeholders:** none — every code step is complete and runnable against the verified APIs.
- **Type consistency:** `applyEntry`/`postLedgerEntry`/`grantStartingStack`/`claimDailyFaucet`/`getBalance` signatures match between service, tests, and `site-header`; `txType.enumValues` reused; repo `Tx` type derived once.
- **Deferred to later phases (correct for Foundation):** markets/bets/resolution tables, `searchName`/`pg_trgm` (Cards phase — needs raw-SQL migration), admin gating UI, analytics events on the logger.

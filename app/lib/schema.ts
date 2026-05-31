import { pgTable, text, timestamp, boolean, integer, uuid, pgEnum, index } from "drizzle-orm/pg-core";

// --- Better Auth tables ---
// Canonical Better Auth Drizzle schema (pg). Generated/maintained to match
// `better-auth` expectations; mapped in lib/auth.ts via drizzleAdapter.
// Polytical-specific user fields (balance, accuracy, faucet, ...) arrive with
// the coin-ledger foundation; `isAdmin` is here now because admin routes are
// role-gated from day one (PRD P0).

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  isAdmin: boolean("isAdmin").notNull().default(false),
  balance: integer("balance").notNull().default(0),     // coin balance CACHE; ledger is source of truth
  lastFaucetAt: timestamp("lastFaucetAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const sessions = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

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

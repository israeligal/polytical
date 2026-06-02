import { sql } from "drizzle-orm";
import {
  pgTable, text, timestamp, boolean, integer, jsonb, date, uuid, pgEnum, index, uniqueIndex, unique, primaryKey,
} from "drizzle-orm/pg-core";

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
  totalResolved: integer("totalResolved").notNull().default(0), // markets the user had a bet in that resolved
  totalWins: integer("totalWins").notNull().default(0),         // of those, the user's top stake was on the winner
  streakCount: integer("streakCount").notNull().default(0),     // consecutive-day faucet claims (48h grace)
  bestStreak: integer("bestStreak").notNull().default(0),       // longest streak ever reached
  // --- Identity / onboarding (Phase 2) ---
  handle: text("handle").unique(),       // @-handle (3–20 [a-z0-9_]); nullable — Postgres treats multiple NULLs as distinct, so legacy rows are fine
  arena: text("arena"),                  // the user's chosen focus — a CATEGORIES key, stored as text
  onboardedAt: timestamp("onboardedAt"), // null = onboarding gate not yet cleared
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
export const txType = pgEnum("tx_type", ["grant", "faucet", "bet", "payout", "refund", "collect"]);

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
  (t) => [
    index("tx_user_created_idx").on(t.userId, t.createdAt),
    // DB-enforced one-grant-per-user — defense-in-depth behind the lock-first grant logic.
    uniqueIndex("one_grant_per_user").on(t.userId).where(sql`${t.type} = 'grant'`),
  ],
);

// ===================================================================
// Knesset ingestion domain (system of record: official OData v3).
// Every row is keyed by a STABLE Knesset id (unique) and carries
// provenance: sourceDataset / sourceUrl / fetchedAt. Resolve by id ONLY.
// ===================================================================

// Reused provenance columns — spelled out per table (Drizzle has no mixins).
// sourceDataset e.g. "KNS_PersonToPosition" | "oknesset:mk_individual.csv".

export const politicians = pgTable(
  "politicians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: integer("personId").notNull().unique(), // official KNS_Person.PersonID — the canonical key
    nameHe: text("nameHe").notNull(),
    nameEn: text("nameEn"),                            // gap-filled from Open Knesset, reconciled by personId
    party: text("party"),                              // FactionName from the PositionID-54 row
    factionId: integer("factionId"),                   // FK-by-value to factions.factionId (never 911)
    roleHe: text("roleHe"),                            // top role label resolved via KNS_Position.Description
    inKnessetSince: date("inKnessetSince"),            // MIN(StartDate) of PositionID-54 rows
    dob: date("dob"),                                  // NULL — not in OData; editorial-sourced later
    facts: jsonb("facts").notNull().default({}),       // roles[], ministries[], counts, etc. (see normalize)
    active: boolean("active").notNull().default(true),
    searchName: text("searchName").notNull().default(""), // unaccent(lower(nameHe)), niqqud/finals/particles normalized
    sourceDataset: text("sourceDataset").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
  },
  (t) => [
    index("politicians_faction_idx").on(t.factionId),
    index("politicians_active_idx").on(t.active),
  ],
);

export const factions = pgTable("factions", {
  id: uuid("id").primaryKey().defaultRandom(),
  factionId: integer("factionId").notNull().unique(), // KNS_Faction.FactionID
  nameHe: text("nameHe").notNull(),                   // KNS_Faction.Name (NOT "FactionName")
  knessetNum: integer("knessetNum"),
  isCurrent: boolean("isCurrent").notNull().default(false),
  sourceDataset: text("sourceDataset").notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  fetchedAt: timestamp("fetchedAt").notNull(),
});

export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billId: integer("billId").notNull().unique(),      // KNS_Bill.BillID
    knessetNum: integer("knessetNum"),
    nameHe: text("nameHe").notNull(),                  // KNS_Bill.Name
    subTypeDesc: text("subTypeDesc"),                  // private/committee/government
    statusId: integer("statusId"),                     // KNS_Bill.StatusID (code; lookup later)
    sourceDataset: text("sourceDataset").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
  },
  (t) => [index("bills_knesset_idx").on(t.knessetNum)],
);

export const billSponsors = pgTable(
  "bill_sponsors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billInitiatorId: integer("billInitiatorId").notNull().unique(), // KNS_BillInitiator.BillInitiatorID
    billId: integer("billId").notNull(),               // -> bills.billId / KNS_Bill.BillID
    personId: integer("personId").notNull(),           // -> politicians.personId / KNS_Person.PersonID
    isInitiator: boolean("isInitiator").notNull().default(false),
    ordinal: integer("ordinal"),
    sourceDataset: text("sourceDataset").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
  },
  (t) => [
    // Natural-key uniqueness on top of the OData surrogate, per the task brief.
    unique("bill_sponsors_bill_person_init_uq").on(t.billId, t.personId, t.isInitiator),
    index("bill_sponsors_person_idx").on(t.personId),
    index("bill_sponsors_bill_idx").on(t.billId),
  ],
);

export const queries = pgTable(
  "queries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queryId: integer("queryId").notNull().unique(),    // KNS_Query.QueryID
    number: integer("number"),                         // KNS_Query.Number
    knessetNum: integer("knessetNum"),
    nameHe: text("nameHe"),                            // KNS_Query.Name
    typeDesc: text("typeDesc"),                        // KNS_Query.TypeDesc
    statusId: integer("statusId"),
    personId: integer("personId").notNull(),           // submitting MK -> politicians.personId
    govMinistryId: integer("govMinistryId"),
    submitDate: timestamp("submitDate"),
    sourceDataset: text("sourceDataset").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
  },
  (t) => [index("queries_person_idx").on(t.personId)],
);

export const committees = pgTable("committees", {
  id: uuid("id").primaryKey().defaultRandom(),
  committeeId: integer("committeeId").notNull().unique(), // KNS_Committee.CommitteeID
  nameHe: text("nameHe").notNull(),                       // KNS_Committee.Name
  categoryDesc: text("categoryDesc"),
  knessetNum: integer("knessetNum"),
  committeeTypeDesc: text("committeeTypeDesc"),
  parentCommitteeId: integer("parentCommitteeId"),
  isCurrent: boolean("isCurrent").notNull().default(false),
  sourceDataset: text("sourceDataset").notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  fetchedAt: timestamp("fetchedAt").notNull(),
});

// Committee MEMBERSHIP is NOT reliable via OData -> seeded from Open Knesset
// (mk_individual_committees.csv), reconciled by personId. Natural key:
// committeeId + personId + positionId + startDate (a person can rejoin).
export const committeeMemberships = pgTable(
  "committee_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    committeeId: integer("committeeId").notNull(),     // -> committees.committeeId
    personId: integer("personId").notNull(),           // -> politicians.personId
    positionId: integer("positionId").notNull(),       // role on the committee (chair/member)
    startDate: date("startDate"),
    finishDate: date("finishDate"),
    sourceDataset: text("sourceDataset").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
  },
  (t) => [
    unique("committee_memberships_natural_uq").on(
      t.committeeId, t.personId, t.positionId, t.startDate,
    ),
    index("committee_memberships_person_idx").on(t.personId),
    index("committee_memberships_committee_idx").on(t.committeeId),
  ],
);

// ===================================================================
// Markets & parimutuel betting (Phase 2). All coin movement still flows
// through the append-only ledger (`transactions` + applyEntry); these
// tables hold market state + the per-outcome pool caches + bet records.
// ===================================================================

export const marketStatus = pgEnum("market_status", ["draft", "open", "closed", "resolved", "voided"]);
export const marketType = pgEnum("market_type", ["binary", "multi"]);
export const betStatus = pgEnum("bet_status", ["open", "won", "lost", "refunded"]);

export const markets = pgTable("markets", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionHe: text("questionHe").notNull(),
  descriptionHe: text("descriptionHe"),
  category: text("category").notNull(),                 // Category union, stored as text
  type: marketType("type").notNull().default("binary"),
  status: marketStatus("status").notNull().default("open"),
  hot: boolean("hot").notNull().default(false),
  openAt: timestamp("openAt").notNull().defaultNow(),
  closeAt: timestamp("closeAt").notNull(),
  resolvedOutcomeId: uuid("resolvedOutcomeId"),
  resolutionSourceUrl: text("resolutionSourceUrl"),
  resolutionNote: text("resolutionNote"),
  resolvedAt: timestamp("resolvedAt"),
  createdBy: text("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const outcomes = pgTable("outcomes", {
  id: uuid("id").primaryKey().defaultRandom(),
  marketId: uuid("marketId").notNull().references(() => markets.id, { onDelete: "cascade" }),
  labelHe: text("labelHe").notNull(),
  poolTotal: integer("poolTotal").notNull().default(0), // cache: Σ bet amounts on this outcome
  cat: integer("cat"),                                  // categorical color slot (multi)
  ordinal: integer("ordinal").notNull().default(0),
});

export const marketPoliticians = pgTable("market_politicians", {
  marketId: uuid("marketId").notNull().references(() => markets.id, { onDelete: "cascade" }),
  personId: integer("personId").notNull(),              // → politicians.personId
}, (t) => [primaryKey({ columns: [t.marketId, t.personId] })]);

export const bets = pgTable("bets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  marketId: uuid("marketId").notNull().references(() => markets.id, { onDelete: "cascade" }),
  outcomeId: uuid("outcomeId").notNull().references(() => outcomes.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  payout: integer("payout").notNull().default(0),
  status: betStatus("status").notNull().default("open"),
  seenAt: timestamp("seenAt"),   // null until the user first views the RESOLVED bet → one-time win/loss celebration
  createdAt: timestamp("createdAt").notNull().defaultNow(),
}, (t) => [index("bets_market_idx").on(t.marketId), index("bets_user_idx").on(t.userId)]);

// ===================================================================
// Comments (Phase 4) — per-market discussion. NO coin movement: these
// tables never touch the ledger. `upvotes` is a cache of COUNT(comment_votes);
// the composite-PK on comment_votes makes upvoting idempotent (one row per
// (comment,user) — toggle, never double-count). Admins flip `hidden`.
// ===================================================================

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  marketId: uuid("marketId").notNull().references(() => markets.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  upvotes: integer("upvotes").notNull().default(0),  // cache: COUNT(comment_votes)
  hidden: boolean("hidden").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
}, (t) => [index("comments_market_idx").on(t.marketId, t.createdAt)]);

export const commentVotes = pgTable("comment_votes", {
  commentId: uuid("commentId").notNull().references(() => comments.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.commentId, t.userId] })]);

// ===================================================================
// Community market suggestions (Phase 7) — the "community" half of the
// admin+community model. A user proposes a market; an admin reviews. Approval
// creates a real market (reusing repo.createMarket in the SAME tx) and links it
// here via `marketId`. A reviewed row is terminal — never re-reviewed. NO coin
// movement: this table never touches the ledger.
// ===================================================================

export const suggestionStatus = pgEnum("suggestion_status", ["pending", "approved", "rejected"]);

export const marketSuggestions = pgTable("market_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }), // proposer
  questionHe: text("questionHe").notNull(),
  category: text("category").notNull(),                 // Category union, stored as text
  personId: integer("personId"),                        // optional featured MK → politicians.personId (no FK; resolve by id)
  status: suggestionStatus("status").notNull().default("pending"),
  reviewNote: text("reviewNote"),                       // admin note (esp. on reject)
  reviewedBy: text("reviewedBy").references(() => users.id),
  reviewedAt: timestamp("reviewedAt"),
  marketId: uuid("marketId").references(() => markets.id, { onDelete: "set null" }), // set on approve
  createdAt: timestamp("createdAt").notNull().defaultNow(),
}, (t) => [index("market_suggestions_status_idx").on(t.status, t.createdAt)]);

// ===================================================================
// Notifications (Phase 1) — a display-only event log. Rows are emitted INSIDE
// the transaction that produced the event (resolveMarket / approve-rejectSuggestion)
// so they commit/roll back atomically with it. NO coin movement; ref* columns
// carry NO FK (mirrors transactions.refMarketId) so a later market delete can't
// cascade-wipe history and emit stays cheap inside the hot resolve tx.
// ===================================================================

export const notificationType = pgEnum("notification_type", [
  "bet_won",
  "market_resolved",
  "suggestion_approved",
  "suggestion_rejected",
]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: notificationType("type").notNull(),
  titleHe: text("titleHe").notNull(),
  bodyHe: text("bodyHe").notNull(),
  refMarketId: uuid("refMarketId"),       // display-only links; no FK
  refBetId: uuid("refBetId"),
  refSuggestionId: uuid("refSuggestionId"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
}, (t) => [
  index("notifications_user_created_idx").on(t.userId, t.createdAt),
  // Partial index → unread count is O(unread), not a full per-user scan.
  index("notifications_user_unread_idx").on(t.userId).where(sql`${t.read} = false`),
]);

// ===================================================================
// Card collection (Phase 2) — the collectible hook. Spending `collect` coins
// (a ledger row, like any coin movement) buys permanent ownership of an MK's
// caricature card. personId references politicians.personId by STABLE id (no
// FK — resolve by canonical id, never fuzzy); the unique(userId, personId)
// index is BOTH the one-card-per-user ownership invariant AND the idempotency
// backstop that rolls back the debit on a concurrent double-collect.
// ===================================================================

export const cardCollections = pgTable("card_collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  personId: integer("personId").notNull(), // → politicians.personId (no FK; resolve by id)
  collectedAt: timestamp("collectedAt").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("card_collections_user_person_uq").on(t.userId, t.personId),
  index("card_collections_user_idx").on(t.userId),
]);

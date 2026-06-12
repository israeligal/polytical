import { sql } from "drizzle-orm";
import {
  pgTable, text, timestamp, boolean, integer, jsonb, date, uuid, pgEnum, index, uniqueIndex, unique, primaryKey,
} from "drizzle-orm/pg-core";

// --- Better Auth tables ---
// Canonical Better Auth Drizzle schema (pg). Generated/maintained to match
// `better-auth` expectations; mapped in lib/auth.ts via drizzleAdapter.
// Polytical-specific user fields (prediction win/resolved counts, handle, arena)
// live here; `isAdmin` is here because admin routes are role-gated from day one (PRD P0).

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  isAdmin: boolean("isAdmin").notNull().default(false),
  // The user's prediction record — the only "score" in the app. One stake-less
  // prediction per market; on resolve we bump totalResolved (always) and totalWins
  // (when the picked outcome won). wrong = totalResolved − totalWins.
  totalResolved: integer("totalResolved").notNull().default(0), // markets the user predicted that resolved
  totalWins: integer("totalWins").notNull().default(0),         // of those, the user picked the winning outcome
  // --- Identity / onboarding (Phase 2) ---
  handle: text("handle").unique(),       // @-handle, 3–20 chars, single-script: [a-z0-9_] OR [א-ת0-9_] (see HANDLE_RE); nullable — Postgres treats multiple NULLs as distinct, so legacy rows are fine
  arena: text("arena"),                  // the user's chosen focus — a CATEGORIES key, stored as text
  onboardedAt: timestamp("onboardedAt"), // null = onboarding gate not yet cleared
  // Push notification opt-outs: notification_type values the user muted (default
  // none = all on). Gates web-push only — the in-app log always records the event.
  // Stored as text[] (the enum is declared later in this file); validated in the service.
  mutedPushTypes: text("mutedPushTypes").array().notNull().default(sql`'{}'::text[]`),
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
    // Knesset-website MK id (MKs/GetMksDropDown.ID) — a DIFFERENT id space from
    // personId (Liberman: site 214 ↔ OData 427). Set by scripts/bootstrap-mk-mapping.ts
    // via the Open Knesset mk_individual.csv crosswalk; cross-check only — vote
    // attribution always resolves through mk_name_mappings, never this column.
    mkSiteId: integer("mkSiteId").unique(),
    nameHe: text("nameHe").notNull(),
    nameEn: text("nameEn"),                            // gap-filled from Open Knesset, reconciled by personId
    party: text("party"),                              // FactionName from the PositionID-54 row
    factionId: integer("factionId"),                   // FK-by-value to factions.factionId (never 911)
    roleHe: text("roleHe"),                            // top role label resolved via KNS_Position.Description
    inKnessetSince: date("inKnessetSince"),            // MIN(StartDate) of PositionID-54 rows
    dob: date("dob"),                                  // NULL — not in OData; editorial-sourced later
    facts: jsonb("facts").notNull().default({}),       // roles[], ministries[], counts, etc. (see normalize)
    imageUrl: text("imageUrl"),                        // AI caricature path (e.g. /caricatures/<personId>.png); null → styled fallback
    // Gender sourced from KNS_Person.GenderDesc ("זכר"→"male", "נקבה"→"female").
    // Nullable: unknown gender → neutral copy everywhere (never guessed).
    gender: text("gender").$type<"male" | "female">(),
    active: boolean("active").notNull().default(true),
    searchName: text("searchName").notNull().default(""), // unaccent(lower(nameHe)), niqqud/finals/particles normalized
    // Parliamentary-activity counts, official OData `$inlinecount` totals (NOT a join
    // over our K25-only bill/query tables — those undercount a career). "current" = the
    // current Knesset; "lifetime" = all Knessets the MK served. Nullable until the
    // activity-counts ingest step runs; member re-ingest never overwrites them (like dob).
    billsCurrent: integer("billsCurrent"),
    billsLifetime: integer("billsLifetime"),
    queriesCurrent: integer("queriesCurrent"),
    queriesLifetime: integer("queriesLifetime"),
    activityCountsFetchedAt: timestamp("activityCountsFetchedAt"), // freshness/provenance of the 4 counts
    sourceDataset: text("sourceDataset").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
  },
  (t) => [
    index("politicians_faction_idx").on(t.factionId),
    index("politicians_active_idx").on(t.active),
    // Declared in-schema (not just migration 0003) so db:push CREATES + PRESERVES
    // it — a migration-only index gets dropped by a later push. Backs searchPoliticians.
    index("politicians_searchname_trgm_idx").using("gin", sql`${t.searchName} gin_trgm_ops`),
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
// Markets & predictions (Phase 2). A "prediction" is a stake-less pick of one
// outcome per market, changeable until close (unique per user+market). On
// resolve we tally right/wrong onto the user — no pools, no payouts, no coins.
// ===================================================================

export const marketStatus = pgEnum("market_status", ["draft", "open", "closed", "resolved", "voided"]);
export const marketType = pgEnum("market_type", ["binary", "multi"]);

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
  // unaccent/normalized question text for discovery-only fuzzy search (mirrors
  // politicians.searchName). Written via normalizeSearchName on every create
  // path; the trigram GIN index below is declared in-schema so `db:push`
  // creates AND preserves it (a hand-written migration index gets dropped by a
  // later push, since push diffs against the schema).
  searchText: text("searchText").notNull().default(""),
  // Set once when the closing-soon push has been sent for this market, so the
  // cron sweep is idempotent and never re-notifies the same bettors.
  closingSoonNotifiedAt: timestamp("closingSoonNotifiedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
}, (t) => [
  index("markets_searchtext_trgm_idx").using("gin", sql`${t.searchText} gin_trgm_ops`),
]);

export const outcomes = pgTable("outcomes", {
  id: uuid("id").primaryKey().defaultRandom(),
  marketId: uuid("marketId").notNull().references(() => markets.id, { onDelete: "cascade" }),
  labelHe: text("labelHe").notNull(),
  cat: integer("cat"),                                  // categorical color slot (multi)
  ordinal: integer("ordinal").notNull().default(0),
  // → politicians.personId (no FK; resolve by stable id, like market_politicians).
  // Set on multi-market outcomes that ARE a politician ("מי ירכיב את הממשלה?" →
  // each candidate row); null for unlinked outcomes ("אחר") and binary כן/לא.
  // On resolve, a linked winning outcome scopes card progress to that MK only.
  personId: integer("personId"),
});

export const marketPoliticians = pgTable("market_politicians", {
  marketId: uuid("marketId").notNull().references(() => markets.id, { onDelete: "cascade" }),
  personId: integer("personId").notNull(),              // → politicians.personId
}, (t) => [primaryKey({ columns: [t.marketId, t.personId] })]);

// A prediction record (table kept as `bets` for migration continuity): one
// stake-less pick of an outcome per (user, market). The unique(userId, marketId)
// is the "one prediction per market" invariant — makePrediction upserts on it,
// changing the pick in place until the market closes. seenAt drives the one-time
// right/wrong reveal after resolution.
export const bets = pgTable("bets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  marketId: uuid("marketId").notNull().references(() => markets.id, { onDelete: "cascade" }),
  outcomeId: uuid("outcomeId").notNull().references(() => outcomes.id, { onDelete: "cascade" }),
  seenAt: timestamp("seenAt"),   // null until the user first views the RESOLVED prediction → one-time right/wrong reveal
  createdAt: timestamp("createdAt").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("bets_user_market_uq").on(t.userId, t.marketId),
  index("bets_market_idx").on(t.marketId),
  index("bets_user_idx").on(t.userId),
]);

// ===================================================================
// Comments (Phase 4) — per-market discussion; pure discussion data, no game
// state. `upvotes` is a cache of COUNT(comment_votes);
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
// here via `marketId`. A reviewed row is terminal — never re-reviewed. No
// game-state coupling: review only flips status and links the created market.
// ===================================================================

export const suggestionStatus = pgEnum("suggestion_status", ["pending", "approved", "rejected"]);

export const marketSuggestions = pgTable("market_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }), // proposer
  questionHe: text("questionHe").notNull(),
  category: text("category").notNull(),                 // Category union, stored as text
  personId: integer("personId"),                        // optional featured MK → politicians.personId (no FK; resolve by id)
  // Proposed outcome set for a MULTI market: [{labelHe, personId?}] (validated
  // in the service; personId resolves by stable id). NULL = binary כן/לא —
  // legacy rows and the default path stay untouched.
  outcomes: jsonb("outcomes").$type<{ labelHe: string; personId?: number }[] | null>(),
  proposedCloseAt: timestamp("proposedCloseAt"),        // proposer's intended decision date — required by the service for NEW rows; legacy rows null
  resolutionSourceNote: text("resolutionSourceNote"),   // optional "how would this resolve" hint for the reviewer
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
// so they commit/roll back atomically with it. ref* columns carry NO FK so a
// later market delete can't cascade-wipe history and emit stays cheap inside
// the hot resolve tx.
// ===================================================================

export const notificationType = pgEnum("notification_type", [
  "bet_won",             // the user predicted the winning outcome ("המנדט נפדה!")
  "market_resolved",
  "suggestion_approved",
  "suggestion_rejected",
  "market_voided",       // a market the user predicted on was voided
  "market_closing_soon", // a market the user predicted on is about to close
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
// Card collection (Phase 2) — the collectible hook. A card is UNLOCKED BY
// ACCURACY: N correct predictions on markets featuring a politician (N scales
// with the card's rarity, RARITY_UNLOCK_THRESHOLD) auto-grants permanent
// ownership. personId references politicians.personId by STABLE id (no FK —
// resolve by canonical id, never fuzzy); the unique(userId, personId) index is
// BOTH the one-card-per-user ownership invariant AND the idempotency backstop on
// a concurrent double-unlock. `card_progress` holds the running correct-count
// per (user, politician) that drives the threshold.
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

// Running tally of a user's CORRECT predictions on markets featuring each
// politician. Bumped inside resolveMarket's tx; when correctCount reaches the
// rarity threshold the card_collections ownership row is granted (idempotent).
export const cardProgress = pgTable("card_progress", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  personId: integer("personId").notNull(), // → politicians.personId (no FK; resolve by id)
  correctCount: integer("correctCount").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.userId, t.personId] })]);

// ===================================================================
// Seasons (Phase 3) — time-boxed ACCURACY tracks for retention. A season has
// ordered tiers, each requiring N correct predictions on markets RESOLVED within
// the season window. Tier achievement is DERIVED LIVE (count the user's correct
// predictions in [startAt, endAt]) — no claim, no coins, just a badge. Counts
// only grow, so a reached tier stays reached.
// ===================================================================

export const seasonStatus = pgEnum("season_status", ["active", "ended"]);

export const seasons = pgTable("seasons", {
  id: uuid("id").primaryKey().defaultRandom(),
  nameHe: text("nameHe").notNull(),
  startAt: timestamp("startAt").notNull(),
  endAt: timestamp("endAt").notNull(),
  status: seasonStatus("status").notNull().default("active"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
}, (t) => [
  // At most one active season at a time (partial unique) — the writer also guards.
  uniqueIndex("seasons_one_active_uq").on(t.status).where(sql`${t.status} = 'active'`),
]);

// Table/column DB names kept (`season_reward_tiers`, `goalAmount`) so no physical
// rename is needed; the clean JS names (seasonTiers, goalCorrect) alias them.
export const seasonTiers = pgTable("season_reward_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  seasonId: uuid("seasonId").notNull().references(() => seasons.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(),          // tier order within the season (1..n)
  nameHe: text("nameHe").notNull(),
  goalCorrect: integer("goalAmount").notNull(),   // # correct predictions in-window to reach the tier
}, (t) => [
  uniqueIndex("season_reward_tiers_season_ordinal_uq").on(t.seasonId, t.ordinal),
]);

// ===================================================================
// Push subscriptions (Phase: push notifications) — one row per browser/device
// push endpoint a user has granted. Web-push delivery rides ON TOP of the
// in-app `notifications` log: the same NotificationEvent that writes a row
// also fans out a push AFTER its transaction commits (never inside the
// settlement tx — sendNotification is a network call that can't roll back).
// `endpoint` is globally UNIQUE (it already identifies the device); a dead
// endpoint (push service 404/410) is pruned by the dispatcher. text `userId`
// FK cascade mirrors `notifications` so deleting a user drops their subs.
// ===================================================================

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),  // client public key (PushSubscription.keys.p256dh)
  auth: text("auth").notNull(),      // client auth secret (PushSubscription.keys.auth)
  createdAt: timestamp("createdAt").notNull().defaultNow(),
}, (t) => [
  // endpoint already uniquely identifies a device push channel → re-subscribe is
  // an UPSERT on this, and pruning a dead sub targets it.
  uniqueIndex("push_subscriptions_endpoint_uq").on(t.endpoint),
  index("push_subscriptions_user_idx").on(t.userId),
]);

// Knesset plenum votes domain lives in its own file (this one is at the 500-line
// ceiling). Re-exported here so `import * as schema` callers and drizzle() stay
// whole; the `() => users.id` FK thunks make the import cycle safe.
export * from "./schema-votes";

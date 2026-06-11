import { sql } from "drizzle-orm";
import {
  pgTable, text, timestamp, boolean, integer, date, uuid, pgEnum, index, unique, primaryKey,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

// ===================================================================
// Knesset plenum votes domain (spec: docs/superpowers/specs/
// 2026-06-10-knesset-votes-mk-matching.md).
//
// Source of record: the Knesset website API (knesset.gov.il/WebSiteApi/
// knessetapi/Votes/*) — the ONLY live K25 per-MK vote source (official
// OData Votes.svc is frozen at K24). Same invariants as the OData tables:
// stable-id keys, provenance triplet on every ingested row, attribution
// strictly through the human-verified mk_name_mappings (never fuzzy).
// User stances are civic opinions — no coins, cascade-deleted with the
// account, and their direction never leaves this database.
// ===================================================================

// Per-MK roll-call result. The website's VoteResultId space is enumerated by
// `scripts/ingest-votes.ts --probe` (7=בעד observed; official OData domain is
// {1:בעד,2:נגד,3:נמנע,4:לא הצביע}); an unknown id at ingest THROWS — never guessed.
export const mkVoteResult = pgEnum("mk_vote_result", ["for", "against", "abstain", "didnt_vote"]);
// Header VoteType domain enumerated over ALL 6,979 K25 votes (2026-06-10 probe):
// אלקטרונית 6436 · שמית 458 (roll-call — HAS per-MK rows, ids 7/8) · הרמת יד 77
// (counters only) · חשאית 8 (secret — candidate totals in DescreetVoteResults,
// never scoreable). Scoreable types = electronic + roll_call.
export const knessetVoteType = pgEnum("knesset_vote_type", ["electronic", "hand", "roll_call", "secret"]);
// pending_details = header landed but GetVoteDetails hasn't (retried next ingest run).
export const voteDetailsStatus = pgEnum("vote_details_status", ["pending_details", "complete"]);
export const userStance = pgEnum("user_stance", ["for", "against"]);
export const mappingStatus = pgEnum("mapping_status", ["pending", "resolved", "dismissed"]);
export const agendaItemStatus = pgEnum("agenda_item_status", ["announced", "voted", "dropped"]);
export const agendaItemSource = pgEnum("agenda_item_source", ["ingest", "admin"]);

// One plenum roll-call vote (an item can have many — readings, reservations).
export const knessetVotes = pgTable(
  "knesset_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    voteId: integer("voteId").notNull().unique(),      // website VoteId — the stable key
    knessetNum: integer("knessetNum").notNull(),
    itemId: integer("itemId"),                         // VoteHeader.FK_ItemID (null until details land)
    billId: integer("billId"),                         // = itemId when it resolves to bills.billId (FK-by-value)
    titleHe: text("titleHe").notNull(),                // ItemTitle
    voteDate: timestamp("voteDate").notNull(),         // UTC instant (converted from Jerusalem wall-clock)
    voteType: knessetVoteType("voteType").notNull(),   // hand/secret votes have NO per-MK rows, ever
    decisionHe: text("decisionHe"),                    // VoteHeader.Decision
    isAccepted: boolean("isAccepted"),                 // VoteHeader.IsForAccepted
    totalFor: integer("totalFor"),                     // VoteCounters; null while pending_details
    totalAgainst: integer("totalAgainst"),
    totalAbstain: integer("totalAbstain"),
    totalDidntVote: integer("totalDidntVote"),
    // The scoreable vote of its item (latest accepted 2nd/3rd-reading electronic
    // vote, else latest electronic) — recomputed per item on ingest. Matching and
    // user stances only ever use decisive votes.
    isDecisive: boolean("isDecisive").notNull().default(false),
    // Admin-owned (the dob carve-out pattern): excluded from the ingest upsert SET.
    featured: boolean("featured").notNull().default(false),
    detailsStatus: voteDetailsStatus("detailsStatus").notNull().default("pending_details"),
    sourceDataset: text("sourceDataset").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
  },
  (t) => [
    index("knesset_votes_date_idx").on(t.voteDate),
    index("knesset_votes_item_idx").on(t.itemId),
    index("knesset_votes_bill_idx").on(t.billId),
    index("knesset_votes_featured_idx").on(t.voteDate).where(sql`${t.featured} = true`),
  ],
);

// Verified per-MK attribution. Rows enter ONLY via mk_name_mappings exact-match
// (see mk_votes_raw for the evidence trail). factionId is faction-AT-VOTE-TIME,
// resolved from faction_stints intervals — MKs switch factions mid-term.
export const mkVotes = pgTable(
  "mk_votes",
  {
    voteId: integer("voteId").notNull(),               // -> knesset_votes.voteId
    personId: integer("personId").notNull(),           // -> politicians.personId
    result: mkVoteResult("result").notNull(),
    factionId: integer("factionId"),                   // -> factions.factionId; null = no covering stint (logged)
    sourceDataset: text("sourceDataset").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.voteId, t.personId] }),
    index("mk_votes_person_idx").on(t.personId),       // politician voting-record reads
  ],
);

// Raw VoteDetails evidence — EVERY row lands here verbatim before (and regardless
// of) attribution, so resolving a queued name backfills mk_votes from retained
// data without re-fetching the API.
export const mkVotesRaw = pgTable(
  "mk_votes_raw",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    voteId: integer("voteId").notNull(),
    mkNameRaw: text("mkNameRaw").notNull(),            // VoteDetails.MkName verbatim ("Last First")
    mkNameKey: text("mkNameKey").notNull(),            // canonical token-sorted key (app/lib/votes/name-key.ts)
    factionNameRaw: text("factionNameRaw"),            // display/cross-check only — never joined on
    voteResultIdRaw: integer("voteResultIdRaw").notNull(),
    resultTitleRaw: text("resultTitleRaw").notNull(),
    sourceDataset: text("sourceDataset").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
  },
  (t) => [
    unique("mk_votes_raw_vote_name_uq").on(t.voteId, t.mkNameKey),
    index("mk_votes_raw_name_idx").on(t.mkNameKey),
  ],
);

// The human-verified attribution map: canonical name key -> personId. Seeded by
// scripts/bootstrap-mk-mapping.ts from the id crosswalk (MksDropDown ↔ Open
// Knesset mk_individual.csv ↔ PersonID), then admin-extended via the queue.
// Many keys may map to one person (aliases); a key maps to exactly one person.
export const mkNameMappings = pgTable("mk_name_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  nameKey: text("nameKey").notNull().unique(),
  personId: integer("personId").notNull(),             // -> politicians.personId
  source: text("source", { enum: ["crosswalk", "admin"] }).notNull(),
  verifiedAt: timestamp("verifiedAt"),                 // human sign-off timestamp (P0-2 gate)
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

// Review queue for VoteDetails names with no mapping (modeled on marketSuggestions:
// status enum + reviewedBy/reviewedAt, terminal once reviewed). One row per
// canonical key; occurrences live in mk_votes_raw. Dismissed keys never re-queue.
export const unmappedMkNames = pgTable("unmapped_mk_names", {
  id: uuid("id").primaryKey().defaultRandom(),
  nameKey: text("nameKey").notNull().unique(),
  nameRaw: text("nameRaw").notNull(),                  // first-seen verbatim form
  status: mappingStatus("status").notNull().default("pending"),
  resolvedPersonId: integer("resolvedPersonId"),       // set when status = resolved
  reviewedBy: text("reviewedBy").references(() => users.id),
  reviewedAt: timestamp("reviewedAt"),
  firstSeenAt: timestamp("firstSeenAt").notNull().defaultNow(),
});

// Official faction-membership intervals (KNS_PersonToPosition, PositionID 54) —
// the faction-at-vote-time source. A vote dated inside [startDate, finishDate)
// attributes to that stint's faction.
export const factionStints = pgTable(
  "faction_stints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personToPositionId: integer("personToPositionId").notNull().unique(), // stable KNS id
    personId: integer("personId").notNull(),
    factionId: integer("factionId").notNull(),
    knessetNum: integer("knessetNum").notNull(),
    startDate: timestamp("startDate").notNull(),
    finishDate: timestamp("finishDate"),               // null = ongoing
    sourceDataset: text("sourceDataset").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
  },
  (t) => [index("faction_stints_person_idx").on(t.personId)],
);

// A user's civic position on a vote. Free (no coins), private (k-anonymous
// aggregates only), removable (tap selected stance again = DELETE), and gone
// with the account (cascade). Sensitive data — direction never leaves the DB.
export const userStances = pgTable(
  "user_stances",
  {
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    voteId: integer("voteId").notNull(),               // -> knesset_votes.voteId (decisive votes only, enforced in service)
    stance: userStance("stance").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.voteId] }),
    index("user_stances_vote_idx").on(t.voteId),       // community-aggregate scans
  ],
);

// One row per ingest job — the staleness signal for user-visible freshness.
// max(fetchedAt) can't serve this: the incremental sweep only re-stamps rows
// inside its 7-day window, so during a Knesset recess it freezes and a HEALTHY
// pipeline would show a false "broken" banner (and a broken one could hide
// behind old data). The heartbeat tracks the RUN, not the rows.
export const ingestHeartbeats = pgTable("ingest_heartbeats", {
  job: text("job").primaryKey(),                       // e.g. 'votes'
  lastSuccessAt: timestamp("lastSuccessAt").notNull(),
});

// Upcoming/announced plenum items (v1: read-only list; admin-curated + future
// ingest). Admin-authored rows have no Knesset itemId and carry
// sourceDataset='admin' + the admin route as sourceUrl.
export const agendaItems = pgTable("agenda_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: integer("itemId").unique(),                  // KNS item id; null for admin-added rows
  titleHe: text("titleHe").notNull(),
  expectedDate: date("expectedDate"),
  billId: integer("billId"),                           // -> bills.billId (FK-by-value); UNWIRED until P1 pre-voting (spec P1)
  status: agendaItemStatus("status").notNull().default("announced"),
  addedBy: agendaItemSource("addedBy").notNull(),
  linkedVoteId: integer("linkedVoteId"),               // -> knesset_votes.voteId; UNWIRED until P1 pre-voting (spec P1)
  sourceDataset: text("sourceDataset").notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  fetchedAt: timestamp("fetchedAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

import {
  pgTable, text, timestamp, uuid, index, primaryKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { users, markets } from "./schema";

// ===================================================================
// Prediction Duels P1 — persistence (spec: docs/superpowers/specs/
// 2026-06-18-prediction-duels.md).
//
// A "duel" is a single-bet head-to-head challenge shared by link. P0 was a
// STATELESS token; P1 persists the challenge so we can track WHO joined
// (multi-participant standings) and later notify on settlement.
//
// No new prediction store and no scoring writer: a duel pick IS a normal `bets`
// upsert (makePrediction), and standings are DERIVED from bets vs
// markets.resolvedOutcomeId. The challenger's pick is read live from their
// `bets` row — never duplicated here (picks change until close).
//
// FK thunks `(): AnyPgColumn => …` keep the import cycle with ./schema safe
// (mirrors schema-groups.ts / schema-votes.ts).
// ===================================================================

export const challenges = pgTable(
  "challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Opaque, url-safe id for /duel/[token] (NOT a guessable sequential id).
    // Generated via node:crypto, retried on the rare unique clash.
    token: text("token").notNull().unique(),
    challengerUserId: text("challengerUserId").notNull().references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    // The single market this duel is fought over. Global markets only — a group
    // motion is never shareable as an open duel (keeps the groups sandbox intact).
    marketId: uuid("marketId").notNull().references((): AnyPgColumn => markets.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    // "my challenges" list / cleanup by challenger.
    index("challenges_challenger_idx").on(t.challengerUserId),
  ],
);

export const challengeParticipants = pgTable(
  "challenge_participants",
  {
    challengeId: uuid("challengeId").notNull().references((): AnyPgColumn => challenges.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joinedAt").notNull().defaultNow(),
  },
  (t) => [
    // One row per (challenge, user) — accepting twice is idempotent. The
    // challengeId-leading PK also backs the standings/participant scan.
    primaryKey({ columns: [t.challengeId, t.userId] }),
    // "duels I've joined".
    index("challenge_participants_user_idx").on(t.userId),
  ],
);

import {
  pgTable, text, timestamp, integer, uuid, pgEnum, index, primaryKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

// ===================================================================
// Groups / קואליציה (spec: docs/superpowers/specs/
// 2026-06-14-groups-coalitions-design.md).
//
// A group is a private, invite-only prediction club — its own auto-published
// הצעות לסדר (markets carrying markets.groupId), its own SANDBOXED scoreboard
// (the groupWins/groupResolved counters below — they NEVER touch the global
// users.totalWins/totalResolved, card progress, or seasons), and its own מליאה
// discussion. Membership is many-per-user; the active board excludes `left` rows.
//
// DB names stay neutral (`groups`/`group_members`) to avoid colliding with the
// political `factions` table and the קואליציה market *category* (lib/categories);
// the Hebrew UI label is still קואליציה.
//
// FK thunks `() => users.id` keep the import cycle with ./schema safe (mirrors
// schema-votes.ts) — the closures defer value access past module-eval.
// ===================================================================

export const groupMemberRole = pgEnum("group_member_role", ["owner", "admin", "member"]);
// `left` freezes a member's counters and drops them from the active board;
// re-joining flips the same row back to `active`, restoring the frozen tally.
export const groupMemberStatus = pgEnum("group_member_status", ["active", "left"]);

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Short, opaque, url-safe id for /g/[slug] — NOT the Hebrew name (Hebrew can't
  // go in a URL). Generated via node:crypto, retried on the rare unique clash.
  slug: text("slug").notNull().unique(),
  nameHe: text("nameHe").notNull(),
  descriptionHe: text("descriptionHe"),
  emblem: text("emblem"),                 // emoji or token; cosmetic
  colorToken: text("colorToken"),         // an OKLCH design-token name, never hex
  // Explicit AnyPgColumn return type breaks the cross-file TS inference cycle
  // (schema ↔ schema-groups) — runtime is fine; only the type needs the hint.
  ownerId: text("ownerId").notNull().references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  // Rotatable shareable join secret; powers /g/join/[code]. Any member may share.
  inviteCode: text("inviteCode").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("groupId").notNull().references((): AnyPgColumn => groups.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    role: groupMemberRole("role").notNull().default("member"),
    status: groupMemberStatus("status").notNull().default("active"),
    // SANDBOXED prediction record, scoped to THIS group's motions only. Bumped in
    // resolveGroupMotion's tx; the group scoreboard ranks active members by these.
    groupWins: integer("groupWins").notNull().default(0),
    groupResolved: integer("groupResolved").notNull().default(0),
    joinedAt: timestamp("joinedAt").notNull().defaultNow(),
  },
  (t) => [
    // One row per (group, user); rejoin restores it (no duplicate membership).
    primaryKey({ columns: [t.groupId, t.userId] }),
    // Scoreboard ranking scan within a group.
    index("group_members_board_idx").on(t.groupId, t.groupWins),
    // "my groups" / the header switcher.
    index("group_members_user_idx").on(t.userId),
  ],
);

// Phase 2 — per-member opt-in to SHARE their Knesset-vote stances inside ONE
// group, for discussion (not scored). PRESENCE = opted-in, DELETE = opted-out.
// This is the ONLY carve-out from the "stance direction never leaves the DB"
// invariant: a direction is revealed to a fellow member only when BOTH that
// member and the viewer have a consent row here AND both are active members
// (see groups/stance-consent-repo getGroupVoteStances + docs/decisions/
// groups-stances.md). Both FKs cascade — consent dies with the account AND the
// group; an account/group delete revokes the waiver automatically.
export const groupStanceConsent = pgTable(
  "group_stance_consent",
  {
    groupId: uuid("groupId").notNull().references((): AnyPgColumn => groups.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    consentedAt: timestamp("consentedAt").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    index("group_stance_consent_user_idx").on(t.userId),
  ],
);

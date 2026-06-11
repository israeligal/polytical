import { logger } from "@/app/lib/logger";

// Minimal server-side analytics shim (P0-10): structured, greppable
// `analytics.<event>` log lines, re-pointable to a real vendor later (the
// repo has none — PRD says "vendor TBD"). PRIVACY INVARIANT: stance events
// carry voteId ONLY, never the stance direction — political positions never
// leave the database (spec P0-9).

export type AnalyticsEvent =
  | "feed_viewed"
  | "motion_viewed"
  | "stance_cast"
  | "match_unlocked"
  | "match_viewed";

export function track(event: AnalyticsEvent, meta?: Record<string, string | number | boolean>): void {
  logger.info(`analytics.${event}`, meta);
}

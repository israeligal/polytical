import { eq, isNull, type SQL } from "drizzle-orm";
import { markets } from "@/app/lib/schema";

/**
 * The audience-scope predicate for a market read.
 *
 * `markets.groupId` is the audience spine: a NULL groupId is a national (ארצי)
 * market; a set groupId is a קואליציה motion. Before the global-context redesign
 * every global read hard-coded `isNull(markets.groupId)`; now the display reads
 * take an active-coalition `groupId` and scope to it, falling back to the
 * national feed when none is active.
 *
 *   - `groupId === null`  → `isNull(markets.groupId)`  (national feed — unchanged)
 *   - `groupId === <uuid>` → `eq(markets.groupId, <uuid>)` (that coalition's motions)
 *
 * Sandbox/global-only reads (seasons, admin queue, closing-soon cron, the
 * "your prediction resolved" deck) keep `isNull(markets.groupId)` hard-coded and
 * do NOT call this helper — coalition picks never count globally.
 */
export function coalitionScope({ groupId }: { groupId: string | null }): SQL {
  return groupId ? eq(markets.groupId, groupId) : isNull(markets.groupId);
}

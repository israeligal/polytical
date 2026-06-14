"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { setStanceSharing } from "@/app/lib/groups/stance-service";
import { NotGroupMemberError } from "@/app/lib/errors";
import { logger } from "@/app/lib/logger";
import type { ActionResult } from "./types";

// Phase 2 — opt in/out of sharing your Knesset-vote stances inside a group.
// Hardened like app/actions/stances.ts: NO direction is ever logged (this
// action carries groupId only, never a voteId+stance), and a raw Drizzle error
// is NEVER rethrown (its message can embed bound params incl. a direction) — we
// log a sanitized marker and return a generic message.
export async function toggleGroupStanceSharingAction({
  groupId,
  slug,
  share,
}: {
  groupId: string;
  slug: string;
  share: boolean;
}): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו" };
  const limit = checkRateLimit({ key: `group-stance-share:${s.user.id}`, max: 20, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע ונסו שוב" };
  try {
    await setStanceSharing({ userId: s.user.id, groupId, share });
  } catch (e) {
    if (e instanceof NotGroupMemberError) return { ok: false, message: "אינכם חברים בקואליציה הזו" };
    logger.error("group_stance.toggle_failed", { groupId, errName: e instanceof Error ? e.name : "unknown" });
    return { ok: false, message: "אירעה שגיאה — נסו שוב" };
  }
  revalidatePath(`/g/${slug}`);
  return { ok: true, message: share ? "העמדות שלכם משותפות בקואליציה" : "הפסקתם לשתף עמדות" };
}

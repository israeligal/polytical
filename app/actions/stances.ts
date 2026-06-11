"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { setStance, MATCH_UNLOCK_THRESHOLD, type StanceState } from "@/app/lib/stances/service";
import type { StanceValue } from "@/app/lib/stances/repo";
import { VoteNotFoundError, VoteNotStanceableError } from "@/app/lib/errors";
import { track } from "@/app/lib/track";

export type StanceActionResult =
  | ({ ok: true } & StanceState & { unlockThreshold: number })
  | { ok: false; message?: string };

/** Sets / flips / retracts the caller's stance (עמדה) on a decisive vote. */
export async function setStanceAction({
  voteId,
  stance,
}: {
  voteId: number;
  stance: StanceValue;
}): Promise<StanceActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו כדי לקבוע עמדה" };
  // Generous cap to stop rapid toggle-spam (the write itself is idempotent).
  const limit = checkRateLimit({ key: `stance:${s.user.id}`, max: 40, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע" };
  if (stance !== "for" && stance !== "against") return { ok: false, message: "עמדה לא חוקית" };

  try {
    const state = await setStance({ userId: s.user.id, voteId, stance });
    // PRIVACY: voteId only — the stance direction never leaves the DB (P0-9).
    track("stance_cast", { voteId });
    if (state.scoreableCount === MATCH_UNLOCK_THRESHOLD && state.stance != null) {
      track("match_unlocked", {});
    }
    revalidatePath(`/vote/${voteId}`);
    revalidatePath("/votes");
    revalidatePath("/my-match");
    return { ok: true, ...state, unlockThreshold: MATCH_UNLOCK_THRESHOLD };
  } catch (e) {
    if (e instanceof VoteNotFoundError) return { ok: false, message: "ההצבעה לא נמצאה" };
    if (e instanceof VoteNotStanceableError) return { ok: false, message: "אפשר לקבוע עמדה רק על ההצבעה המכריעה של ההצעה" };
    throw e;
  }
}

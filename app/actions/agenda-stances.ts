"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { setAgendaStance, type AgendaStanceState } from "@/app/lib/agenda-stances/service";
import type { StanceValue } from "@/app/lib/stances/repo";
import { AgendaItemNotFoundError, AgendaItemNotStanceableError } from "@/app/lib/errors";
import { track } from "@/app/lib/track";
import { logger } from "@/app/lib/logger";

export type AgendaStanceActionResult =
  | ({ ok: true } & AgendaStanceState)
  | { ok: false; message?: string };

/** Sets / flips / retracts the caller's pre-vote stance (עמדה מראש) on an
 *  announced agenda item. `billId` is passed only to revalidate the bill page. */
export async function setAgendaStanceAction({
  agendaItemId,
  billId,
  stance,
}: {
  agendaItemId: string;
  billId?: number;
  stance: StanceValue;
}): Promise<AgendaStanceActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו כדי לקבוע עמדה" };
  const limit = checkRateLimit({ key: `agenda-stance:${s.user.id}`, max: 40, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע" };
  if (stance !== "for" && stance !== "against") return { ok: false, message: "עמדה לא חוקית" };

  try {
    const state = await setAgendaStance({ userId: s.user.id, agendaItemId, stance });
    // PRIVACY: agendaItemId only — the stance direction never leaves the DB.
    track("agenda_stance_cast", { agendaItemId });
    revalidatePath("/agenda");
    if (typeof billId === "number") revalidatePath(`/bill/${billId}`);
    return { ok: true, ...state };
  } catch (e) {
    if (e instanceof AgendaItemNotFoundError) return { ok: false, message: "הפריט לא נמצא" };
    if (e instanceof AgendaItemNotStanceableError) return { ok: false, message: "ההצבעה כבר התקיימה — אי אפשר לשנות עמדה" };
    // NEVER rethrow: a DrizzleQueryError embeds the bound stance direction in its
    // message — log a sanitized marker and fail gracefully (privacy).
    logger.error("agenda_stance_action_failed", { agendaItemId, errName: e instanceof Error ? e.name : "unknown" });
    return { ok: false, message: "אירעה שגיאה — נסו שוב" };
  }
}

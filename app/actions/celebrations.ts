"use server";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { acknowledgeCelebrations } from "@/app/lib/bets/service";

type ActionResult = { ok: boolean };

/** Marks resolved predictions as seen so their right/wrong reveal fires only once. */
export async function markPredictionsSeenAction({ predictionIds }: { predictionIds: string[] }): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false };
  const limit = checkRateLimit({ key: `seen:${s.user.id}`, max: 60, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false };
  await acknowledgeCelebrations({ userId: s.user.id, predictionIds });
  return { ok: true };
}

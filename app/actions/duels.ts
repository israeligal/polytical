"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { createChallenge, joinDuel } from "@/app/lib/duels/service";
import {
  InvalidOutcomeError,
  MarketClosedError,
  MarketNotFoundError,
  NotDuelableMarketError,
} from "@/app/lib/errors";
import type { ActionResult } from "@/app/actions/types";

/** Mint a single-bet duel over a global market and return its share path. */
export async function createChallengeAction({
  marketId,
}: {
  marketId: string;
}): Promise<ActionResult & { href?: string }> {
  const session = await getSession();
  if (!session?.user) return { ok: false, message: "התחברו כדי לאתגר חבר" };
  const limit = checkRateLimit({ key: `duel-create:${session.user.id}`, max: 20, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, message: "יותר מדי אתגרים — האטו לרגע" };
  try {
    const { token } = await createChallenge({ challengerUserId: session.user.id, marketId });
    return { ok: true, href: `/duel/${token}` };
  } catch (e) {
    if (e instanceof MarketNotFoundError) return { ok: false, message: "התחזית לא נמצאה" };
    if (e instanceof NotDuelableMarketError) return { ok: false, message: "אי אפשר לאתגר על הצעה קבוצתית" };
    if (e instanceof MarketClosedError) return { ok: false, message: "התחזית סגורה — אי אפשר לאתגר עליה" };
    throw e;
  }
}

/** Accept a duel: record (or change) the viewer's pick + their participation. */
export async function joinDuelAction({
  token,
  outcomeId,
}: {
  token: string;
  outcomeId: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.user) return { ok: false, message: "התחברו כדי לתת מנדט" };
  const limit = checkRateLimit({ key: `duel-join:${session.user.id}`, max: 30, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, message: "יותר מדי תחזיות — האטו לרגע" };
  try {
    await joinDuel({ token, userId: session.user.id, outcomeId });
    revalidatePath(`/duel/${token}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof MarketClosedError) return { ok: false, message: "התחזית סגורה" };
    if (e instanceof MarketNotFoundError) return { ok: false, message: "הדו-קרב לא נמצא" };
    if (e instanceof InvalidOutcomeError) return { ok: false, message: "בחירה לא תקפה" };
    throw e;
  }
}

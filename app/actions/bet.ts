"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { makePrediction } from "@/app/lib/markets/service";
import { MarketClosedError } from "@/app/lib/errors";

/** Server action: record (or change) the signed-in user's prediction on a market.
 *  Stake-less — one pick per market, changeable until close. Returns a
 *  `{ ok, message? }` result the client panel renders; only unexpected errors
 *  throw (surface as a server error). */
export async function makePredictionAction({
  marketId,
  outcomeId,
}: {
  marketId: string;
  outcomeId: string;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await getSession();
  if (!session?.user) return { ok: false, message: "התחברו כדי לנחש" };
  // Anti-abuse throttle (generous — active predictors won't hit it).
  const limit = checkRateLimit({ key: `predict:${session.user.id}`, max: 30, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, message: "יותר מדי תחזיות — האטו לרגע" };
  try {
    await makePrediction({ userId: session.user.id, marketId, outcomeId });
    revalidatePath(`/market/${marketId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof MarketClosedError) return { ok: false, message: "השוק סגור" };
    throw e;
  }
}

"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { placeBet } from "@/app/lib/markets/service";
import { BelowMinBetError, InsufficientFundsError, MarketClosedError } from "@/app/lib/errors";

/** Server action: place a parimutuel bet for the signed-in user.
 *  All coin movement runs through `placeBet` → `applyEntry` (the authoritative
 *  writer). Returns a `{ ok, message? }` result the client panel renders; only
 *  unexpected errors throw (surface as a server error). */
export async function placeBetAction({
  marketId,
  outcomeId,
  amount,
}: {
  marketId: string;
  outcomeId: string;
  amount: number;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await getSession();
  if (!session?.user) return { ok: false, message: "התחברו כדי להמר" };
  // Anti-abuse throttle (generous — active bettors won't hit it). The balance
  // invariant is enforced in placeBet regardless; this just caps request spam.
  const limit = checkRateLimit({ key: `bet:${session.user.id}`, max: 30, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, message: "יותר מדי הימורים — האטו לרגע" };
  try {
    await placeBet({ userId: session.user.id, marketId, outcomeId, amount });
    revalidatePath(`/market/${marketId}`);
    revalidatePath("/", "layout"); // balance pill in the shared header
    return { ok: true };
  } catch (e) {
    if (e instanceof InsufficientFundsError) return { ok: false, message: "אין מספיק מטבעות" };
    if (e instanceof BelowMinBetError) return { ok: false, message: "הסכום נמוך מהמינימום (10)" };
    if (e instanceof MarketClosedError) return { ok: false, message: "השוק סגור" };
    throw e;
  }
}

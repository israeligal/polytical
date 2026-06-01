"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
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

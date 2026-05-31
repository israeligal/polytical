"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { claimDailyFaucet } from "@/app/lib/ledger/service";
import { FaucetCooldownError } from "@/app/lib/errors";

export async function claimFaucetAction(): Promise<{ ok: boolean; message?: string }> {
  const session = await getSession();
  if (!session?.user) return { ok: false, message: "התחברו כדי לקבל מטבעות" };
  try {
    await claimDailyFaucet({ userId: session.user.id });
    // The balance lives in <SiteHeader/>, now rendered by the root layout on
    // every route. Revalidate the layout so the header refreshes wherever the
    // faucet is claimed — not just on "/".
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof FaucetCooldownError) return { ok: false, message: "כבר קיבלתם היום — חזרו מחר" };
    throw e;
  }
}

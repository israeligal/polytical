"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { collectCard } from "@/app/lib/cards/service";
import { AlreadyOwnedError, InsufficientFundsError, UnknownPoliticianError } from "@/app/lib/errors";

type ActionResult = { ok: boolean; message?: string };

/** Collects a politician's card for COLLECT_COST coins. Session-gated +
 *  rate-limited; errors map to Hebrew (never a silent fallback). */
export async function collectCardAction({
  personId,
}: {
  personId: number;
}): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו כדי לאסוף קלפים" };
  if (!Number.isInteger(personId)) return { ok: false, message: "קלף לא תקין" };

  const limit = checkRateLimit({ key: `collect:${s.user.id}`, max: 20, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע" };

  try {
    await collectCard({ userId: s.user.id, personId });
  } catch (e) {
    if (e instanceof InsufficientFundsError) return { ok: false, message: "אין מספיק שקוינים לאיסוף הקלף" };
    if (e instanceof AlreadyOwnedError) return { ok: false, message: "הקלף כבר באוסף שלכם" };
    if (e instanceof UnknownPoliticianError) return { ok: false, message: "הפוליטיקאי אינו קיים" };
    throw e;
  }
  revalidatePath(`/politician/${personId}`);
  revalidatePath("/collection");
  revalidatePath("/", "layout"); // balance in the header
  return { ok: true, message: "הקלף נאסף!" };
}

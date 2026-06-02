"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { claimTier, createSeason, endSeason } from "@/app/lib/seasons/service";
import {
  AlreadyClaimedError,
  AnotherSeasonActiveError,
  InvalidSeasonError,
  NoActiveSeasonError,
  SeasonEndedError,
  SeasonNotFoundError,
  TierNotFoundError,
  TierNotReachedError,
} from "@/app/lib/errors";

type ActionResult = { ok: boolean; message?: string };

/** A logged-in user claims a reached tier. Session-gated + rate-limited. */
export async function claimTierAction({ tierId }: { tierId: string }): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו כדי לתבוע פרס" };

  const limit = checkRateLimit({ key: `season-claim:${s.user.id}`, max: 20, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע" };

  try {
    await claimTier({ userId: s.user.id, tierId });
  } catch (e) {
    if (e instanceof AlreadyClaimedError) return { ok: false, message: "כבר תבעתם את הפרס הזה" };
    if (e instanceof TierNotReachedError) return { ok: false, message: "עוד לא הגעתם ליעד של הדרגה הזו" };
    if (e instanceof SeasonEndedError) return { ok: false, message: "העונה הסתיימה" };
    if (e instanceof TierNotFoundError) return { ok: false, message: "הדרגה לא נמצאה" };
    if (e instanceof SeasonNotFoundError) return { ok: false, message: "העונה לא נמצאה" };
    throw e;
  }
  revalidatePath("/seasons");
  revalidatePath("/", "layout"); // balance in the header
  return { ok: true, message: "הפרס נתבע!" };
}

/** Admin creates a new active season with tiers. Re-checks isAdmin server-side. */
export async function createSeasonAction({
  nameHe,
  startAt,
  endAt,
  tiers,
}: {
  nameHe: string;
  startAt: string;
  endAt: string;
  tiers: { nameHe: string; goalAmount: number; rewardAmount: number }[];
}): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user?.isAdmin) return { ok: false, message: "להנהלה בלבד" };

  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return { ok: false, message: "תאריכים לא תקינים" };

  try {
    await createSeason({ nameHe, startAt: start, endAt: end, tiers });
  } catch (e) {
    if (e instanceof AnotherSeasonActiveError) return { ok: false, message: "כבר קיימת עונה פעילה — סיימו אותה קודם" };
    if (e instanceof InvalidSeasonError) return { ok: false, message: "הגדרת העונה לא תקינה (יעדים עולים, פרסים חיוביים)" };
    throw e;
  }
  revalidatePath("/seasons");
  revalidatePath("/admin");
  return { ok: true, message: "העונה נוצרה" };
}

/** Admin ends the active season (or a given seasonId). */
export async function endSeasonAction({ seasonId }: { seasonId?: string } = {}): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user?.isAdmin) return { ok: false, message: "להנהלה בלבד" };
  try {
    await endSeason({ seasonId });
  } catch (e) {
    if (e instanceof NoActiveSeasonError) return { ok: false, message: "אין עונה פעילה" };
    if (e instanceof SeasonNotFoundError) return { ok: false, message: "העונה לא נמצאה" };
    if (e instanceof SeasonEndedError) return { ok: false, message: "העונה כבר הסתיימה" };
    throw e;
  }
  revalidatePath("/seasons");
  revalidatePath("/admin");
  return { ok: true, message: "העונה הסתיימה" };
}

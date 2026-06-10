"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { createSeason, endSeason } from "@/app/lib/seasons/service";
import {
  AnotherSeasonActiveError,
  InvalidSeasonError,
  NoActiveSeasonError,
  SeasonEndedError,
  SeasonNotFoundError,
} from "@/app/lib/errors";

type ActionResult = { ok: boolean; message?: string };

/** Admin creates a new active season with accuracy tiers. Re-checks isAdmin server-side. */
export async function createSeasonAction({
  nameHe,
  startAt,
  endAt,
  tiers,
}: {
  nameHe: string;
  startAt: string;
  endAt: string;
  tiers: { nameHe: string; goalCorrect: number }[];
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
    if (e instanceof InvalidSeasonError) return { ok: false, message: "הגדרת העונה לא תקינה (יעדים עולים, חיוביים)" };
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

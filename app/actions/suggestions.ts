"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import {
  createSuggestion,
  approveSuggestion,
  rejectSuggestion,
} from "@/app/lib/suggestions/service";
import {
  AlreadyReviewedError,
  ClosePastError,
  CloseRequiredError,
  CloseTooFarError,
  InvalidCategoryError,
  SourceNoteTooLongError,
  SuggestionNotFoundError,
  SuggestionTooLongError,
  SuggestionTooShortError,
  UnknownPoliticianError,
} from "@/app/lib/errors";
import type { ActionResult } from "./types";

// Community suggestion actions. The proposer endpoint is session-gated AND
// rate-limited (Better Auth's limiter can't see a Server Action). The review
// endpoints re-check isAdmin server-side — the /admin route gate is not the
// authoritative boundary since actions can be POSTed directly.

/** A logged-in user proposes a market. Rate-limited per user. */
export async function suggestMarketAction({
  questionHe,
  category,
  personId,
  proposedCloseAt,
  resolutionSourceNote,
}: {
  questionHe: string;
  category: string;
  personId?: number | null;
  proposedCloseAt: string;
  resolutionSourceNote?: string | null;
}): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו כדי להציע תחזית" };

  const limit = checkRateLimit({ key: `suggest:${s.user.id}`, max: 5, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    const mins = Math.ceil(limit.retryAfterMs / 60000);
    return { ok: false, message: `יותר מדי הצעות — נסו שוב בעוד ${mins} דקות` };
  }

  // The service rejects NaN/past/too-far — no duplicate checks here.
  const close = new Date(proposedCloseAt);

  try {
    await createSuggestion({
      userId: s.user.id,
      questionHe,
      category,
      personId: personId ?? null,
      proposedCloseAt: close,
      resolutionSourceNote: resolutionSourceNote ?? null,
    });
  } catch (e) {
    if (e instanceof SuggestionTooShortError) return { ok: false, message: "ההצעה קצרה מדי (לפחות 10 תווים)" };
    if (e instanceof SuggestionTooLongError) return { ok: false, message: "ההצעה ארוכה מדי (עד 200 תווים)" };
    if (e instanceof InvalidCategoryError) return { ok: false, message: "קטגוריה לא תקינה" };
    if (e instanceof UnknownPoliticianError) return { ok: false, message: "הפוליטיקאי שנבחר אינו קיים" };
    if (e instanceof CloseRequiredError) return { ok: false, message: "בחרו תאריך הכרעה" };
    if (e instanceof ClosePastError) return { ok: false, message: "תאריך ההכרעה חייב להיות בעתיד" };
    if (e instanceof CloseTooFarError) return { ok: false, message: "תאריך ההכרעה רחוק מדי (עד שנתיים קדימה)" };
    if (e instanceof SourceNoteTooLongError) return { ok: false, message: "מקור ההכרעה ארוך מדי (עד 300 תווים)" };
    throw e;
  }
  revalidatePath("/profile");
  revalidatePath("/admin");
  return { ok: true, message: "ההצעה לסדר הוגשה — תודה!" };
}

/** Admin approves a pending suggestion; a real binary market is created + linked. */
export async function approveSuggestionAction({
  suggestionId,
  closeAt,
}: {
  suggestionId: string;
  closeAt: string;
}): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user?.isAdmin) return { ok: false, message: "להנהלה בלבד" };

  const close = new Date(closeAt);
  if (Number.isNaN(close.getTime())) return { ok: false, message: "מועד סגירה לא תקין" };

  try {
    await approveSuggestion({ suggestionId, reviewerId: s.user.id, closeAt: close });
  } catch (e) {
    if (e instanceof AlreadyReviewedError) return { ok: false, message: "ההצעה כבר טופלה" };
    if (e instanceof SuggestionNotFoundError) return { ok: false, message: "ההצעה לא נמצאה" };
    if (e instanceof ClosePastError) return { ok: false, message: "מועד הסגירה חייב להיות בעתיד" };
    throw e;
  }
  revalidatePath("/admin");
  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return { ok: true, message: "ההצעה אושרה והתחזית נפתחה" };
}

/** Admin rejects a pending suggestion with an optional note. */
export async function rejectSuggestionAction({
  suggestionId,
  note,
}: {
  suggestionId: string;
  note?: string;
}): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user?.isAdmin) return { ok: false, message: "להנהלה בלבד" };

  try {
    await rejectSuggestion({ suggestionId, reviewerId: s.user.id, note });
  } catch (e) {
    if (e instanceof AlreadyReviewedError) return { ok: false, message: "ההצעה כבר טופלה" };
    if (e instanceof SuggestionNotFoundError) return { ok: false, message: "ההצעה לא נמצאה" };
    throw e;
  }
  revalidatePath("/admin");
  revalidatePath("/profile");
  return { ok: true, message: "ההצעה נדחתה" };
}

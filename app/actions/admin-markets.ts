"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import * as repo from "@/app/lib/markets/repo";
import { resolveMarket, voidMarket } from "@/app/lib/markets/service";
import {
  AlreadyResolvedError,
  InvalidOutcomeError,
  MarketNotFoundError,
  NotAdminError,
} from "@/app/lib/errors";

// Admin-only server actions for the minimal market console (create / resolve /
// void). Each action independently re-checks the session and throws NotAdminError
// for non-admins — the `/admin` route is gated by proxy.ts, but server actions
// can be invoked directly, so this is the authoritative enforcement boundary.
//
// Coin movement on resolve/void happens inside the service (resolveMarket /
// voidMarket → applyEntry); these wrappers only authorize, parse the form input,
// and revalidate the affected pages.

type ActionResult = { ok: boolean; message?: string };

async function requireAdmin(): Promise<void> {
  const session = await getSession();
  if (!session?.user?.isAdmin) throw new NotAdminError();
}

/** A cited resolution source must be a real http(s) URL. Rejecting other schemes
 *  (e.g. `javascript:` / `data:`) at this write boundary stops a stored value
 *  from becoming an XSS vector when rendered as the "מקור ההכרעה" href on the
 *  public market page. */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Creates a market with its outcomes and featured MKs. `outcomeLabels` are the
 *  ordered outcome labels (≥2); `personIds` the featured MK personIds (optional).
 *  `closeAt` is an ISO/`datetime-local` string. */
export async function createMarketAction({
  questionHe,
  descriptionHe,
  category,
  type,
  hot,
  closeAt,
  outcomeLabels,
  personIds,
}: {
  questionHe: string;
  descriptionHe?: string;
  category: string;
  type: "binary" | "multi";
  hot: boolean;
  closeAt: string;
  outcomeLabels: string[];
  personIds: number[];
}): Promise<ActionResult> {
  await requireAdmin();

  const question = questionHe.trim();
  if (!question) return { ok: false, message: "חסרה שאלת שוק" };
  if (!category.trim()) return { ok: false, message: "חסרה קטגוריה" };

  const labels = outcomeLabels.map((l) => l.trim()).filter(Boolean);
  if (labels.length < 2) return { ok: false, message: "צריך לפחות שתי תוצאות" };

  const close = new Date(closeAt);
  if (Number.isNaN(close.getTime())) return { ok: false, message: "מועד סגירה לא תקין" };
  // A market is born `open` and nothing auto-closes it, so a past closeAt would
  // mint a market that can never accept a bet. Reject it at both creation paths.
  if (close.getTime() <= Date.now()) return { ok: false, message: "מועד הסגירה חייב להיות בעתיד" };

  const session = await getSession();

  await repo.createMarket({
    questionHe: question,
    descriptionHe: descriptionHe?.trim() || undefined,
    category: category.trim(),
    type,
    hot,
    closeAt: close,
    createdBy: session?.user?.id,
    // For multi markets, give each outcome a distinct categorical color slot so
    // the odds bar renders them in different colors; binary uses positive/negative.
    outcomes: labels.map((labelHe, i) => ({
      labelHe,
      cat: type === "multi" ? ((i % 8) + 1) : undefined,
      ordinal: i,
    })),
    personIds,
  });

  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return { ok: true, message: "השוק נוצר" };
}

/** Resolves a market to its winning outcome — settles every open bet via the
 *  parimutuel service (winners split the whole pot; if nobody bet the winning
 *  outcome, all bets are refunded). */
export async function resolveMarketAction({
  marketId,
  winningOutcomeId,
  sourceUrl,
  note,
}: {
  marketId: string;
  winningOutcomeId: string;
  sourceUrl?: string;
  note?: string;
}): Promise<ActionResult> {
  await requireAdmin();
  if (!winningOutcomeId) return { ok: false, message: "בחרו תוצאה זוכה" };
  const cleanedSourceUrl = sourceUrl?.trim() || undefined;
  if (cleanedSourceUrl && !isHttpUrl(cleanedSourceUrl)) {
    return { ok: false, message: "כתובת המקור חייבת להיות קישור http/https תקין" };
  }
  try {
    await resolveMarket({
      marketId,
      winningOutcomeId,
      sourceUrl: cleanedSourceUrl,
      note: note?.trim() || undefined,
    });
  } catch (e) {
    if (e instanceof AlreadyResolvedError) return { ok: false, message: "השוק כבר הוכרע או בוטל" };
    if (e instanceof InvalidOutcomeError) return { ok: false, message: "התוצאה אינה שייכת לשוק" };
    if (e instanceof MarketNotFoundError) return { ok: false, message: "השוק לא נמצא" };
    throw e;
  }
  revalidatePath("/admin");
  revalidatePath(`/market/${marketId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "השוק הוכרע וההימורים סולקו" };
}

/** Voids a market — refunds every open bet in full and marks it voided. */
export async function voidMarketAction({
  marketId,
}: {
  marketId: string;
}): Promise<ActionResult> {
  await requireAdmin();
  try {
    await voidMarket({ marketId });
  } catch (e) {
    if (e instanceof AlreadyResolvedError) return { ok: false, message: "השוק כבר הוכרע או בוטל" };
    if (e instanceof MarketNotFoundError) return { ok: false, message: "השוק לא נמצא" };
    throw e;
  }
  revalidatePath("/admin");
  revalidatePath(`/market/${marketId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "השוק בוטל וההימורים הוחזרו" };
}

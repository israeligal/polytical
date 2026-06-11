"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import type { MarketKind, OutcomeInput, PoliticianOption } from "@/lib/types";
import * as repo from "@/app/lib/markets/repo";
import { deleteMarket, resolveMarket, voidMarket } from "@/app/lib/markets/service";
import { MULTI_MAX_OUTCOMES, MULTI_MIN_OUTCOMES } from "@/app/lib/markets/constants";
import { getPoliticiansByPersonIds, searchPoliticians } from "@/app/lib/politicians/repo";
import { normalizeSearchName } from "@/app/lib/knesset/search-name";
import { MIN_QUERY_LEN } from "@/app/lib/search/service";
import { checkRateLimit } from "@/app/lib/rate-limit";
import {
  AlreadyResolvedError,
  InvalidOutcomeError,
  MarketNotFoundError,
  NotAdminError,
} from "@/app/lib/errors";

// Admin-only server actions for the minimal market console (create / resolve /
// void / delete). Each action independently re-checks the session and throws NotAdminError
// for non-admins — the `/admin` route is gated by proxy.ts, but server actions
// can be invoked directly, so this is the authoritative enforcement boundary.
//
// The right/wrong tally on resolve happens inside the service (resolveMarket /
// voidMarket); these wrappers only authorize, parse the form input, and
// revalidate the affected pages.

type ActionResult = { ok: boolean; message?: string };

/** Throws for non-admins; returns the session so callers don't re-fetch it. */
async function requireAdmin(): Promise<NonNullable<Awaited<ReturnType<typeof getSession>>>> {
  const session = await getSession();
  if (!session?.user?.isAdmin) throw new NotAdminError();
  return session;
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

/** Creates a market with its outcomes and featured MKs. Binary (כן/לא) takes
 *  exactly 2 outcome labels; multi (single-pick, many candidates) takes
 *  MULTI_MIN..MULTI_MAX outcomes, each optionally linked to the politician it
 *  IS (`personId` — drives the row portrait + resolve-time progress scoping).
 *  `personIds` are extra featured MKs (outcome-linked MKs are featured
 *  automatically by the repo); `closeAt` is an ISO/`datetime-local` string. */
export async function createMarketAction({
  questionHe,
  descriptionHe,
  category,
  hot,
  closeAt,
  type,
  outcomes,
  personIds,
}: {
  questionHe: string;
  descriptionHe?: string;
  category: string;
  hot: boolean;
  closeAt: string;
  type: MarketKind;
  outcomes: OutcomeInput[];
  personIds: number[];
}): Promise<ActionResult> {
  const session = await requireAdmin();

  const question = questionHe.trim();
  if (!question) return { ok: false, message: "חסרה שאלת תחזית" };
  if (!category.trim()) return { ok: false, message: "חסרה קטגוריה" };

  // Trim labels but DON'T silently drop empty rows — a blank label next to a
  // linked politician would shift personIds onto the wrong outcome. Outcome
  // links are a MULTI concept; binary outcomes never carry one (resolveMarket's
  // scoping branch must stay unreachable for binary markets).
  const cleaned = outcomes.map((o) => ({
    labelHe: o.labelHe.trim(),
    personId:
      type === "multi" && Number.isInteger(o.personId) && (o.personId as number) > 0
        ? o.personId
        : undefined,
  }));
  if (cleaned.some((o) => !o.labelHe)) return { ok: false, message: "יש תוצאה בלי תווית" };
  if (type === "binary" && cleaned.length !== 2)
    return { ok: false, message: "תחזית כן/לא צריכה בדיוק שתי תוצאות" };
  if (type === "multi" && (cleaned.length < MULTI_MIN_OUTCOMES || cleaned.length > MULTI_MAX_OUTCOMES))
    return {
      ok: false,
      message: `תחזית רב-ברירה צריכה בין ${MULTI_MIN_OUTCOMES} ל-${MULTI_MAX_OUTCOMES} תוצאות`,
    };

  // One politician = at most one candidate outcome, and every link must resolve
  // to a real politicians row by stable id (no FK in the schema — this action is
  // the existence boundary; a junk id would mint card progress for nobody).
  const linkedIds = cleaned.flatMap((o) => (o.personId != null ? [o.personId] : []));
  if (new Set(linkedIds).size !== linkedIds.length)
    return { ok: false, message: "אותו פוליטיקאי מקושר ליותר מתשובה אחת" };
  const allPersonIds = [...new Set([...linkedIds, ...personIds])];
  if (allPersonIds.length > 0) {
    const found = await getPoliticiansByPersonIds({ personIds: allPersonIds });
    if (found.length !== allPersonIds.length)
      return { ok: false, message: "פוליטיקאי מקושר לא נמצא במאגר" };
  }

  const close = new Date(closeAt);
  if (Number.isNaN(close.getTime())) return { ok: false, message: "מועד סגירה לא תקין" };
  // A market is born `open` and nothing auto-closes it, so a past closeAt would
  // mint a market that can never accept a bet. Reject it at both creation paths.
  if (close.getTime() <= Date.now()) return { ok: false, message: "מועד הסגירה חייב להיות בעתיד" };

  await repo.createMarket({
    questionHe: question,
    descriptionHe: descriptionHe?.trim() || undefined,
    category: category.trim(),
    type,
    hot,
    closeAt: close,
    createdBy: session.user.id,
    // Binary outcomes carry no categorical color slot — the odds bar renders
    // them as positive/negative. Multi outcomes get their slot by position.
    outcomes: cleaned.map((o, i) => ({
      labelHe: o.labelHe,
      ordinal: i,
      cat: type === "multi" ? i + 1 : undefined,
      personId: o.personId,
    })),
    personIds,
  });

  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return { ok: true, message: "התחזית נוצרה" };
}

/** Politician name autocomplete for the admin market form — discovery-only
 *  ILIKE over the normalized searchName (same normalization as the global
 *  search), resolving to the stable personId the form actually submits.
 *  Includes INACTIVE politicians: a candidate outcome can be a former MK/PM. */
export async function searchPoliticiansAction({
  q,
}: {
  q: string;
}): Promise<PoliticianOption[]> {
  const session = await requireAdmin();
  const limit = checkRateLimit({ key: `admin-mk-search:${session.user.id}`, max: 60, windowMs: 60_000 });
  if (!limit.allowed) return [];
  const normalized = normalizeSearchName(q);
  if (normalized.length < MIN_QUERY_LEN) return [];
  const rows = await searchPoliticians({ q: normalized, limit: 8, includeInactive: true });
  return rows.map((p) => ({ personId: p.personId, nameHe: p.nameHe, roleHe: p.roleHe }));
}

/** Resolves a market to its winning outcome — tallies right/wrong for every
 *  predictor and advances accuracy-based card unlocks (via the service). */
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
    if (e instanceof AlreadyResolvedError) return { ok: false, message: "התחזית כבר הוכרעה או בוטלה" };
    if (e instanceof InvalidOutcomeError) return { ok: false, message: "התוצאה אינה שייכת לתחזית" };
    if (e instanceof MarketNotFoundError) return { ok: false, message: "התחזית לא נמצאה" };
    throw e;
  }
  revalidatePath("/admin");
  revalidatePath(`/market/${marketId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "התחזית הוכרעה והניחושים סוכמו" };
}

/** Voids a market — marks it voided; predictions are left uncounted (no stakes). */
export async function voidMarketAction({
  marketId,
}: {
  marketId: string;
}): Promise<ActionResult> {
  await requireAdmin();
  try {
    await voidMarket({ marketId });
  } catch (e) {
    if (e instanceof AlreadyResolvedError) return { ok: false, message: "התחזית כבר הוכרעה או בוטלה" };
    if (e instanceof MarketNotFoundError) return { ok: false, message: "התחזית לא נמצאה" };
    throw e;
  }
  revalidatePath("/admin");
  revalidatePath(`/market/${marketId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "התחזית בוטלה" };
}

/** Hard-deletes an invalid market — predictions and comments cascade away,
 *  predictors are notified. Resolved markets are protected (stats already
 *  tallied); void is the right tool for those edge cases. */
export async function deleteMarketAction({
  marketId,
}: {
  marketId: string;
}): Promise<ActionResult> {
  await requireAdmin();
  try {
    await deleteMarket({ marketId });
  } catch (e) {
    if (e instanceof AlreadyResolvedError)
      return { ok: false, message: "אי אפשר למחוק תחזית שהוכרעה — התוצאות כבר נספרו" };
    if (e instanceof MarketNotFoundError) return { ok: false, message: "התחזית לא נמצאה" };
    throw e;
  }
  revalidatePath("/admin");
  revalidatePath(`/market/${marketId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "התחזית נמחקה לצמיתות" };
}

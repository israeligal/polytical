"use server";
import { revalidatePath } from "next/cache";
import { getSession, refreshSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { setHandle, checkHandleAvailable, completeOnboarding } from "@/app/lib/onboarding/service";
import {
  AlreadyOnboardedError,
  HandleRequiredError,
  HandleTakenError,
  InvalidArenaError,
  InvalidHandleError,
} from "@/app/lib/errors";

type ActionResult = { ok: boolean; message?: string };

// Onboarding is session-gated AND rate-limited — Better Auth's limiter can't
// see a Server Action. The /onboarding page also re-reads the gate from the DB,
// so a stale cookieCache can't bypass these.

/** Live handle availability for the wizard (does not mutate). */
export async function checkHandleAction({
  handle,
}: {
  handle: string;
}): Promise<{ available: boolean; reason?: "invalid" | "taken" }> {
  const s = await getSession();
  if (!s?.user) return { available: false, reason: "invalid" };
  // Generous — fires on (debounced) keystrokes.
  const limit = checkRateLimit({ key: `handle-check:${s.user.id}`, max: 40, windowMs: 60_000 });
  if (!limit.allowed) return { available: false, reason: "taken" };
  const res = await checkHandleAvailable({ userId: s.user.id, handle });
  return { available: res.available, reason: res.reason };
}

/** Claims the chosen handle. */
export async function setHandleAction({
  handle,
}: {
  handle: string;
}): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו" };
  const limit = checkRateLimit({ key: `handle-set:${s.user.id}`, max: 15, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע" };
  try {
    await setHandle({ userId: s.user.id, handle });
  } catch (e) {
    if (e instanceof InvalidHandleError) return { ok: false, message: "כינוי לא תקין — 3–20 תווים: a–z, 0–9, _" };
    if (e instanceof HandleTakenError) return { ok: false, message: "הכינוי תפוס — בחרו אחר" };
    throw e;
  }
  revalidatePath("/onboarding");
  return { ok: true };
}

/** Picks the arena and clears the onboarding gate. */
export async function completeOnboardingAction({
  arena,
}: {
  arena: string;
}): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו" };
  const limit = checkRateLimit({ key: `onboard:${s.user.id}`, max: 15, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע" };
  try {
    await completeOnboarding({ userId: s.user.id, arena });
  } catch (e) {
    if (e instanceof InvalidArenaError) return { ok: false, message: "בחרו תחום עניין מהרשימה" };
    if (e instanceof HandleRequiredError) return { ok: false, message: "בחרו קודם כינוי" };
    if (e instanceof AlreadyOnboardedError) return { ok: true }; // already done → let the client proceed
    throw e;
  }
  await refreshSession(); // re-issue the cookie so the proxy gate sees onboardedAt set (no redirect loop)
  revalidatePath("/", "layout"); // header + gate re-read on the new state
  return { ok: true };
}

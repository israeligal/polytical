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
}): Promise<{ available: boolean; reason?: "invalid" | "taken" | "rate_limited" }> {
  const s = await getSession();
  if (!s?.user) return { available: false, reason: "invalid" };
  // Generous — fires on (debounced) keystrokes. A throttle is NOT a "taken"
  // fact: report it distinctly so the wizard doesn't tell the user a free
  // handle is taken (it just couldn't verify right now).
  const limit = checkRateLimit({ key: `handle-check:${s.user.id}`, max: 40, windowMs: 60_000 });
  if (!limit.allowed) return { available: false, reason: "rate_limited" };
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
    if (e instanceof InvalidHandleError) return { ok: false, message: "כינוי לא תקין — 3–20 תווים בעברית או באנגלית (בלי לערבב): אותיות, ספרות ו-_" };
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
    if (e instanceof AlreadyOnboardedError) {
      // Already onboarded (terminal) — but THIS caller's cookie may still be
      // stale not-onboarded, which is exactly what would bounce them back to
      // /onboarding. Heal the cookie before letting the client proceed, same as
      // the success path.
      await refreshSession();
      revalidatePath("/", "layout");
      return { ok: true };
    }
    throw e;
  }
  await refreshSession(); // re-issue the cookie so the proxy gate sees onboardedAt set (no redirect loop)
  revalidatePath("/", "layout"); // header + gate re-read on the new state
  return { ok: true };
}

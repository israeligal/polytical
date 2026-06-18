"use server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./types";
import { getSession, refreshSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { setCaricature, clearCaricature } from "@/app/lib/users/caricature-service";
import { InvalidCaricatureError } from "@/app/lib/errors";

// Caricature avatar mutations. Session-gated + rate-limited (Better Auth's
// limiter can't see a Server Action). Like changeHandleAction, both re-issue the
// session cookie so the header + /profile reflect the new avatar immediately
// (the additionalField rides the ~5-min cookieCache otherwise).

/** Stores the user's uploaded caricature (base64 data URL) and sets it as their avatar. */
export async function setCaricatureAction({ dataUrl }: { dataUrl: string }): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו" };
  const limit = checkRateLimit({ key: `caricature:${s.user.id}`, max: 5, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע" };
  try {
    await setCaricature({ userId: s.user.id, dataUrl });
  } catch (e) {
    if (e instanceof InvalidCaricatureError)
      return { ok: false, message: "תמונה לא תקינה — נסו קובץ PNG/JPEG/WebP קטן יותר" };
    throw e;
  }
  await refreshSession(); // re-issue the cookie so session.user.caricatureUrl updates (header + profile)
  revalidatePath("/profile");
  revalidatePath("/", "layout"); // header avatar
  return { ok: true };
}

/** Removes the caricature — the avatar falls back to the handle initial. */
export async function clearCaricatureAction(): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו" };
  const limit = checkRateLimit({ key: `caricature:${s.user.id}`, max: 10, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע" };
  await clearCaricature({ userId: s.user.id });
  await refreshSession();
  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return { ok: true };
}

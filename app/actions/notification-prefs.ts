"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { setPushCategoryMuted } from "@/app/lib/notifications/prefs";
import { InvalidPushPrefError } from "@/app/lib/errors";

type ActionResult = { ok: boolean; message?: string; mutedPushTypes?: string[] };

/** Toggle one push-notification category for the signed-in user. `enabled` is the
 *  desired receive-state (on = receive) → stored as muted = !enabled. */
export async function setPushCategoryAction({
  category,
  enabled,
}: {
  category: string;
  enabled: boolean;
}): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו" };
  const limit = checkRateLimit({ key: `push-pref:${s.user.id}`, max: 30, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע" };
  try {
    const { mutedPushTypes } = await setPushCategoryMuted({
      userId: s.user.id,
      category,
      muted: !enabled,
    });
    revalidatePath("/profile");
    return { ok: true, mutedPushTypes };
  } catch (e) {
    if (e instanceof InvalidPushPrefError) return { ok: false, message: "קטגוריה לא תקינה" };
    throw e;
  }
}

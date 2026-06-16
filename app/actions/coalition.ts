"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { getMembership } from "@/app/lib/groups/repo";
import { COALITION_COOKIE, COALITION_NATIONAL, coalitionCookieOptions } from "@/app/lib/groups/context";
import { setActiveCoalitionSchema } from "@/app/lib/groups/schemas";
import type { ActionResult } from "./types";

/**
 * Set the active-coalition context the whole site scopes to. `groupId` selects a
 * coalition (the viewer must be an active member — a forged/foreign id is
 * rejected); `null` selects ארצי (national) and is stored as an explicit sentinel
 * so the choice sticks instead of re-seeding from the user's default on reload.
 *
 * Cookie-only (no session write): switching is cheap and frequent, and the read
 * path re-checks membership and heals a stale value to national, so we never
 * need a `refreshSession()` round-trip here. Revalidates the layout so the feed
 * below re-scopes.
 */
export async function setActiveCoalitionAction(input: {
  groupId: string | null;
}): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו" };

  const limit = checkRateLimit({ key: `coalition-switch:${s.user.id}`, max: 60, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע ונסו שוב" };

  const parsed = setActiveCoalitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "בקשה לא תקינה" };
  const { groupId } = parsed.data;

  const jar = await cookies();

  if (groupId === null) {
    jar.set(COALITION_COOKIE, COALITION_NATIONAL, coalitionCookieOptions);
  } else {
    // Only your own active coalition can become the active scope.
    const m = await getMembership({ groupId, userId: s.user.id });
    if (!m || m.status !== "active") return { ok: false, message: "אינכם חברים בקואליציה הזו" };
    jar.set(COALITION_COOKIE, groupId, coalitionCookieOptions);
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

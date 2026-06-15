import { cookies } from "next/headers";
import type { AppDb } from "@/app/lib/db-utils";
import { db as defaultDb } from "@/app/lib/db";
import { getMembership } from "./repo";

/**
 * The active-coalition context — which audience the whole site is currently
 * scoped to. Replaces the old `/g/[slug]` destination model: the header switcher
 * writes this cookie, and every display read scopes its feed to it.
 *
 * Cookie values:
 *   - absent           → not chosen yet; seed from the user's `defaultGroupId`
 *   - `COALITION_NATIONAL` → the user explicitly picked ארצי (national)
 *   - `<uuid>`         → that coalition is active
 *
 * The distinction between "absent" and "explicit national" matters: a member
 * with a default coalition lands scoped, but once they pick ארצי that choice
 * sticks instead of bouncing back to the default on the next load.
 */
export const COALITION_COOKIE = "polytical_coalition";
export const COALITION_NATIONAL = "national";

/**
 * Resolve the active coalition from a raw cookie value, healing stale state.
 * Pure of `next/headers` so the heal logic is testable without a request — the
 * cookie value is passed in. Returns the active coalition's id, or `null` for
 * the national feed.
 *
 * Heal: a cookie (or default) pointing at a group the user is no longer an
 * `active` member of (left / removed / deleted) resolves to `null` — the viewer
 * silently falls back to national rather than 404-ing or being trapped. (Reads
 * can't clear the cookie — that's read-only in an RSC; the `setActiveCoalition`
 * action clears it on the next switch.)
 */
export async function resolveActiveCoalition({
  db = defaultDb,
  userId,
  cookieValue,
  defaultGroupId,
}: {
  db?: AppDb;
  userId: string | null | undefined;
  cookieValue: string | undefined;
  defaultGroupId: string | null | undefined;
}): Promise<string | null> {
  if (!userId) return null; // anonymous → national

  let candidate: string | null;
  if (cookieValue === undefined) candidate = defaultGroupId ?? null; // not chosen → seed from default
  else if (cookieValue === COALITION_NATIONAL) candidate = null; // explicit national
  else candidate = cookieValue; // a coalition id

  if (!candidate) return null;

  const membership = await getMembership({ db, groupId: candidate, userId });
  return membership?.status === "active" ? candidate : null;
}

/**
 * The active coalition for the current request (or `null` for national). Thin
 * shell over {@link resolveActiveCoalition} that reads the cookie. Call from
 * RSCs / route handlers with the session's `userId` + `defaultGroupId`.
 */
export async function getActiveCoalition({
  db = defaultDb,
  userId,
  defaultGroupId,
}: {
  db?: AppDb;
  userId: string | null | undefined;
  defaultGroupId: string | null | undefined;
}): Promise<string | null> {
  const cookieValue = (await cookies()).get(COALITION_COOKIE)?.value;
  return resolveActiveCoalition({ db, userId, cookieValue, defaultGroupId });
}

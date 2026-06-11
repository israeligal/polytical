"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { markNotificationRead, markAllNotificationsRead } from "@/app/lib/notifications/service";
import { NotificationNotFoundError } from "@/app/lib/errors";
import type { ActionResult } from "./types";

export async function markNotificationReadAction({ id }: { id: string }): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו" };
  const limit = checkRateLimit({ key: `notif-read:${s.user.id}`, max: 60, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע" };
  try {
    await markNotificationRead({ userId: s.user.id, id });
  } catch (e) {
    if (e instanceof NotificationNotFoundError) return { ok: false };
    throw e;
  }
  revalidatePath("/notifications");
  revalidatePath("/", "layout"); // bell badge in the shared header
  return { ok: true };
}

export async function markAllReadAction(): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו" };
  await markAllNotificationsRead({ userId: s.user.id });
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true };
}

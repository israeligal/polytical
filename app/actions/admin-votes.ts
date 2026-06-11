"use server";

// Admin-only server actions for the votes domain: featured toggle, identity-
// queue resolution, agenda CRUD. Each action independently re-checks the
// session and throws NotAdminError — `/admin` is proxy-gated, but server
// actions can be invoked directly, so this is the authoritative enforcement
// boundary (the admin-markets precedent). No rate limits on admin actions.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { db } from "@/app/lib/db";
import { agendaItems, knessetVotes, politicians } from "@/app/lib/schema";
import { NotAdminError } from "@/app/lib/errors";
import { loadAttributionContext, resolveUnmappedName, dismissUnmappedName } from "@/app/lib/votes/repo";
import { logger } from "@/app/lib/logger";

type ActionResult = { ok: boolean; message?: string };

async function requireAdmin(): Promise<string> {
  const session = await getSession();
  if (!session?.user?.isAdmin) throw new NotAdminError();
  return session.user.id;
}

export async function toggleVoteFeaturedAction({
  voteId,
  featured,
}: { voteId: number; featured: boolean }): Promise<ActionResult> {
  await requireAdmin();
  await db.update(knessetVotes).set({ featured }).where(eq(knessetVotes.voteId, voteId));
  revalidatePath("/admin");
  revalidatePath("/votes");
  return { ok: true, message: featured ? "ההצבעה סומנה כמובילה" : "הסימון הוסר" };
}

export async function resolveUnmappedNameAction({
  nameKey,
  personId,
}: { nameKey: string; personId: number }): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!Number.isInteger(personId)) return { ok: false, message: "personId לא חוקי" };
  const [pol] = await db
    .select({ personId: politicians.personId })
    .from(politicians)
    .where(eq(politicians.personId, personId))
    .limit(1);
  if (!pol) return { ok: false, message: "אין פוליטיקאי עם personId הזה" };

  const ctx = await loadAttributionContext({ db });
  const { backfilled } = await resolveUnmappedName({ db, nameKey, personId, reviewedBy: adminId, ctx });
  logger.info("admin.votes.name_resolved", { nameKey, personId, backfilled });
  revalidatePath("/admin");
  return { ok: true, message: `המיפוי נשמר — שויכו ${backfilled} הצבעות` };
}

export async function dismissUnmappedNameAction({ nameKey }: { nameKey: string }): Promise<ActionResult> {
  const adminId = await requireAdmin();
  await dismissUnmappedName({ db, nameKey, reviewedBy: adminId });
  revalidatePath("/admin");
  return { ok: true, message: "השם נדחה — לא ייכנס שוב לתור" };
}

export async function createAgendaItemAction({
  titleHe,
  expectedDate,
}: { titleHe: string; expectedDate?: string }): Promise<ActionResult> {
  await requireAdmin();
  const title = titleHe.trim();
  if (!title) return { ok: false, message: "נדרשת כותרת" };
  if (expectedDate && !/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)) {
    return { ok: false, message: "תאריך לא חוקי (YYYY-MM-DD)" };
  }
  // Admin-authored agenda rows carry the documented provenance convention:
  // sourceDataset 'admin' + the admin surface as sourceUrl (schema-votes note).
  await db.insert(agendaItems).values({
    titleHe: title,
    expectedDate: expectedDate || null,
    addedBy: "admin",
    sourceDataset: "admin",
    sourceUrl: "/admin",
    fetchedAt: new Date(),
  });
  revalidatePath("/admin");
  revalidatePath("/votes");
  return { ok: true, message: "נוסף לסדר היום" };
}

export async function setAgendaItemStatusAction({
  id,
  status,
}: { id: string; status: "announced" | "voted" | "dropped" }): Promise<ActionResult> {
  await requireAdmin();
  await db.update(agendaItems).set({ status }).where(eq(agendaItems.id, id));
  revalidatePath("/admin");
  revalidatePath("/votes");
  return { ok: true };
}

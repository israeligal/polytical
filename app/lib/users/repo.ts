import { eq } from "drizzle-orm";
import { users } from "@/app/lib/schema";
import { MissingUserError } from "@/app/lib/errors";
import type { Tx } from "@/app/lib/db";

// User-row access primitives shared across services. Scope guard first.

function reqUser(userId: string): string {
  if (!userId) throw new MissingUserError();
  return userId;
}

/**
 * Locks the user row FOR UPDATE and returns it. Take this BEFORE a
 * check-then-act guard (e.g. onboarding identity writes) so concurrent
 * transactions serialize on the row instead of racing a stale read.
 */
export async function lockUser({ tx, userId }: { tx: Tx; userId: string }) {
  const [row] = await tx
    .select()
    .from(users)
    .where(eq(users.id, reqUser(userId)))
    .for("update");
  if (!row) throw new MissingUserError();
  return row;
}

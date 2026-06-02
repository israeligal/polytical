// Dogfood harness — primitives for agents to create REAL accounts and exercise
// the system end-to-end at the service layer (same logic the UI drives), against
// the dev Neon DB. assertNonProductionDb guards every run. NOT shipped to prod.
import { eq } from "drizzle-orm";
import { assertNonProductionDb } from "@/app/lib/db-guards";
import { auth } from "@/lib/auth";
import { db } from "@/app/lib/db";
import { users } from "@/app/lib/schema";
import { setHandle, completeOnboarding } from "@/app/lib/onboarding/service";

// Re-export the real services so agent journey scripts import everything here.
export { placeBet, resolveMarket } from "@/app/lib/markets/service";
export { listOpenMarkets, getMarketBundle, getMarketsForPolitician } from "@/app/lib/markets/repo";
export { collectCard, getOwnedPersonIds } from "@/app/lib/cards/service";
export { getAllPoliticians } from "@/app/lib/politicians/repo";
export { getSeasonBoard, claimTier } from "@/app/lib/seasons/service";
export { postComment, toggleCommentUpvote } from "@/app/lib/comments/service";
export { search } from "@/app/lib/search/service";
export { getBalance } from "@/app/lib/ledger/service";

/**
 * Creates a REAL, loginable account (Better Auth email/password — fires the
 * starting-stack grant hook) and completes onboarding (handle + arena). Returns
 * the userId. Idempotent-ish: if the email already exists, reuses that user.
 */
export async function createDogfooder({
  email,
  name,
  password = "dogfood-pass-1234",
  handle,
  arena,
}: {
  email: string;
  name: string;
  password?: string;
  handle: string;
  arena: string;
}): Promise<{ userId: string }> {
  assertNonProductionDb();

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  let userId: string;
  if (existing[0]) {
    userId = existing[0].id;
  } else {
    await auth.api.signUpEmail({ body: { name, email, password }, headers: new Headers() });
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (!row) throw new Error(`signup did not create a user for ${email}`);
    userId = row.id;
  }

  // Complete onboarding (no-op-safe: setHandle/completeOnboarding throw on
  // re-run, which the caller can ignore for an already-onboarded reuse).
  const [u] = await db.select({ onboardedAt: users.onboardedAt }).from(users).where(eq(users.id, userId));
  if (!u?.onboardedAt) {
    await setHandle({ userId, handle });
    await completeOnboarding({ userId, arena });
  }
  return { userId };
}

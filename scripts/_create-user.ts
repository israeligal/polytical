import { eq, and } from "drizzle-orm";
import { assertNonProductionDb } from "@/app/lib/db-guards";
import { db } from "@/app/lib/db";
import { accounts } from "@/app/lib/schema";
import { auth } from "@/lib/auth";

// Ad-hoc: create (or re-password) an email+password user via Better Auth's
// context. Mirrors what /sign-up/email does (hash password → createUser →
// linkAccount with providerId "credential"), but bypasses the route's
// minPasswordLength check. createUser runs through createWithHooks, so a new
// user still gets the starting-stack grant. Sign-in does NOT re-validate
// password length. Idempotent: re-running just resets the credential password.
const EMAIL = "ih5938133@gmail.com";
const PASSWORD = "12345678";
const NAME = "ih5938133";

async function main() {
  assertNonProductionDb();

  const ctx = await auth.$context;
  const hash = await ctx.password.hash(PASSWORD);

  const existing = await ctx.internalAdapter.findUserByEmail(EMAIL);
  if (existing) {
    await db
      .update(accounts)
      .set({ password: hash, updatedAt: new Date() })
      .where(and(eq(accounts.userId, existing.user.id), eq(accounts.providerId, "credential")));
    console.log(`Reset password for existing user ${EMAIL} (id ${existing.user.id}) to "${PASSWORD}".`);
    return;
  }

  const user = await ctx.internalAdapter.createUser({
    email: EMAIL,
    name: NAME,
    emailVerified: false,
  });
  if (!user) throw new Error("createUser returned no user");

  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: hash,
  });

  console.log(`Created user ${EMAIL} (id ${user.id}) with password "${PASSWORD}".`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("create-user failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });

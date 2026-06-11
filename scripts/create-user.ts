import { parseArgs } from "node:util";
import { eq, and } from "drizzle-orm";
import { assertNonProductionDb } from "@/app/lib/db-guards";
import { db } from "@/app/lib/db";
import { accounts, users } from "@/app/lib/schema";
import { auth } from "@/lib/auth";
import { CATEGORIES } from "@/lib/categories";
import { generateAvailableHandle, setHandle, completeOnboarding } from "@/app/lib/onboarding/service";

// Create (or update) an email+password user via Better Auth's context.
// Mirrors what /sign-up/email does (hash password → createUser → linkAccount
// with providerId "credential"). Idempotent: re-running resets the credential
// password and applies any flags to the existing user.
//
//   pnpm user:create --email dogfood+foo@example.com
//   pnpm user:create --email qa@example.com --name "QA" --admin --onboard
//
// Flags:
//   --email     (required)
//   --password  default "dogfood-pass-1234"
//   --name      default: the email's local part
//   --admin     set users.isAdmin (sign out/in to refresh the 5-min cookieCache)
//   --onboard   clear the onboarding gate: auto-generated Hebrew handle + first arena

const { values } = parseArgs({
  allowPositionals: true, // tolerate a stray "--" from `pnpm user:create -- --email …`
  options: {
    email: { type: "string" },
    password: { type: "string", default: "dogfood-pass-1234" },
    name: { type: "string" },
    admin: { type: "boolean", default: false },
    onboard: { type: "boolean", default: false },
  },
});

async function main() {
  assertNonProductionDb();

  const { email, password, admin, onboard } = values;
  if (!email) throw new Error("--email is required");
  const name = values.name ?? email.split("@")[0];

  const ctx = await auth.$context;
  const hash = await ctx.password.hash(password);

  const existing = await ctx.internalAdapter.findUserByEmail(email);
  let userId: string;
  if (existing) {
    userId = existing.user.id;
    await db
      .update(accounts)
      .set({ password: hash, updatedAt: new Date() })
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")));
    console.log(`Existing user ${email} (id ${userId}) — password reset.`);
  } else {
    const user = await ctx.internalAdapter.createUser({ email, name, emailVerified: false });
    if (!user) throw new Error("createUser returned no user");
    userId = user.id;
    await ctx.internalAdapter.linkAccount({
      userId,
      providerId: "credential",
      accountId: userId,
      password: hash,
    });
    console.log(`Created user ${email} (id ${userId}).`);
  }

  if (admin) {
    await db.update(users).set({ isAdmin: true }).where(eq(users.id, userId));
    console.log("isAdmin set (sign out/in to refresh the session cookie).");
  }

  if (onboard) {
    const [row] = await db
      .select({ handle: users.handle, onboardedAt: users.onboardedAt })
      .from(users)
      .where(eq(users.id, userId));
    if (row.onboardedAt) {
      console.log(`Already onboarded as @${row.handle}.`);
    } else {
      const handle = row.handle ?? (await generateAvailableHandle({ userId }));
      if (!row.handle) await setHandle({ userId, handle });
      await completeOnboarding({ userId, arena: CATEGORIES[0].key });
      console.log(`Onboarded as @${handle} (arena: ${CATEGORIES[0].key}).`);
    }
  }

  console.log(`Login: ${email} / ${password}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("create-user failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });

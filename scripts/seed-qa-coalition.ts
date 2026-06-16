import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { assertNonProductionDb } from "@/app/lib/db-guards";
import { db } from "@/app/lib/db";
import { users } from "@/app/lib/schema";
import { createGroup } from "@/app/lib/groups/service";
import { createGroupMotion } from "@/app/lib/groups/motions";

// Seed a throwaway QA coalition (+ optional yes/no motion) owned by an existing
// user, so coalition browser-QA has a scoped coalition to walk in one command
// instead of clicking through /g/new + /g/[slug]/new by hand. Idempotent? No —
// each run makes a new coalition; tear down with scripts/cleanup-qa-group.ts.
//
//   pnpm user:create --email dogfood+qa@example.com --onboard   # ensure the owner exists
//   pnpm tsx --env-file=.env scripts/seed-qa-coalition.ts --email dogfood+qa@example.com --motion "האם X יקרה?"
//
// Flags:
//   --email   (required) the OWNER's email — must already exist (use pnpm user:create)
//   --name    coalition name (default "QA בדיקת סקופ")
//   --motion  optional motion question → a live yes/no הצעה closing in 14 days

const { values } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: "string" },
    name: { type: "string", default: "QA בדיקת סקופ" },
    motion: { type: "string" },
  },
});

async function main() {
  assertNonProductionDb();

  const { email, name, motion } = values;
  if (!email) throw new Error("--email is required (the coalition owner)");

  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!owner) {
    throw new Error(`no user with email ${email} — create one first:\n  pnpm user:create --email ${email} --onboard`);
  }

  const group = await createGroup({ userId: owner.id, input: { nameHe: name } });
  console.log(`coalition "${name}" → /g/${group.slug}  (id ${group.id})`);

  if (motion) {
    const closeAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const { marketId } = await createGroupMotion({
      userId: owner.id,
      groupId: group.id,
      questionHe: motion,
      category: "coalition",
      closeAt,
    });
    console.log(`motion "${motion}" → /market/${marketId}`);
  }

  console.log(`\ncleanup when done:\n  pnpm tsx --env-file=.env scripts/cleanup-qa-group.ts ${group.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("seed-qa-coalition failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });

import { eq } from "drizzle-orm";
import { db, sharedSql } from "@/app/lib/db";
import { users } from "@/app/lib/schema";
import { assertNonProductionDb } from "@/app/lib/db-guards";
import { updateUserCaricature } from "@/app/lib/users/repo";

// Moderation: clear a user's caricature avatar (it falls back to the handle
// initial). Usage: pnpm reset:caricature <handle>
// Runs against the single prod DB for real moderation (ALLOW_PROD_INGEST=1).
async function main() {
  assertNonProductionDb();
  const handle = process.argv[2]?.replace(/^@/, "");
  if (!handle) {
    console.error("usage: pnpm reset:caricature <handle>");
    process.exit(1);
  }
  const [u] = await db
    .select({ id: users.id, handle: users.handle })
    .from(users)
    .where(eq(users.handle, handle));
  if (!u) {
    console.error(`no user with handle @${handle}`);
    process.exit(1);
  }
  await updateUserCaricature({ userId: u.id, caricatureUrl: null });
  console.log(`✓ cleared caricature for @${u.handle}`);
  await sharedSql.end();
}

main().catch((e) => {
  console.error("reset-user-caricature failed:", e);
  process.exit(1);
});

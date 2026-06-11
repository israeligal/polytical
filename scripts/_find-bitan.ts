import { db } from "../app/lib/db";
import { politicians } from "../app/lib/schema";
import { ilike } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({
      personId: politicians.personId,
      nameHe: politicians.nameHe,
      party: politicians.party,
      roleHe: politicians.roleHe,
      imageUrl: politicians.imageUrl,
      active: politicians.active,
    })
    .from(politicians)
    .where(ilike(politicians.nameHe, "%ביטן%"));

  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}
main();

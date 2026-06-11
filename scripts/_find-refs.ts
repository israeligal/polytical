import { db } from "../app/lib/db";
import { politicians } from "../app/lib/schema";
import { ilike, or } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({ personId: politicians.personId, nameHe: politicians.nameHe, imageUrl: politicians.imageUrl })
    .from(politicians)
    .where(or(ilike(politicians.nameHe, "%בוסקילה%"), ilike(politicians.nameHe, "%אדלשטיין%")));
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}
main();

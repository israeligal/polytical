// Read-only: lists active politicians whose caricature role text likely changed, plus the
// new non-MK ministers (no card yet). Run AFTER the members re-ingest. No writes.
import { db } from "@/app/lib/db";
import { politicians } from "@/app/lib/schema";
import { eq } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({
      personId: politicians.personId, nameHe: politicians.nameHe,
      roleHe: politicians.roleHe, imageUrl: politicians.imageUrl, facts: politicians.facts,
    })
    .from(politicians)
    .where(eq(politicians.active, true));

  const newMinisters = rows.filter(
    (r) => (r.facts as { isNorwegianMinister?: boolean })?.isNorwegianMinister && !r.imageUrl,
  );
  const ministersWithCard = rows.filter((r) => r.roleHe?.startsWith("שר") && r.imageUrl);

  console.log("=== NEW non-MK ministers (no caricature yet → generate) ===");
  for (const r of newMinisters) console.log(`  ${r.personId}  ${r.nameHe}  ${r.roleHe}`);
  console.log("\n=== Existing minister cards (role text may have changed → review/regenerate) ===");
  for (const r of ministersWithCard) console.log(`  ${r.personId}  ${r.nameHe}  ${r.roleHe}`);
  console.log(`\nnew=${newMinisters.length} existing-minister-cards=${ministersWithCard.length}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

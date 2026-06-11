import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isNotNull, ne, and, eq } from "drizzle-orm";
import { db } from "@/app/lib/db";
import { politicians } from "@/app/lib/schema";

// Read-only caricature integrity report — the always-on answer to "who has a
// valid card and who doesn't". Cross-checks three invariants:
//   1. every ACTIVE politician has an imageUrl           (missing → generate)
//   2. every imageUrl points at a real file on disk      (broken → fix pointer)
//   3. every file in public/caricatures has a DB pointer (orphan → wire or delete)
// The roster ingest can't clobber images (imageUrl is carved out of upsertMembers'
// SET), so any drift this finds came from a manual edit — investigate, don't shrug.
// Run: pnpm check:caricatures   (exit 1 on any finding, so CI/preflight can gate)

const DIR = join(process.cwd(), "public", "caricatures");

async function main() {
  const rows = await db
    .select({
      personId: politicians.personId,
      nameHe: politicians.nameHe,
      roleHe: politicians.roleHe,
      active: politicians.active,
      imageUrl: politicians.imageUrl,
    })
    .from(politicians);

  const files = new Set(
    readdirSync(DIR)
      .filter((f) => /^\d+\.png$/.test(f))
      .map((f) => Number(f.replace(".png", ""))),
  );

  const missing = rows.filter((r) => r.active && !r.imageUrl);
  const broken = rows.filter(
    (r) => r.imageUrl && !existsSync(join(process.cwd(), "public", r.imageUrl)),
  );
  const pointed = new Set(rows.filter((r) => r.imageUrl).map((r) => r.personId));
  const orphans = [...files].filter((id) => !pointed.has(id));

  console.log(`caricature files: ${files.size} · rows with imageUrl: ${pointed.size} · active rows: ${rows.filter((r) => r.active).length}`);

  if (missing.length) {
    console.log(`\n❌ ACTIVE WITHOUT CARD (${missing.length}) — generate these:`);
    for (const r of missing) console.log(`   ${r.personId}  ${r.nameHe}  (${r.roleHe ?? "ח״כ"})`);
  }
  if (broken.length) {
    console.log(`\n❌ DB POINTS AT MISSING FILE (${broken.length}) — broken images in prod:`);
    for (const r of broken) console.log(`   ${r.personId}  ${r.nameHe}  → ${r.imageUrl}`);
  }
  if (orphans.length) {
    console.log(`\n⚠️  FILE WITHOUT DB POINTER (${orphans.length}) — wire or delete:`);
    console.log(`   ${orphans.join(", ")}`);
  }
  if (!missing.length && !broken.length && !orphans.length) {
    console.log("✅ all caricatures consistent");
    process.exit(0);
  }
  process.exit(1);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

// One-time(ish) bootstrap of the MK attribution map (P0-2, plan A-7).
//
// Mapping rows come ONLY from id-anchored sources — no fuzzy matching, no
// cross-id-space joins:
//   1. politicians.nameHe (official KNS_Person names, all 148 K25-tenured)
//   2. Open Knesset `altnames` — curated name variants keyed by the OFFICIAL
//      PersonID column of mk_individual.csv (verbatim snapshot committed at
//      scripts/data/oknesset-mk-crosswalk.csv; the live endpoint is flaky).
//
// NOTE the original plan's `kns_mksitecode` bridge DOES NOT EXIST in this
// dataset version, and the website dropdown ID space ≠ mk_individual_id for
// modern MKs (mk_individual_id converged to PersonID) — joining them risks
// cross-space collisions, so politicians.mkSiteId stays NULL until an
// authoritative bridge appears. Attribution never needed it: VoteDetails
// carries names only, and names resolve through mk_name_mappings.
//
// Key collisions (one nameKey claimed by two persons) are excluded — those
// names always queue for human review. A dry-run coverage check over real
// captured VoteDetails samples goes into the report. Human sign-off
// (verifiedAt) gates attribution.
//
// Run: pnpm exec tsx --env-file=.env scripts/bootstrap-mk-mapping.ts

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { assertNonProductionDb } from "@/app/lib/db-guards";
import { db } from "@/app/lib/db";
import { politicians, mkNameMappings } from "@/app/lib/schema";
import { logger } from "@/app/lib/logger";
import { parseCsv } from "@/app/lib/knesset/odata";
import { nameKey } from "@/app/lib/votes/name-key";
import type { WsVoteDetailsResponse } from "@/app/lib/votes/website-types";

const SNAPSHOT_PATH = "scripts/data/oknesset-mk-crosswalk.csv";
const SAMPLE_DIR = "/tmp/ws-captures/sample"; // probe captures (optional coverage check)
const REPORT_PATH = "/tmp/mk-mapping-report.md";

async function main() {
  assertNonProductionDb(); // house rule (NB: passes on the single prod DB — this is a deliberate prod write)

  const roster = await db
    .select({ personId: politicians.personId, nameHe: politicians.nameHe, active: politicians.active })
    .from(politicians);
  const rosterIds = new Set(roster.map((p) => p.personId));

  // ---- candidates from the two id-anchored sources ----
  type Candidate = { key: string; personId: number; label: string };
  const candidates: Candidate[] = [];
  for (const p of roster) {
    const k = nameKey(p.nameHe);
    if (k) candidates.push({ key: k, personId: p.personId, label: `roster:"${p.nameHe}"` });
  }
  const csvRows = parseCsv(readFileSync(SNAPSHOT_PATH, "utf8"));
  let altCount = 0;
  for (const r of csvRows) {
    const personId = Number(r.PersonID);
    if (!rosterIds.has(personId)) continue; // only K25-tenured persons can appear in K25 votes
    let alts: string[] = [];
    try {
      alts = JSON.parse(r.altnames || "[]") as string[];
    } catch {
      continue; // malformed altnames cell — skip, roster name still covers the person
    }
    for (const alt of alts) {
      const k = nameKey(alt);
      if (k) {
        candidates.push({ key: k, personId, label: `altname:"${alt}"` });
        altCount += 1;
      }
    }
  }

  // ---- collision detection: a key claimed by >1 distinct person is excluded ----
  const byKey = new Map<string, Map<number, string[]>>();
  for (const c of candidates) {
    const m = byKey.get(c.key) ?? new Map<number, string[]>();
    m.set(c.personId, [...(m.get(c.personId) ?? []), c.label]);
    byKey.set(c.key, m);
  }
  const clean: { key: string; personId: number }[] = [];
  const collisions: string[] = [];
  for (const [key, persons] of byKey) {
    if (persons.size === 1) {
      clean.push({ key, personId: [...persons.keys()][0] });
    } else {
      const detail = [...persons.entries()].map(([pid, ls]) => `${pid} (${ls.join(", ")})`).join(" vs ");
      collisions.push(`\`${key}\` → ${detail}`);
    }
  }

  // ---- write (idempotent upsert; re-running refreshes, never duplicates) ----
  for (const { key, personId } of clean) {
    await db
      .insert(mkNameMappings)
      .values({ nameKey: key, personId, source: "crosswalk" })
      .onConflictDoUpdate({
        target: mkNameMappings.nameKey,
        set: { personId: sql`excluded."personId"`, source: sql`excluded."source"` },
      });
  }

  // ---- dry-run coverage over captured real VoteDetails (if present) ----
  const keySet = new Set(clean.map((c) => c.key));
  const unmatched = new Map<string, number>();
  let occurrences = 0;
  let sampleFiles = 0;
  if (existsSync(SAMPLE_DIR)) {
    for (const f of readdirSync(SAMPLE_DIR).filter((f) => f.endsWith(".json"))) {
      let parsed: WsVoteDetailsResponse;
      try {
        parsed = JSON.parse(readFileSync(join(SAMPLE_DIR, f), "utf8")) as WsVoteDetailsResponse;
      } catch {
        continue;
      }
      sampleFiles += 1;
      for (const row of parsed.VoteDetails ?? []) {
        occurrences += 1;
        const k = nameKey(row.MkName);
        if (!keySet.has(k)) unmatched.set(row.MkName, (unmatched.get(row.MkName) ?? 0) + 1);
      }
    }
  }

  // ---- human-verification report ----
  const report = [
    `# MK mapping bootstrap report — ${new Date().toISOString()}`,
    ``,
    `Sources: politicians.nameHe (${roster.length} K25-tenured) + altnames from ${SNAPSHOT_PATH} (${altCount} variants for roster persons).`,
    `politicians.mkSiteId intentionally left NULL — no authoritative website-id bridge exists (see script header).`,
    ``,
    `## Mappings written: ${clean.length}`,
    ``,
    `## Name-key collisions excluded (${collisions.length}) — these names ALWAYS queue`,
    ...(collisions.length ? collisions.map((c) => `- ${c}`) : ["- none"]),
    ``,
    `## Dry-run coverage vs captured VoteDetails (${sampleFiles} votes, ${occurrences} MK-vote rows)`,
    unmatched.size === 0
      ? `- every sampled MkName resolved ✓`
      : `- UNRESOLVED names (would queue):`,
    ...[...unmatched.entries()].map(([name, n]) => `  - "${name}" ×${n} (key: \`${nameKey(name)}\`)`),
    ``,
    `**Sign-off:** review collisions + unresolved names, then mark verified:`,
    `\`UPDATE mk_name_mappings SET "verifiedAt" = now() WHERE "verifiedAt" IS NULL;\``,
    `Attribution (ingest-votes) refuses to write mk_votes rows while any mapping is unverified.`,
  ].join("\n");
  writeFileSync(REPORT_PATH, report);

  logger.info("bootstrap.mk_mapping.done", {
    mappings: clean.length,
    collisions: collisions.length,
    coverageSampled: occurrences,
    coverageUnmatchedNames: unmatched.size,
    report: REPORT_PATH,
  });
  process.exit(0);
}

main().catch((err) => {
  logger.error("bootstrap.mk_mapping.failed", { err: String(err) });
  process.exit(1);
});

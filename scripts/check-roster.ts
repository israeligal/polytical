import { isNotNull } from "drizzle-orm";
import { db } from "@/app/lib/db";
import { politicians } from "@/app/lib/schema";
import { PARTY_LEADER_PERSON_IDS } from "@/lib/rarity";

// Read-only roster integrity report — compares the DB against the official
// Knesset OData so curated/derived facts can't silently drift. Catches the
// Goldknopf class of bug (a party whose leader isn't in the curated bronze
// set) and stale role/active values between ingests.
// Run: pnpm check:roster   (exit 1 on findings, so preflight/CI can gate)

const ODATA = "https://knesset.gov.il/Odata/ParliamentInfo.svc";
const K = 25;

// PositionIDs that mean "holds a seat / serves now" (KNS_Position):
// 39/57 שר/שרה · 40/59 סגן/ית שר · 43/61 חבר/ת הכנסת · 45 ראש הממשלה
const MINISTER = new Set([39, 57]);
const DEPUTY = new Set([40, 59]);
const MK_SEAT = new Set([43, 61]);
const PM = 45;

interface OpenPosition {
  PersonID: number;
  PositionID: number;
}

/** Page through all OPEN (FinishDate eq null) K25 positions. */
async function fetchOpenPositions(): Promise<OpenPosition[]> {
  const rows: OpenPosition[] = [];
  let url =
    `${ODATA}/KNS_PersonToPosition?$filter=` +
    encodeURIComponent(`KnessetNum eq ${K} and FinishDate eq null`).replace(/%20/g, "%20") +
    `&$select=PersonID,PositionID&$format=json`;
  for (let page = 0; page < 50 && url; page++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`OData ${res.status} at ${url}`);
    const body = (await res.json()) as { value: OpenPosition[]; "odata.nextLink"?: string };
    rows.push(...body.value);
    url = body["odata.nextLink"] ? new URL(body["odata.nextLink"], `${ODATA}/`).toString() : "";
  }
  return rows;
}

async function main() {
  const [open, dbRows] = await Promise.all([
    fetchOpenPositions(),
    db
      .select({
        personId: politicians.personId,
        nameHe: politicians.nameHe,
        roleHe: politicians.roleHe,
        party: politicians.party,
        active: politicians.active,
      })
      .from(politicians)
      .where(isNotNull(politicians.personId)),
  ]);

  const byPerson = new Map<number, Set<number>>();
  for (const p of open) {
    if (!byPerson.has(p.PersonID)) byPerson.set(p.PersonID, new Set());
    byPerson.get(p.PersonID)!.add(p.PositionID);
  }

  const findings: string[] = [];
  const officialServing = new Set(
    [...byPerson.entries()]
      .filter(([, pos]) => [...pos].some((id) => MK_SEAT.has(id) || MINISTER.has(id) || DEPUTY.has(id) || id === PM))
      .map(([pid]) => pid),
  );

  // 1. active flag drift (both directions)
  for (const r of dbRows) {
    if (r.active && !officialServing.has(r.personId))
      findings.push(`active=true but NO open seat/ministry in OData: ${r.personId} ${r.nameHe}`);
  }
  for (const pid of officialServing) {
    const r = dbRows.find((x) => x.personId === pid);
    if (!r) findings.push(`officially serving but MISSING from politicians: ${pid}`);
    else if (!r.active) findings.push(`officially serving but active=false: ${pid} ${r.nameHe}`);
  }

  // 2. role drift — minister/deputy tier in DB vs open OData positions.
  //    DB detection mirrors lib/rarity.ts: a "שר" word that isn't a deputy
  //    (סגן/סגנית) or a speaker (יושב ראש) marks a minister.
  for (const r of dbRows.filter((x) => x.active)) {
    const role = r.roleHe ?? "";
    const pos = byPerson.get(r.personId) ?? new Set<number>();
    const ministerOData = [...pos].some((id) => MINISTER.has(id) || id === PM);
    const deputyOData = [...pos].some((id) => DEPUTY.has(id));
    const deputyDb = /סג[ןנ]/.test(role) && /שר/.test(role);
    const ministerDb = !deputyDb && /שר|ראש הממשלה/.test(role) && !/סג[ןנ]|יושב|יו"ר|יו״ר/.test(role);
    if (ministerDb && !ministerOData)
      findings.push(`DB role "${role}" but no open ministerial position: ${r.personId} ${r.nameHe}`);
    if (!ministerDb && ministerOData)
      findings.push(`open ministerial position but DB role "${role || "(MK)"}": ${r.personId} ${r.nameHe}`);
    if (deputyDb && !deputyOData)
      findings.push(`DB role "${role}" but no open deputy position: ${r.personId} ${r.nameHe}`);
    if (!deputyDb && deputyOData)
      findings.push(`open deputy position but DB role "${role || "(MK)"}": ${r.personId} ${r.nameHe}`);
  }

  // 3. curated party-leader coverage — every party with active members should
  //    have one designated leader in PARTY_LEADER_PERSON_IDS (lib/rarity.ts)
  const parties = new Map<string, { ids: number[]; hasLeader: boolean }>();
  for (const r of dbRows.filter((x) => x.active && x.party?.trim())) {
    const key = r.party!.trim();
    if (!parties.has(key)) parties.set(key, { ids: [], hasLeader: false });
    parties.get(key)!.ids.push(r.personId);
    if (PARTY_LEADER_PERSON_IDS.has(r.personId)) parties.get(key)!.hasLeader = true;
  }
  // Parties whose leader legitimately can't appear among their actives —
  //  extra-parliamentary, or a curated seatless minister whose own row carries
  //  no faction membership (OData truth). Keep this list justified.
  const LEADERLESS_OK = new Set([
    "העבודה", // leader (Yair Golan) is not a Knesset member
    "הציונות הדתית בראשות בצלאל סמוטריץ'", // Smotrich (30055) curated; seatless → empty party field
    "הימין הממלכתי", // Sa'ar (1027) curated; seatless → empty party field
  ]);
  for (const [party, info] of parties) {
    if (!info.hasLeader && !LEADERLESS_OK.has(party))
      findings.push(`party "${party}" (${info.ids.length} actives) has NO curated leader in PARTY_LEADER_PERSON_IDS`);
  }
  // and: every curated leader must still be active
  for (const pid of PARTY_LEADER_PERSON_IDS) {
    const r = dbRows.find((x) => x.personId === pid);
    if (!r?.active) findings.push(`curated party leader is not active: ${pid} ${r?.nameHe ?? "(missing row)"}`);
  }

  console.log(`open K25 positions: ${open.length} · officially serving: ${officialServing.size} · DB active: ${dbRows.filter((r) => r.active).length}`);
  if (findings.length) {
    console.log(`\n❌ ${findings.length} finding(s):`);
    for (const f of findings) console.log(`   ${f}`);
    process.exit(1);
  }
  console.log("✅ roster consistent with OData + curation complete");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { eq } from "drizzle-orm";
import { assertNonProductionDb } from "@/app/lib/db-guards";
import { db } from "@/app/lib/db";
import { bills, politicians } from "@/app/lib/schema";
import { logger } from "@/app/lib/logger";
import {
  fetchAll, fetchCount, fetchOknessetCsv, PARLIAMENT_BASE, buildODataUrl, CURRENT_KNESSET,
} from "@/app/lib/knesset/odata";
import type {
  KnsBill, KnsBillInitiator, KnsBillInitiatorExpanded, KnsCommittee, KnsFaction, KnsPerson, KnsPersonToPosition, KnsPosition, KnsQuery, KnsStatus,
} from "@/app/lib/knesset/odata-types";
import {
  buildPositionLabelMap, normalizeFactions, normalizeK25Members, normalizeFactionStints, applyEnglishNames,
  normalizeBills, normalizeBillSponsors, normalizeBillDocuments, normalizeBillStatuses, splitExpandedInitiators,
  normalizeQueries, normalizeCommittees, normalizeCommitteeMemberships,
  SENTINEL_FACTION_ID,
} from "@/app/lib/knesset/normalize";
import {
  upsertFactions, upsertMembers, upsertBills, upsertBillSponsors, upsertBillDocuments, upsertBillStatuses, upsertQueries,
  upsertCommittees, upsertCommitteeMemberships, upsertFactionStints, upsertActivityCounts,
} from "@/app/lib/knesset/repo";
import type { ActivityCountsRow } from "@/app/lib/knesset/repo";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const KNESSET_NUM = CURRENT_KNESSET;

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function ingestFactions(prov: { fetchedAt: Date }) {
  const sourceUrl = buildODataUrl({ entity: "KNS_Faction" });
  const raw = await fetchAll<KnsFaction>({ entity: "KNS_Faction" });
  const rows = normalizeFactions(raw, { sourceUrl, fetchedAt: prov.fetchedAt });
  const n = await upsertFactions({ db, rows });
  logger.info("knesset.ingest.entity_done", { entity: "factions", fetched: raw.length, upserted: n });
}

async function ingestMembers(prov: { fetchedAt: Date }) {
  // Provenance MUST reproduce the row set actually fetched. We fetch ALL K25
  // PersonToPosition rows (~546; verified no current row has NULL KnessetNum)
  // so the roster includes DEPARTED K25 MKs (active=false) — the vote backfill
  // spans the whole term and their roll-call rows must be attributable.
  const MEMBERS_FILTER = `KnessetNum eq ${KNESSET_NUM}`;
  const sourceUrl = buildODataUrl({ entity: "KNS_PersonToPosition", filter: MEMBERS_FILTER });
  // KNS_Person is fetched UNFILTERED: departed MKs are IsCurrent=false there,
  // and the whole entity is a few thousand rows (well under the page cap).
  const [p2p, positions, persons, factions] = await Promise.all([
    fetchAll<KnsPersonToPosition>({ entity: "KNS_PersonToPosition", filter: MEMBERS_FILTER }),
    fetchAll<KnsPosition>({ entity: "KNS_Position" }),
    fetchAll<KnsPerson>({ entity: "KNS_Person" }),
    fetchAll<KnsFaction>({ entity: "KNS_Faction" }),
  ]);
  const positionLabels = buildPositionLabelMap(positions);
  // Party resolves by stable FactionID through KNS_Faction.Name (never the inline
  // FactionName); drop the 911 sentinel so it can't seed a bogus party.
  const factionNameById = new Map<number, string>();
  for (const f of factions) {
    if (f.FactionID !== SENTINEL_FACTION_ID && f.Name) factionNameById.set(f.FactionID, f.Name);
  }
  let members = normalizeK25Members({ p2p, positionLabels, persons, factionNameById, prov: { sourceUrl, fetchedAt: prov.fetchedAt } });

  // Faction-membership intervals ride the same fetch — the faction-at-vote-time
  // source for mk_votes attribution (votes ingest reads these, never FactionName).
  const stints = normalizeFactionStints(p2p, { sourceUrl, fetchedAt: prov.fetchedAt });
  const s = await upsertFactionStints({ db, rows: stints });
  logger.info("knesset.ingest.entity_done", { entity: "faction_stints", upserted: s });

  // Gap-fill English names from Open Knesset, reconciled by PersonID.
  // TODO(oknesset): the production.oknesset.org pipeline CSV paths now 404 —
  // re-discover the correct dataset path/host before relying on this enrichment.
  try {
    const { rows: enCsv } = await fetchOknessetCsv("members/mk_individual.csv");
    members = applyEnglishNames(members, enCsv);
  } catch (err) {
    logger.warn("knesset.ingest.gap_fill_unavailable", {
      enrichment: "nameEn", reason: "open-knesset CSV unreachable (404)",
      effect: "nameEn left empty — NOT enriched", err: String(err),
    });
  }

  const n = await upsertMembers({ db, rows: members });
  logger.info("knesset.ingest.entity_done", { entity: "politicians", roster: members.length, upserted: n });
}

async function ingestBills(prov: { fetchedAt: Date }) {
  const filter = `KnessetNum eq ${KNESSET_NUM}`;
  const sourceUrl = buildODataUrl({ entity: "KNS_Bill", filter });
  const raw = await fetchAll<KnsBill>({ entity: "KNS_Bill", filter });
  const n = await upsertBills({ db, rows: normalizeBills(raw, { sourceUrl, fetchedAt: prov.fetchedAt }) });
  logger.info("knesset.ingest.entity_done", { entity: "bills", fetched: raw.length, upserted: n });
}

/** The set of CURRENT-Knesset bill IDs we store, read back from the bills table.
 *  MUST filter by knessetNum: since ingestLifetimeBills, the bills table spans every
 *  Knesset, so an unfiltered read would drop minBillId to an ancient id and blow
 *  ingestBillSponsors' `BillID ge minBillId` fetch past the 100k page cap. */
async function loadK25BillIds(): Promise<Set<number>> {
  const rows = await db
    .select({ billId: bills.billId })
    .from(bills)
    .where(eq(bills.knessetNum, KNESSET_NUM));
  return new Set(rows.map((r) => r.billId));
}

async function ingestBillSponsors(prov: { fetchedAt: Date }) {
  // KNS_BillInitiator spans every Knesset (~170k rows) and has no KnessetNum to
  // filter on — only BillID. Unscoped, it truncates at the 100k page cap to the
  // OLDEST rows, which are disjoint from our K25 bills. So: scope the fetch to
  // `BillID ge min(K25 billIds)` (~57k rows, under the cap) and drop any straggler
  // row whose bill isn't one we store. Bills must be ingested first.
  const validBillIds = await loadK25BillIds();
  if (validBillIds.size === 0) {
    logger.warn("knesset.ingest.skip", { entity: "bill_sponsors", reason: "bills table empty — run bills first" });
    return;
  }
  const minBillId = Math.min(...validBillIds);
  const filter = `BillID ge ${minBillId}`;
  const sourceUrl = buildODataUrl({ entity: "KNS_BillInitiator", filter });
  const raw = await fetchAll<KnsBillInitiator>({ entity: "KNS_BillInitiator", filter });
  const rows = normalizeBillSponsors(raw, { sourceUrl, fetchedAt: prov.fetchedAt }, validBillIds);
  const n = await upsertBillSponsors({ db, rows });
  logger.info("knesset.ingest.entity_done", {
    entity: "bill_sponsors", fetched: raw.length, kept: rows.length, upserted: n, minBillId,
  });
}

async function ingestQueries(prov: { fetchedAt: Date }) {
  const filter = `KnessetNum eq ${KNESSET_NUM}`;
  const sourceUrl = buildODataUrl({ entity: "KNS_Query", filter });
  const raw = await fetchAll<KnsQuery>({ entity: "KNS_Query", filter });
  const n = await upsertQueries({ db, rows: normalizeQueries(raw, { sourceUrl, fetchedAt: prov.fetchedAt }) });
  logger.info("knesset.ingest.entity_done", { entity: "queries", fetched: raw.length, upserted: n });
}

// Per-MK parliamentary-activity counts (card-critical, cheap). For EVERY politician on
// the roster — including departed K25 MKs (active=false), whose profile pages stay live —
// we ask the official OData for FOUR totals via `$inlinecount` (no row downloads): bills &
// queries, current-Knesset and lifetime. KNS_BillInitiator has no KnessetNum, so the
// current-term bill count scopes through the KNS_Bill nav property; KNS_Query carries its
// own KnessetNum. ~140 MKs × 4 tiny calls — bounded, so it runs in the default ingest.
async function ingestActivityCounts(prov: { fetchedAt: Date }) {
  const mks = await db
    .select({ personId: politicians.personId })
    .from(politicians);
  if (mks.length === 0) {
    logger.warn("knesset.ingest.skip", { entity: "activity_counts", reason: "no politicians — run members first" });
    return;
  }
  const rows: ActivityCountsRow[] = [];
  let failed = 0;
  for (const { personId } of mks) {
    try {
      const [billsLifetime, billsCurrent, queriesLifetime, queriesCurrent] = await Promise.all([
        fetchCount({ entity: "KNS_BillInitiator", filter: `PersonID eq ${personId}` }),
        fetchCount({ entity: "KNS_BillInitiator", filter: `PersonID eq ${personId} and KNS_Bill/KnessetNum eq ${KNESSET_NUM}` }),
        fetchCount({ entity: "KNS_Query", filter: `PersonID eq ${personId}` }),
        fetchCount({ entity: "KNS_Query", filter: `PersonID eq ${personId} and KnessetNum eq ${KNESSET_NUM}` }),
      ]);
      rows.push({ personId, billsCurrent, billsLifetime, queriesCurrent, queriesLifetime, activityCountsFetchedAt: prov.fetchedAt });
    } catch (err) {
      // One MK's fetch failing (after fetchCount's own retries) must not discard every
      // other MK's counts. Log + skip; the next run retries this MK (idempotent UPDATE).
      failed += 1;
      logger.warn("knesset.ingest.activity_count_failed", { personId, err: String(err) });
    }
    await sleep(250); // be polite to the service across ~120 MKs
  }
  if (rows.length === 0) {
    // Per-MK tolerance must not extend to total failure: every other step fails the run
    // loudly, and a green run that wrote nothing would let counts go stale unnoticed.
    throw new Error(`activity counts: all ${failed} MK count fetches failed — API shape change?`);
  }
  const n = await upsertActivityCounts({ db, rows });
  logger.info("knesset.ingest.entity_done", { entity: "activity_counts", mks: mks.length, written: n, failed });
}

// KNS_Status lookup (81 rows) — statusId -> Hebrew desc, so the bill page renders
// readable status. Tiny; runs alongside the lifetime-bills backfill.
async function ingestBillStatuses(prov: { fetchedAt: Date }) {
  const sourceUrl = buildODataUrl({ entity: "KNS_Status" });
  const raw = await fetchAll<KnsStatus>({ entity: "KNS_Status" });
  const n = await upsertBillStatuses({ db, rows: normalizeBillStatuses(raw, { sourceUrl, fetchedAt: prov.fetchedAt }) });
  logger.info("knesset.ingest.entity_done", { entity: "bill_statuses", fetched: raw.length, upserted: n });
}

// LIFETIME bills for every roster MK (closes the כץ gap). KNS_BillInitiator has no
// KnessetNum, so we go per-PersonID and pull the bill + its documents inline via a
// nested $expand (verified live). Bounded: ~140 MKs, one paged call each. Upserts
// bills (all Knessets, no K25 filter), sponsors, and document links. Members first.
async function ingestLifetimeBills(prov: { fetchedAt: Date }) {
  await ingestBillStatuses(prov); // status lookup before bills so the page can join
  const mks = await db.select({ personId: politicians.personId }).from(politicians);
  if (mks.length === 0) {
    logger.warn("knesset.ingest.skip", { entity: "lifetime_bills", reason: "no politicians — run members first" });
    return;
  }
  let totalBills = 0, totalSponsors = 0, totalDocs = 0, failed = 0;
  for (const { personId } of mks) {
    const filter = `PersonID eq ${personId}`;
    const expand = "KNS_Bill/KNS_DocumentBills";
    const sourceUrl = buildODataUrl({ entity: "KNS_BillInitiator", filter, expand });
    try {
      const raw = await fetchAll<KnsBillInitiatorExpanded>({ entity: "KNS_BillInitiator", filter, expand });
      const { bills: rawBills, sponsors: rawSponsors, documents: rawDocs } = splitExpandedInitiators(raw);
      // bills first (sponsors/docs reference billId by value)
      totalBills += await upsertBills({ db, rows: normalizeBills(rawBills, { sourceUrl, fetchedAt: prov.fetchedAt }) });
      totalSponsors += await upsertBillSponsors({ db, rows: normalizeBillSponsors(rawSponsors, { sourceUrl, fetchedAt: prov.fetchedAt }) });
      if (rawDocs.length > 0) {
        totalDocs += await upsertBillDocuments({ db, rows: normalizeBillDocuments(rawDocs, { sourceUrl, fetchedAt: prov.fetchedAt }) });
      }
    } catch (err) {
      failed += 1;
      logger.warn("knesset.ingest.lifetime_bills_failed", { personId, err: String(err) });
    }
    await sleep(250);
  }
  if (totalBills === 0 && failed > 0) {
    throw new Error(`lifetime bills: all ${failed} MK fetches failed — API shape change?`);
  }
  logger.info("knesset.ingest.entity_done", {
    entity: "lifetime_bills", mks: mks.length, bills: totalBills, sponsors: totalSponsors, documents: totalDocs, failed,
  });
}

// Committee LIST (card-critical) — always part of the bounded default.
async function ingestCommittees(prov: { fetchedAt: Date }) {
  const filter = `KnessetNum eq ${KNESSET_NUM}`;
  const sourceUrl = buildODataUrl({ entity: "KNS_Committee", filter });
  const raw = await fetchAll<KnsCommittee>({ entity: "KNS_Committee", filter });
  const n = await upsertCommittees({ db, rows: normalizeCommittees(raw, { sourceUrl, fetchedAt: prov.fetchedAt }) });
  logger.info("knesset.ingest.entity_done", { entity: "committees", fetched: raw.length, upserted: n });
}

// Committee MEMBERSHIP rosters from Open Knesset (OData unreliable here). This is
// a large pre-joined CSV, so it runs only under --full alongside bills/queries.
async function ingestCommitteeMemberships(prov: { fetchedAt: Date }) {
  // TODO(oknesset): the production.oknesset.org pipeline CSV paths now 404 —
  // re-discover the correct dataset path/host before relying on this enrichment.
  try {
    const { rows: csv, url } = await fetchOknessetCsv("committees/mk_individual_committees.csv");
    const memberships = normalizeCommitteeMemberships(csv, url, prov.fetchedAt);
    const m = await upsertCommitteeMemberships({ db, rows: memberships });
    logger.info("knesset.ingest.entity_done", { entity: "committee_memberships", fetched: csv.length, upserted: m });
  } catch (err) {
    logger.warn("knesset.ingest.gap_fill_unavailable", {
      enrichment: "committee_memberships", reason: "open-knesset CSV unreachable (404)",
      effect: "committee_memberships left empty — NOT enriched", err: String(err),
    });
  }
}

async function main() {
  assertNonProductionDb(); // FIRST — refuse to mutate production
  const fetchedAt = new Date();
  const prov = { fetchedAt };
  const only = arg("only");
  const full = flag("full");
  logger.info("knesset.ingest.start", { only: only ?? "all", full, knessetNum: KNESSET_NUM, base: PARLIAMENT_BASE });

  const steps: Record<string, () => Promise<void>> = {
    factions: () => ingestFactions(prov),
    members: () => ingestMembers(prov),
    activityCounts: () => ingestActivityCounts(prov),
    bills: () => ingestBills(prov),
    billSponsors: () => ingestBillSponsors(prov),
    lifetimeBills: () => ingestLifetimeBills(prov),
    queries: () => ingestQueries(prov),
    committees: () => ingestCommittees(prov),
    committeeMemberships: () => ingestCommitteeMemberships(prov),
  };

  // Bounded default (card-critical, ~120 MKs + factions + roles + activity counts +
  // committee LIST): factions before members (members reference factionId), activity
  // counts after members (they UPDATE existing rows by personId), then committees.
  const bounded = ["factions", "members", "activityCounts", "committees"];
  // Heavy entities (~7387 bills / ~1538 queries + bulk membership CSV) only on --full.
  const heavy = ["bills", "billSponsors", "lifetimeBills", "queries", "committeeMemberships"];
  // Run order keeps dependency order; heavy steps appended when --full is set.
  const order = full
    ? ["factions", "members", "activityCounts", "bills", "billSponsors", "lifetimeBills", "queries", "committees", "committeeMemberships"]
    : bounded;

  // A specific --only=<entity> always runs that one (even a heavy one), bypassing the bound.
  for (const key of order) {
    if (only && only !== key) continue;
    await steps[key]();
  }
  // If --only targets a heavy entity not in the default order, run it explicitly.
  if (only && heavy.includes(only) && !order.includes(only)) {
    await steps[only]();
  }

  logger.info("knesset.ingest.done", { full, only: only ?? "all" });
  process.exit(0);
}

main().catch((err) => {
  logger.error("knesset.ingest.failed", { err: String(err) });
  process.exit(1);
});

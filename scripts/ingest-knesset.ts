import { assertNonProductionDb } from "@/app/lib/db-guards";
import { db } from "@/app/lib/db";
import { logger } from "@/app/lib/logger";
import {
  fetchAll, fetchOknessetCsv, CURRENT_MK_FILTER, PARLIAMENT_BASE, buildODataUrl,
} from "@/app/lib/knesset/odata";
import type {
  KnsBill, KnsBillInitiator, KnsCommittee, KnsFaction, KnsPerson, KnsPersonToPosition, KnsPosition, KnsQuery,
} from "@/app/lib/knesset/odata-types";
import {
  buildPositionLabelMap, normalizeFactions, normalizeCurrentMembers, applyEnglishNames,
  normalizeBills, normalizeBillSponsors, normalizeQueries, normalizeCommittees, normalizeCommitteeMemberships,
} from "@/app/lib/knesset/normalize";
import {
  upsertFactions, upsertMembers, upsertBills, upsertBillSponsors, upsertQueries,
  upsertCommittees, upsertCommitteeMemberships,
} from "@/app/lib/knesset/repo";

const KNESSET_NUM = 25;

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
  const sourceUrl = buildODataUrl({ entity: "KNS_PersonToPosition", filter: CURRENT_MK_FILTER });
  // Roster + faction(54) + role rows: pull all current rows for the involved persons.
  // We fetch the full current PersonToPosition set (small) and the lookup tables.
  const [p2p, positions, persons] = await Promise.all([
    fetchAll<KnsPersonToPosition>({ entity: "KNS_PersonToPosition", filter: "IsCurrent eq true" }),
    fetchAll<KnsPosition>({ entity: "KNS_Position" }),
    fetchAll<KnsPerson>({ entity: "KNS_Person", filter: "IsCurrent eq true" }),
  ]);
  const positionLabels = buildPositionLabelMap(positions);
  let members = normalizeCurrentMembers({ p2p, positionLabels, persons, prov: { sourceUrl, fetchedAt: prov.fetchedAt } });

  // Gap-fill English names from Open Knesset, reconciled by PersonID.
  try {
    const { rows: enCsv } = await fetchOknessetCsv("members/mk_individual.csv");
    members = applyEnglishNames(members, enCsv);
  } catch (err) {
    logger.warn("knesset.ingest.english_names_skipped", { err: String(err) });
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

async function ingestBillSponsors(prov: { fetchedAt: Date }) {
  const sourceUrl = buildODataUrl({ entity: "KNS_BillInitiator" });
  const raw = await fetchAll<KnsBillInitiator>({ entity: "KNS_BillInitiator" });
  const n = await upsertBillSponsors({ db, rows: normalizeBillSponsors(raw, { sourceUrl, fetchedAt: prov.fetchedAt }) });
  logger.info("knesset.ingest.entity_done", { entity: "bill_sponsors", fetched: raw.length, upserted: n });
}

async function ingestQueries(prov: { fetchedAt: Date }) {
  const filter = `KnessetNum eq ${KNESSET_NUM}`;
  const sourceUrl = buildODataUrl({ entity: "KNS_Query", filter });
  const raw = await fetchAll<KnsQuery>({ entity: "KNS_Query", filter });
  const n = await upsertQueries({ db, rows: normalizeQueries(raw, { sourceUrl, fetchedAt: prov.fetchedAt }) });
  logger.info("knesset.ingest.entity_done", { entity: "queries", fetched: raw.length, upserted: n });
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
  try {
    const { rows: csv, url } = await fetchOknessetCsv("committees/mk_individual_committees.csv");
    const memberships = normalizeCommitteeMemberships(csv, url, prov.fetchedAt);
    const m = await upsertCommitteeMemberships({ db, rows: memberships });
    logger.info("knesset.ingest.entity_done", { entity: "committee_memberships", fetched: csv.length, upserted: m });
  } catch (err) {
    logger.warn("knesset.ingest.committee_memberships_skipped", { err: String(err) });
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
    bills: () => ingestBills(prov),
    billSponsors: () => ingestBillSponsors(prov),
    queries: () => ingestQueries(prov),
    committees: () => ingestCommittees(prov),
    committeeMemberships: () => ingestCommitteeMemberships(prov),
  };

  // Bounded default (card-critical, ~120 MKs + factions + roles + committee LIST):
  // factions before members (members reference factionId), then committees.
  const bounded = ["factions", "members", "committees"];
  // Heavy entities (~7387 bills / ~1538 queries + bulk membership CSV) only on --full.
  const heavy = ["bills", "billSponsors", "queries", "committeeMemberships"];
  // Run order keeps dependency order; heavy steps appended when --full is set.
  const order = full ? ["factions", "members", "bills", "billSponsors", "queries", "committees", "committeeMemberships"] : bounded;

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

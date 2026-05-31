import { sql } from "drizzle-orm";
import type { DB } from "@/app/lib/db";
import {
  politicians, factions, bills, billSponsors, queries, committees, committeeMemberships,
} from "@/app/lib/schema";
import { logger } from "@/app/lib/logger";
import type {
  MemberRow, FactionRow, BillRow, BillSponsorRow, QueryRow, CommitteeRow, CommitteeMembershipRow,
} from "./normalize";

/** References the conflicting row's incoming value (Postgres `excluded.<col>`). */
function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}

const BATCH = 100;

function chunk<T>(rows: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

// politicians — conflict on the unique stable id `personId`.
export async function upsertMembers({ db, rows }: { db: DB; rows: MemberRow[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(politicians).values(batch).onConflictDoUpdate({
      target: politicians.personId,
      set: {
        nameHe: sqlExcluded("nameHe"), nameEn: sqlExcluded("nameEn"), party: sqlExcluded("party"),
        factionId: sqlExcluded("factionId"), roleHe: sqlExcluded("roleHe"),
        inKnessetSince: sqlExcluded("inKnessetSince"), facts: sqlExcluded("facts"),
        active: sqlExcluded("active"), searchName: sqlExcluded("searchName"),
        sourceDataset: sqlExcluded("sourceDataset"), sourceUrl: sqlExcluded("sourceUrl"),
        fetchedAt: sqlExcluded("fetchedAt"),
        // dob is editorial — never overwrite a curated value with null on re-ingest
      },
    });
    n += batch.length;
  }
  logger.info("knesset.repo.upsert", { entity: "politicians", rows: n });
  return n;
}

export async function upsertFactions({ db, rows }: { db: DB; rows: FactionRow[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(factions).values(batch).onConflictDoUpdate({
      target: factions.factionId,
      set: {
        nameHe: sqlExcluded("nameHe"), knessetNum: sqlExcluded("knessetNum"), isCurrent: sqlExcluded("isCurrent"),
        sourceDataset: sqlExcluded("sourceDataset"), sourceUrl: sqlExcluded("sourceUrl"), fetchedAt: sqlExcluded("fetchedAt"),
      },
    });
    n += batch.length;
  }
  logger.info("knesset.repo.upsert", { entity: "factions", rows: n });
  return n;
}

export async function upsertBills({ db, rows }: { db: DB; rows: BillRow[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(bills).values(batch).onConflictDoUpdate({
      target: bills.billId,
      set: {
        knessetNum: sqlExcluded("knessetNum"), nameHe: sqlExcluded("nameHe"), subTypeDesc: sqlExcluded("subTypeDesc"),
        statusId: sqlExcluded("statusId"), sourceDataset: sqlExcluded("sourceDataset"),
        sourceUrl: sqlExcluded("sourceUrl"), fetchedAt: sqlExcluded("fetchedAt"),
      },
    });
    n += batch.length;
  }
  logger.info("knesset.repo.upsert", { entity: "bills", rows: n });
  return n;
}

export async function upsertBillSponsors({ db, rows }: { db: DB; rows: BillSponsorRow[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(billSponsors).values(batch).onConflictDoUpdate({
      target: billSponsors.billInitiatorId,
      set: {
        billId: sqlExcluded("billId"), personId: sqlExcluded("personId"), isInitiator: sqlExcluded("isInitiator"),
        ordinal: sqlExcluded("ordinal"), sourceDataset: sqlExcluded("sourceDataset"),
        sourceUrl: sqlExcluded("sourceUrl"), fetchedAt: sqlExcluded("fetchedAt"),
      },
    });
    n += batch.length;
  }
  logger.info("knesset.repo.upsert", { entity: "bill_sponsors", rows: n });
  return n;
}

export async function upsertQueries({ db, rows }: { db: DB; rows: QueryRow[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(queries).values(batch).onConflictDoUpdate({
      target: queries.queryId,
      set: {
        number: sqlExcluded("number"), knessetNum: sqlExcluded("knessetNum"), nameHe: sqlExcluded("nameHe"),
        typeDesc: sqlExcluded("typeDesc"), statusId: sqlExcluded("statusId"), personId: sqlExcluded("personId"),
        govMinistryId: sqlExcluded("govMinistryId"), submitDate: sqlExcluded("submitDate"),
        sourceDataset: sqlExcluded("sourceDataset"), sourceUrl: sqlExcluded("sourceUrl"), fetchedAt: sqlExcluded("fetchedAt"),
      },
    });
    n += batch.length;
  }
  logger.info("knesset.repo.upsert", { entity: "queries", rows: n });
  return n;
}

export async function upsertCommittees({ db, rows }: { db: DB; rows: CommitteeRow[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(committees).values(batch).onConflictDoUpdate({
      target: committees.committeeId,
      set: {
        nameHe: sqlExcluded("nameHe"), categoryDesc: sqlExcluded("categoryDesc"), knessetNum: sqlExcluded("knessetNum"),
        committeeTypeDesc: sqlExcluded("committeeTypeDesc"), parentCommitteeId: sqlExcluded("parentCommitteeId"),
        isCurrent: sqlExcluded("isCurrent"), sourceDataset: sqlExcluded("sourceDataset"),
        sourceUrl: sqlExcluded("sourceUrl"), fetchedAt: sqlExcluded("fetchedAt"),
      },
    });
    n += batch.length;
  }
  logger.info("knesset.repo.upsert", { entity: "committees", rows: n });
  return n;
}

export async function upsertCommitteeMemberships({ db, rows }: { db: DB; rows: CommitteeMembershipRow[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(committeeMemberships).values(batch).onConflictDoUpdate({
      target: [
        committeeMemberships.committeeId, committeeMemberships.personId,
        committeeMemberships.positionId, committeeMemberships.startDate,
      ],
      set: {
        finishDate: sqlExcluded("finishDate"), sourceDataset: sqlExcluded("sourceDataset"),
        sourceUrl: sqlExcluded("sourceUrl"), fetchedAt: sqlExcluded("fetchedAt"),
      },
    });
    n += batch.length;
  }
  logger.info("knesset.repo.upsert", { entity: "committee_memberships", rows: n });
  return n;
}

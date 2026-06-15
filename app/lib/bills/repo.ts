import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, asc, desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import {
  bills, billSponsors, billDocuments, billStatuses, politicians, knessetVotes,
  israelLaws, israelLawBills, israelLawTopics, billSplits,
} from "@/app/lib/schema";
import { inArray } from "drizzle-orm";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export type BillInitiator = { personId: number; nameHe: string; isInitiator: boolean };
export type BillDocument = { documentBillId: number; format: string | null; groupTypeDesc: string | null; filePath: string };
/** An enacted law this bill produced (a bill can yield several — budget bills do),
 *  with its own official topic tags. */
export type BillEnactedLaw = {
  israelLawId: number;
  nameHe: string;
  validityDesc: string | null;   // בתוקף / פקע
  publicationDate: Date | null;
  topics: string[];
};
export type BillDetail = {
  billId: number;
  nameHe: string;
  knessetNum: number | null;
  subTypeDesc: string | null;
  statusDesc: string | null;
  publicationDate: Date | null;
  summaryLaw: string | null;
  initiators: BillInitiator[];
  documents: BillDocument[];
  linkedVote: { voteId: number; titleHe: string | null; voteDate: Date | null } | null;
  /** Enacted laws this bill became (KNS_IsraelLawName link). Empty for most bills. */
  enactedLaws: BillEnactedLaw[];
  /** When this bill is a split child, the parent it split off — else null. */
  splitParent: { billId: number; nameHe: string } | null;
};

/** One bill by its stable KNS_Bill.BillID, with human status, ordered initiators
 *  (linked to politician pages), official document links, and the decisive plenum
 *  vote if one exists. Returns null when the bill isn't stored. */
export async function getBillById({
  db = defaultDb,
  billId,
}: { db?: DB; billId: number }): Promise<BillDetail | null> {
  if (!Number.isInteger(billId)) return null;
  const [bill] = await db
    .select({
      billId: bills.billId, nameHe: bills.nameHe, knessetNum: bills.knessetNum,
      subTypeDesc: bills.subTypeDesc, statusDesc: billStatuses.descHe,
      publicationDate: bills.publicationDate, summaryLaw: bills.summaryLaw,
    })
    .from(bills)
    .leftJoin(billStatuses, eq(billStatuses.statusId, bills.statusId))
    .where(eq(bills.billId, billId))
    .limit(1);
  if (!bill) return null;

  const initiators = await db
    .select({ personId: politicians.personId, nameHe: politicians.nameHe, isInitiator: billSponsors.isInitiator })
    .from(billSponsors)
    .innerJoin(politicians, eq(politicians.personId, billSponsors.personId))
    .where(eq(billSponsors.billId, billId))
    .orderBy(desc(billSponsors.isInitiator), asc(billSponsors.ordinal));

  const documents = await db
    .select({
      documentBillId: billDocuments.documentBillId, format: billDocuments.format,
      groupTypeDesc: billDocuments.groupTypeDesc, filePath: billDocuments.filePath,
    })
    .from(billDocuments)
    .where(eq(billDocuments.billId, billId))
    .orderBy(asc(billDocuments.format));

  const [linkedVote] = await db
    .select({ voteId: knessetVotes.voteId, titleHe: knessetVotes.titleHe, voteDate: knessetVotes.voteDate })
    .from(knessetVotes)
    .where(and(eq(knessetVotes.billId, billId), eq(knessetVotes.isDecisive, true)))
    .orderBy(desc(knessetVotes.voteDate))
    .limit(1);

  // Enacted laws this bill produced (israel_law_bills link), each with its tags.
  const lawRows = await db
    .select({
      israelLawId: israelLaws.israelLawId, nameHe: israelLaws.nameHe,
      validityDesc: israelLaws.validityDesc, publicationDate: israelLaws.publicationDate,
    })
    .from(israelLawBills)
    .innerJoin(israelLaws, eq(israelLaws.israelLawId, israelLawBills.israelLawId))
    .where(eq(israelLawBills.billId, billId))
    .orderBy(desc(israelLaws.publicationDate));
  const lawIds = lawRows.map((l) => l.israelLawId);
  const topicRows = lawIds.length
    ? await db
        .select({ israelLawId: israelLawTopics.israelLawId, descHe: israelLawTopics.descHe })
        .from(israelLawTopics)
        .where(inArray(israelLawTopics.israelLawId, lawIds))
    : [];
  const topicsByLaw = new Map<number, string[]>();
  for (const t of topicRows) {
    const list = topicsByLaw.get(t.israelLawId) ?? [];
    if (!list.includes(t.descHe)) list.push(t.descHe);
    topicsByLaw.set(t.israelLawId, list);
  }
  const enactedLaws: BillEnactedLaw[] = lawRows.map((l) => ({ ...l, topics: topicsByLaw.get(l.israelLawId) ?? [] }));

  // Split lineage: if this bill is a split child, the parent it split off.
  const [parent] = await db
    .select({ billId: bills.billId, nameHe: bills.nameHe })
    .from(billSplits)
    .innerJoin(bills, eq(bills.billId, billSplits.mainBillId))
    .where(eq(billSplits.splitBillId, billId))
    .limit(1);

  return {
    ...bill, initiators, documents, linkedVote: linkedVote ?? null,
    enactedLaws, splitParent: parent ?? null,
  };
}

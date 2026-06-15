import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, asc, desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { bills, billSponsors, billDocuments, billStatuses, politicians, knessetVotes } from "@/app/lib/schema";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

// Full politician row (for PoliticianPortrait/dbToCard) + whether they're the
// lead initiator. Mirrors agenda's AgendaInitiator so both render identically.
export type BillInitiator = typeof politicians.$inferSelect & { isInitiator: boolean };
export type BillDocument = { documentBillId: number; format: string | null; groupTypeDesc: string | null; filePath: string };
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

  const initiatorRows = await db
    .select({ p: politicians, isInitiator: billSponsors.isInitiator })
    .from(billSponsors)
    .innerJoin(politicians, eq(politicians.personId, billSponsors.personId))
    .where(eq(billSponsors.billId, billId))
    .orderBy(desc(billSponsors.isInitiator), asc(billSponsors.ordinal));
  const initiators: BillInitiator[] = initiatorRows.map((r) => ({ ...r.p, isInitiator: r.isInitiator }));

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

  return { ...bill, initiators, documents, linkedVote: linkedVote ?? null };
}

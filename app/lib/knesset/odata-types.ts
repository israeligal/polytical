// Raw OData row shapes (verified field names — see plan header). OData v3 emits
// dates as "/Date(ms)/" or ISO strings depending on the entity; we keep them as
// raw strings here and parse in normalize.ts.

export interface KnsPerson {
  PersonID: number;
  LastName: string | null;
  FirstName: string | null;
  GenderDesc: string | null;
  Email: string | null;
  IsCurrent: boolean | null;
  LastUpdatedDate: string | null;
}

export interface KnsPersonToPosition {
  PersonToPositionID: number;
  PersonID: number;
  PositionID: number;
  KnessetNum: number | null;
  StartDate: string | null;
  FinishDate: string | null;
  GovMinistryID: number | null;
  GovMinistryName: string | null;
  DutyDesc: string | null;
  FactionID: number | null;   // NULL on PositionID 43/61; populated on 54
  FactionName: string | null;
  GovernmentNum: number | null;
  CommitteeID: number | null;
  CommitteeName: string | null;
  IsCurrent: boolean | null;
  LastUpdatedDate: string | null;
}

export interface KnsFaction {
  FactionID: number;
  Name: string;               // party name lives here (NOT FactionName)
  KnessetNum: number | null;
  StartDate: string | null;
  FinishDate: string | null;
  IsCurrent: boolean | null;
  LastUpdatedDate: string | null;
}

export interface KnsPosition {
  PositionID: number;
  Description: string | null; // gendered Hebrew label
  LastUpdatedDate: string | null;
}

export interface KnsBill {
  BillID: number;
  KnessetNum: number | null;
  Name: string;
  SubTypeID: number | null;
  SubTypeDesc: string | null;
  PrivateNumber: number | null;
  CommitteeID: number | null;
  Number: number | null;
  StatusID: number | null;
  PublicationDate: string | null;
  /** Official plain-Hebrew summary — populated mostly on enacted laws
   *  (488/7,434 K25 bills as of 2026-06-12); null for everything else. */
  SummaryLaw: string | null;
  IsContinuationBill: boolean | null;
  PublicationSeriesDesc: string | null;
  LastUpdatedDate: string | null;
}

/** Shared shape of the KNS_Document* entities (KNS_DocumentBill / KNS_DocumentAgenda).
 *  PK ids are Int64 → serialized as JSON STRINGS (verified live, test-payloads-items.ts).
 *  Used by both the votes vote-item enrichment and the bill-pages nested $expand. */
export interface KnsDocumentBill {
  DocumentBillID: string;
  BillID: number;
  /** 1=הצעת חוק לדיון מוקדם (DOC+PDF), 2=לקריאה הראשונה, 4=לקריאה השנייה והשלישית,
   *  9=חוק - פרסום ברשומות, 59=חומר רקע (2/4/9/59 are PDF-only). */
  GroupTypeID: number;
  GroupTypeDesc: string | null;
  /** "DOC" | "PDF" (ApplicationID 1 | 4). */
  ApplicationDesc: string | null;
  /** fs.knesset.gov.il URL — may contain BACKSLASHES (normalize before use). */
  FilePath: string;
  LastUpdatedDate: string | null;
}

export interface KnsAgenda {
  AgendaID: number;
  KnessetNum: number | null;
  Name: string | null;
  SubTypeDesc: string | null;
  StatusID: number | null;
  /** OData PersonID of the proposing MK — joins politicians.personId. */
  InitiatorPersonID: number | null;
  LastUpdatedDate: string | null;
}

export interface KnsDocumentAgenda {
  DocumentAgendaID: string;
  AgendaID: number;
  /** 16=נוסח הצעה לסדר היום (DOC+PDF) — verified live. */
  GroupTypeID: number;
  GroupTypeDesc: string | null;
  ApplicationDesc: string | null;
  /** fs.knesset.gov.il URL — observed WITH backslashes (normalize before use). */
  FilePath: string;
  LastUpdatedDate: string | null;
}

export interface KnsStatus {
  StatusID: number;
  Desc: string | null;          // a few rows (e.g. 6015–6017) carry a null Desc
  TypeID: number | null;
  TypeDesc: string | null;
}

export interface KnsBillInitiator {
  BillInitiatorID: number;
  BillID: number;
  PersonID: number;
  IsInitiator: boolean | null;
  Ordinal: number | null;
  LastUpdatedDate: string | null;
}

/** Enacted law on the books — distinct from a bill (KNS_Bill). 106 K25 rows
 *  (verified 2026-06-15). Field names verbatim from a live row. */
export interface KnsIsraelLaw {
  IsraelLawID: number;
  KnessetNum: number | null;
  Name: string | null;
  IsBasicLaw: boolean | null;
  IsFavoriteLaw: boolean | null;
  IsBudgetLaw: boolean | null;
  PublicationDate: string | null;
  LatestPublicationDate: string | null;
  LawValidityID: number | null;
  LawValidityDesc: string | null;     // בתוקף / פקע
  ValidityStartDate: string | null;
  ValidityFinishDate: string | null;
  LastUpdatedDate: string | null;
}

/** Topic tag on an enacted law (~38 distinct Hebrew tags). NB the metadata typo
 *  `Classificiation` (double-i) — verbatim, do not "fix". No KnessetNum field. */
export interface KnsIsraelLawClassificiation {
  LawClassificiationID: number;
  IsraelLawID: number;
  ClassificiationID: number | null;
  ClassificiationDesc: string | null;
  LastUpdatedDate: string | null;
}

/** Name-link bridging an enacted law to its source bill: `LawID` IS a
 *  `KNS_Bill.BillID` (verified 12/12 K25 laws → real K25 bills, 2026-06-15).
 *  A law may carry several rows (amendments → multiple bills). No KnessetNum. */
export interface KnsIsraelLawName {
  IsraelLawNameID: number;
  IsraelLawID: number;
  LawID: number;            // == KNS_Bill.BillID for our purposes
  LawTypeID: number | null;
  Name: string | null;
  LastUpdatedDate: string | null;
}

/** A bill split into offspring: `SplitBillID` (child) split off `MainBillID`
 *  (parent). 881 rows (verified 2026-06-15). No KnessetNum field. */
export interface KnsBillSplit {
  BillSplitID: number;
  MainBillID: number;
  SplitBillID: number;
  Name: string | null;
  LastUpdatedDate: string | null;
}

/** Shape returned by `KNS_BillInitiator?$expand=KNS_Bill/KNS_DocumentBills`:
 *  each initiator carries its bill inline, and the bill carries its documents. */
export interface KnsBillInitiatorExpanded extends KnsBillInitiator {
  KNS_Bill?: (KnsBill & { KNS_DocumentBills?: KnsDocumentBill[] }) | null;
}

export interface KnsQuery {
  QueryID: number;
  Number: number | null;
  KnessetNum: number | null;
  Name: string | null;
  TypeDesc: string | null;
  StatusID: number | null;
  PersonID: number;
  GovMinistryID: number | null;
  SubmitDate: string | null;
  LastUpdatedDate: string | null;
}

export interface KnsCommittee {
  CommitteeID: number;
  Name: string;
  CategoryDesc: string | null;
  KnessetNum: number | null;
  CommitteeTypeDesc: string | null;
  ParentCommitteeID: number | null;
  IsCurrent: boolean | null;
  LastUpdatedDate: string | null;
}

/**
 * OData JSON envelope — the ParliamentInfo.svc service answers in BOTH dialects
 * depending on the negotiated version:
 *  - v3 (verbose): rows under `d.results`, next page under `d.__next` (absolute).
 *  - v4 (the shape live as of 2026-05-31): rows under `value`, next page under
 *    `odata.nextLink` / `@odata.nextLink` (RELATIVE to the service root).
 * The client reads whichever is present, so both are optional here.
 */
export interface ODataPage<T> {
  // v3
  d?: { results: T[]; __next?: string };
  // v4
  value?: T[];
  "odata.nextLink"?: string;
  "@odata.nextLink"?: string;
  // Total-row count when requested via `$inlinecount=allpages`. The service returns
  // it as a STRING (e.g. "213") under this key — `$count=true` is NOT supported here.
  "odata.count"?: string;
}

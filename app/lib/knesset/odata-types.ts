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
  SubTypeDesc: string | null;
  StatusID: number | null;
  /** Official plain-Hebrew summary — populated mostly on enacted laws
   *  (488/7,434 K25 bills as of 2026-06-12); null for everything else. */
  SummaryLaw: string | null;
  LastUpdatedDate: string | null;
}

/** Shared shape of the KNS_Document* entities (KNS_DocumentBill / KNS_DocumentAgenda).
 *  PK ids are Int64 → serialized as JSON STRINGS (verified live, test-payloads-items.ts). */
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

export interface KnsBillInitiator {
  BillInitiatorID: number;
  BillID: number;
  PersonID: number;
  IsInitiator: boolean | null;
  Ordinal: number | null;
  LastUpdatedDate: string | null;
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

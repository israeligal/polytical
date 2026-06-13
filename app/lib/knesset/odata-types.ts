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
  SummaryLaw: string | null;
  IsContinuationBill: boolean | null;
  PublicationSeriesDesc: string | null;
  LastUpdatedDate: string | null;
}

export interface KnsDocumentBill {
  DocumentBillID: number;       // Int64 in OData; values observed ~10^7, safe as JS number
  BillID: number;
  GroupTypeID: number | null;
  GroupTypeDesc: string | null;
  ApplicationDesc: string | null; // "PDF" | "DOC"
  FilePath: string;               // fs.knesset.gov.il URL (may contain a double slash — verbatim)
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

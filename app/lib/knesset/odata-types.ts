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

/** OData v3 JSON envelope: rows under d.results; paging under d.__next. */
export interface ODataPage<T> {
  d: { results: T[]; __next?: string };
}

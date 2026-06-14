// Raw row shapes of the Knesset website API (knesset.gov.il/WebSiteApi/
// knessetapi) — the only live K25 per-MK vote source (OData Votes.svc is
// frozen at K24). Shapes captured live 2026-06-10; verbatim samples in
// test-payloads.ts. Field names are the service's own (PascalCase).

/** POST Votes/GetVotesHeaders → { Table: WsVoteHeader[] } */
export interface WsVoteHeader {
  VoteId: number;
  VoteProtocolNo: number | null;
  /** Naive Jerusalem wall-clock, e.g. "2026-06-09T19:00:00" (hand votes: "…T00:00:00"). */
  VoteDate: string;
  VoteDateStr: string;
  VoteTimeStr: string;
  /** "אלקטרונית" | "הרמת יד" (headers) — details say "הצבעה אלקטרונית". */
  VoteType: string;
  ItemTitle: string;
  /** Result-count banner on the first row of a window, e.g. "נמצאו 141 תוצאות". */
  VoteDateLongStr?: string;
  KnessetId: number;
  SessionId: number;
}

export interface WsVotesHeadersResponse {
  Table: WsVoteHeader[];
}

/** GET Votes/GetVoteDetails/{voteId} */
export interface WsVoteDetailHeader {
  VoteId: number;
  VoteProtocolNo: number | null;
  VoteDate: string;
  VoteType: string;
  VoteTypeId: number;
  ItemTitle: string;
  /** The OData item id; equals KNS_Bill.BillID for bill votes (verified live). */
  FK_ItemID: number | null;
  /** KNS_ItemType id of FK_ItemID (2=KNS_Bill, 4=KNS_Agenda, 3=no-confidence).
   *  OPEN domain — 9 observed live on a secret vote; store raw, never map closed. */
  LU_ItemType: number | null;
  FK_Knesset: number;
  Decision: string | null;
  ChairmanName: string | null;
  IsForAccepted: boolean | null;
  AcceptedText: string | null;
  SessionNumber: number | null;
}

export interface WsVoteCounter {
  /** "בעד" | "נגד" | "נמנע" (+ possibly more — probe enumerates). */
  Title: string;
  countOfResult: number;
  rn: number;
}

export interface WsVoteDetailRow {
  /** "Last First", e.g. "אזולאי ינון" — NO id of any kind. */
  MkName: string;
  FactionName: string | null;
  /** Website-internal result id (7=בעד observed) — NOT the OData domain. */
  VoteResultId: number;
  Title: string;
}

export interface WsVoteDetailsResponse {
  VoteHeader: WsVoteDetailHeader[];
  VoteCounters: WsVoteCounter[];
  VoteDetails: WsVoteDetailRow[];
  DescreetVoteResults: unknown[];
  HandsWithoutCountersAccepted: unknown[];
  NextAndPrevVotes: { NextVote: number | null; PrevVote: number | null }[];
}

/** GET MKs/GetMksDropDown?languagekey=he — every MK ever, website id space. */
export interface WsMkDropdownRow {
  ID: number;
  Name: string; // "First Last"
  IsCurrent: boolean;
}

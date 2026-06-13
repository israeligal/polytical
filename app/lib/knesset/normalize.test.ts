import { expect, test } from "vitest";
import {
  parseODataDate, buildPositionLabelMap, normalizeFactions, normalizeCurrentMembers,
  normalizeBillSponsors, normalizeBills, normalizeBillDocuments, normalizeBillStatuses, splitExpandedInitiators,
} from "./normalize";
import type {
  KnsBillInitiator, KnsBillInitiatorExpanded, KnsFaction, KnsPersonToPosition, KnsPosition,
} from "./odata-types";

const billProv = { sourceUrl: "https://knesset.gov.il/x", fetchedAt: new Date("2026-06-13T00:00:00Z") };

const PROV = { sourceUrl: "https://x", fetchedAt: new Date("2026-05-31T00:00:00Z") };

test("parseODataDate handles /Date(ms)/ and ISO", () => {
  expect(parseODataDate("/Date(1490000000000)/")?.getTime()).toBe(1490000000000);
  expect(parseODataDate("2022-11-15T00:00:00")?.getFullYear()).toBe(2022);
  expect(parseODataDate(null)).toBeNull();
});

test("normalizeFactions drops sentinel 911 and maps Name->nameHe", () => {
  const raw: KnsFaction[] = [
    { FactionID: 1095, Name: "התאחדות הספרדים", KnessetNum: 25, StartDate: null, FinishDate: null, IsCurrent: true, LastUpdatedDate: null },
    { FactionID: 911, Name: "אין נתונים", KnessetNum: 1, StartDate: "1900-01-01T00:00:00", FinishDate: null, IsCurrent: true, LastUpdatedDate: null },
  ];
  const out = normalizeFactions(raw, PROV);
  expect(out.map((f) => f.factionId)).toEqual([1095]);
  expect(out[0].nameHe).toBe("התאחדות הספרדים");
  expect(out[0].sourceDataset).toBe("KNS_Faction");
});

test("normalizeCurrentMembers: party from PositionID-54 row, role from others, dedupe by PersonID", () => {
  const positions: KnsPosition[] = [
    { PositionID: 43, Description: "חבר הכנסת", LastUpdatedDate: null },
    { PositionID: 54, Description: "חבר סיעה", LastUpdatedDate: null },
    { PositionID: 39, Description: "שר", LastUpdatedDate: null },
  ];
  const labels = buildPositionLabelMap(positions);

  const p2p: KnsPersonToPosition[] = [
    // roster row (faction NULL on 43)
    base({ PersonToPositionID: 1, PersonID: 30749, PositionID: 43, IsCurrent: true }),
    // duplicate roster row for same person -> must dedupe
    base({ PersonToPositionID: 2, PersonID: 30749, PositionID: 43, IsCurrent: true }),
    // faction row (54) carries the party
    base({ PersonToPositionID: 3, PersonID: 30749, PositionID: 54, IsCurrent: true, FactionID: 1095, FactionName: "התאחדות הספרדים", StartDate: "2022-11-15T00:00:00" }),
    // an earlier 54 row -> MIN(StartDate) wins for inKnessetSince
    base({ PersonToPositionID: 4, PersonID: 30749, PositionID: 54, IsCurrent: true, FactionID: 1095, FactionName: "התאחדות הספרדים", StartDate: "2021-04-06T00:00:00" }),
    // a minister role row
    base({ PersonToPositionID: 5, PersonID: 30749, PositionID: 39, IsCurrent: true, GovMinistryName: "משרד הפנים" }),
    // a different person, no 54 row -> party stays null
    base({ PersonToPositionID: 6, PersonID: 48, PositionID: 61, IsCurrent: true }),
    // a non-current row -> ignored
    base({ PersonToPositionID: 7, PersonID: 99, PositionID: 43, IsCurrent: false }),
  ];

  const members = normalizeCurrentMembers({ p2p, positionLabels: labels, prov: PROV });

  expect(members.map((m) => m.personId).sort((a, b) => a - b)).toEqual([48, 30749]);
  const ash = members.find((m) => m.personId === 30749)!;
  expect(ash.factionId).toBe(1095);
  expect(ash.party).toBe("התאחדות הספרדים");
  expect(ash.roleHe).toBe("שר");                       // resolved via KNS_Position.Description
  expect(ash.inKnessetSince).toBe("2021-04-06");       // MIN StartDate of 54 rows, date-only
  expect(ash.active).toBe(true);
  expect((ash.facts as { ministries: string[] }).ministries).toContain("משרד הפנים");
  expect(ash.sourceDataset).toBe("KNS_PersonToPosition");

  const yard = members.find((m) => m.personId === 48)!;
  expect(yard.factionId).toBeNull();                   // no 54 row -> explicit null, never guessed
  expect(yard.party).toBeNull();
});

test("party resolves via factionNameById join (stable id), not the inline FactionName", () => {
  const p2p: KnsPersonToPosition[] = [
    base({ PersonToPositionID: 1, PersonID: 7, PositionID: 43, IsCurrent: true }),
    // inline FactionName is stale; the join map carries the canonical Name
    base({ PersonToPositionID: 2, PersonID: 7, PositionID: 54, IsCurrent: true, FactionID: 1095, FactionName: "שם ישן" }),
  ];
  const factionNameById = new Map<number, string>([[1095, "התאחדות הספרדים"]]);
  const [m] = normalizeCurrentMembers({ p2p, positionLabels: buildPositionLabelMap([]), prov: PROV, factionNameById });
  expect(m.factionId).toBe(1095);
  expect(m.party).toBe("התאחדות הספרדים"); // joined Name, not the inline "שם ישן"
});

test("party falls back to inline FactionName when the join map lacks the id", () => {
  const p2p: KnsPersonToPosition[] = [
    base({ PersonToPositionID: 1, PersonID: 7, PositionID: 43, IsCurrent: true }),
    base({ PersonToPositionID: 2, PersonID: 7, PositionID: 54, IsCurrent: true, FactionID: 1095, FactionName: "מפלגה" }),
  ];
  const [m] = normalizeCurrentMembers({ p2p, positionLabels: buildPositionLabelMap([]), prov: PROV, factionNameById: new Map() });
  expect(m.factionId).toBe(1095);
  expect(m.party).toBe("מפלגה");
});

test("sentinel faction 911 yields null factionId/party (911-only person)", () => {
  const p2p: KnsPersonToPosition[] = [
    base({ PersonToPositionID: 1, PersonID: 7, PositionID: 43, IsCurrent: true }),
    base({ PersonToPositionID: 2, PersonID: 7, PositionID: 54, IsCurrent: true, FactionID: 911, FactionName: "אין נתונים" }),
  ];
  const [m] = normalizeCurrentMembers({ p2p, positionLabels: buildPositionLabelMap([]), prov: PROV, factionNameById: new Map() });
  expect(m.factionId).toBeNull();
  expect(m.party).toBeNull();
});

test("toDateOnly (via inKnessetSince): /Date()/ at Jerusalem midnight keeps the unshifted calendar day", () => {
  // 2022-11-15T00:00:00 Jerusalem (UTC+2, no DST in November) == 2022-11-14T22:00:00Z.
  // A naive UTC toISOString() would shift this back to 2022-11-14; the Jerusalem
  // wall-clock branch must keep it as 2022-11-15 (consistent with the ISO branch).
  const jerusalemMidnightEpoch = Date.UTC(2022, 10, 14, 22, 0, 0); // 1668463200000
  const p2p: KnsPersonToPosition[] = [
    base({ PersonToPositionID: 1, PersonID: 7, PositionID: 43, IsCurrent: true }),
    base({
      PersonToPositionID: 2, PersonID: 7, PositionID: 54, IsCurrent: true,
      FactionID: 1095, FactionName: "x", StartDate: `/Date(${jerusalemMidnightEpoch})/`,
    }),
  ];
  const [m] = normalizeCurrentMembers({ p2p, positionLabels: buildPositionLabelMap([]), prov: PROV });
  expect(m.inKnessetSince).toBe("2022-11-15"); // NOT 2022-11-14
});

test("normalizeBillSponsors drops rows whose bill isn't in the valid (K25) set", () => {
  const raw: KnsBillInitiator[] = [
    { BillInitiatorID: 1, BillID: 1038990, PersonID: 526, IsInitiator: true, Ordinal: 1, LastUpdatedDate: null },
    { BillInitiatorID: 2, BillID: 17000, PersonID: 526, IsInitiator: false, Ordinal: 2, LastUpdatedDate: null }, // old bill, not in K25
    { BillInitiatorID: 3, BillID: 1040059, PersonID: 560, IsInitiator: true, Ordinal: 1, LastUpdatedDate: null },
  ];
  const validBillIds = new Set([1038990, 1040059]); // 17000 absent
  const rows = normalizeBillSponsors(raw, PROV, validBillIds);
  expect(rows.map((r) => r.billId).sort()).toEqual([1038990, 1040059]);
  expect(rows.some((r) => r.billId === 17000)).toBe(false);
});

test("normalizeBillSponsors keeps all rows when no valid set is given", () => {
  const raw: KnsBillInitiator[] = [
    { BillInitiatorID: 1, BillID: 17000, PersonID: 526, IsInitiator: true, Ordinal: 1, LastUpdatedDate: null },
  ];
  expect(normalizeBillSponsors(raw, PROV)).toHaveLength(1);
});

// fixture helper — full KnsPersonToPosition with overridable fields
function base(over: Partial<KnsPersonToPosition> & Pick<KnsPersonToPosition, "PersonToPositionID" | "PersonID" | "PositionID" | "IsCurrent">): KnsPersonToPosition {
  return {
    KnessetNum: 25, StartDate: null, FinishDate: null, GovMinistryID: null, GovMinistryName: null,
    DutyDesc: null, FactionID: null, FactionName: null, GovernmentNum: null, CommitteeID: null,
    CommitteeName: null, LastUpdatedDate: null, ...over,
  };
}

test("normalizeBills carries the widened fields and parses dates", () => {
  const [row] = normalizeBills(
    [{
      BillID: 2243802, KnessetNum: 25, Name: "הצעת חוק כלשהי", SubTypeID: 54, SubTypeDesc: "פרטית",
      PrivateNumber: 6755, CommitteeID: null, Number: null, StatusID: 104,
      PublicationDate: null, SummaryLaw: null, IsContinuationBill: null,
      PublicationSeriesDesc: null, LastUpdatedDate: "2026-06-08T16:15:33.697",
    }],
    billProv,
  );
  expect(row.billId).toBe(2243802);
  expect(row.subTypeId).toBe(54);
  expect(row.privateNumber).toBe(6755);
  expect(row.statusId).toBe(104);
  expect(row.lastUpdatedDate).toEqual(new Date("2026-06-08T16:15:33.697"));
  expect(row.publicationDate).toBeNull();
  expect(row.sourceDataset).toBe("KNS_Bill");
});

test("normalizeBillDocuments maps file links per format", () => {
  const rows = normalizeBillDocuments(
    [
      { DocumentBillID: 11996526, BillID: 2243802, GroupTypeID: 1, GroupTypeDesc: "הצעת חוק לדיון מוקדם", ApplicationDesc: "DOC", FilePath: "https://fs.knesset.gov.il//25/law/x.docx", LastUpdatedDate: null },
      { DocumentBillID: 11996526, BillID: 2243802, GroupTypeID: 1, GroupTypeDesc: "הצעת חוק לדיון מוקדם", ApplicationDesc: "PDF", FilePath: "https://fs.knesset.gov.il//25/law/x.pdf", LastUpdatedDate: null },
    ],
    billProv,
  );
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r.format).sort()).toEqual(["DOC", "PDF"]);
  expect(rows[0].documentBillId).toBe(11996526);
  expect(rows[0].sourceDataset).toBe("KNS_DocumentBill");
});

test("normalizeBillStatuses maps statusId -> Hebrew desc", () => {
  const rows = normalizeBillStatuses([{ StatusID: 104, Desc: "בהכנה לקריאה ראשונה", TypeID: 2, TypeDesc: "הצעת חוק" }], billProv);
  expect(rows[0]).toMatchObject({ statusId: 104, descHe: "בהכנה לקריאה ראשונה", sourceDataset: "KNS_Status" });
});

test("splitExpandedInitiators dedupes bills + documents, flattens sponsors", () => {
  const raw: KnsBillInitiatorExpanded[] = [
    {
      BillInitiatorID: 1, BillID: 900, PersonID: 30300, IsInitiator: true, Ordinal: 1, LastUpdatedDate: null,
      KNS_Bill: {
        BillID: 900, KnessetNum: 25, Name: "חוק א", SubTypeID: 54, SubTypeDesc: "פרטית", PrivateNumber: null,
        CommitteeID: null, Number: null, StatusID: 104, PublicationDate: null, SummaryLaw: null,
        IsContinuationBill: null, PublicationSeriesDesc: null, LastUpdatedDate: null,
        KNS_DocumentBills: [
          { DocumentBillID: 5, BillID: 900, GroupTypeID: 1, GroupTypeDesc: "x", ApplicationDesc: "PDF", FilePath: "p.pdf", LastUpdatedDate: null },
        ],
      },
    },
    {
      BillInitiatorID: 2, BillID: 900, PersonID: 999, IsInitiator: false, Ordinal: 2, LastUpdatedDate: null,
      KNS_Bill: {
        BillID: 900, KnessetNum: 25, Name: "חוק א", SubTypeID: 54, SubTypeDesc: "פרטית", PrivateNumber: null,
        CommitteeID: null, Number: null, StatusID: 104, PublicationDate: null, SummaryLaw: null,
        IsContinuationBill: null, PublicationSeriesDesc: null, LastUpdatedDate: null,
        KNS_DocumentBills: [
          { DocumentBillID: 5, BillID: 900, GroupTypeID: 1, GroupTypeDesc: "x", ApplicationDesc: "PDF", FilePath: "p.pdf", LastUpdatedDate: null },
        ],
      },
    },
  ];
  const { bills, sponsors, documents } = splitExpandedInitiators(raw);
  expect(bills.map((b) => b.BillID)).toEqual([900]);          // deduped
  expect(sponsors.map((s) => s.BillInitiatorID)).toEqual([1, 2]); // both kept
  expect(documents.map((d) => d.DocumentBillID)).toEqual([5]);  // deduped by id+format
});

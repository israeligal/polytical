import { expect, test } from "vitest";
import {
  parseODataDate, buildPositionLabelMap, normalizeFactions, normalizeCurrentMembers,
} from "./normalize";
import type { KnsFaction, KnsPersonToPosition, KnsPosition } from "./odata-types";

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

// fixture helper — full KnsPersonToPosition with overridable fields
function base(over: Partial<KnsPersonToPosition> & Pick<KnsPersonToPosition, "PersonToPositionID" | "PersonID" | "PositionID" | "IsCurrent">): KnsPersonToPosition {
  return {
    KnessetNum: 25, StartDate: null, FinishDate: null, GovMinistryID: null, GovMinistryName: null,
    DutyDesc: null, FactionID: null, FactionName: null, GovernmentNum: null, CommitteeID: null,
    CommitteeName: null, LastUpdatedDate: null, ...over,
  };
}

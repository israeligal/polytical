import { afterEach, beforeEach, expect, test } from "vitest";
import { sql, eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { politicians } from "@/app/lib/schema";
import { buildPositionLabelMap, normalizeCurrentMembers } from "./normalize";
import { upsertMembers } from "./repo";
import type { KnsPersonToPosition, KnsPosition } from "./odata-types";

let h: Awaited<ReturnType<typeof createTestDb>>;
const PROV = { sourceUrl: "https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_PersonToPosition", fetchedAt: new Date("2026-05-31T00:00:00Z") };
beforeEach(async () => { h = await createTestDb(); });
afterEach(async () => { await h.close(); });

function p2pRow(over: Partial<KnsPersonToPosition> & Pick<KnsPersonToPosition, "PersonToPositionID" | "PersonID" | "PositionID">): KnsPersonToPosition {
  return {
    KnessetNum: 25, StartDate: null, FinishDate: null, GovMinistryID: null, GovMinistryName: null,
    DutyDesc: null, FactionID: null, FactionName: null, GovernmentNum: null, CommitteeID: null,
    CommitteeName: null, IsCurrent: true, LastUpdatedDate: null, ...over,
  };
}

test("party-via-54, dedupe, searchName, idempotent upsert + trigram discovery", async () => {
  const positions: KnsPosition[] = [
    { PositionID: 43, Description: "חבר הכנסת", LastUpdatedDate: null },
    { PositionID: 54, Description: "חבר סיעה", LastUpdatedDate: null },
  ];
  const labels = buildPositionLabelMap(positions);
  const persons = [{ PersonID: 30749, FirstName: "יעקב", LastName: "אשר", GenderDesc: null, Email: null, IsCurrent: true, LastUpdatedDate: null }];

  const p2p: KnsPersonToPosition[] = [
    p2pRow({ PersonToPositionID: 1, PersonID: 30749, PositionID: 43 }),
    p2pRow({ PersonToPositionID: 2, PersonID: 30749, PositionID: 43 }), // dup roster row
    p2pRow({ PersonToPositionID: 3, PersonID: 30749, PositionID: 54, FactionID: 1095, FactionName: "התאחדות הספרדים", StartDate: "2022-11-15T00:00:00" }),
  ];

  const members = normalizeCurrentMembers({ p2p, positionLabels: labels, persons, prov: PROV });
  expect(members.length).toBe(1);                 // deduped by PersonID
  expect(members[0].factionId).toBe(1095);        // party via the 54 row
  expect(members[0].searchName).toContain("אשר"); // normalized name present

  await upsertMembers({ db: h.db, rows: members });
  await upsertMembers({ db: h.db, rows: members }); // idempotent re-run
  const all = await h.db.select().from(politicians);
  expect(all.length).toBe(1);

  // Discovery (trigram): ranks candidates; we then resolve by stable id.
  const hits = await h.db.execute(sql`
    select "personId" from "politicians"
    where "searchName" % ${"אשר"}
    order by similarity("searchName", ${"אשר"}) desc
    limit 5
  `);
  const rows = (hits as unknown as { rows: Array<{ personId: number }> }).rows ?? (hits as unknown as Array<{ personId: number }>);
  const chosen = rows[0];
  expect(chosen.personId).toBe(30749);
  // attribution always re-resolves by stable id, never by the search string
  const [byId] = await h.db.select().from(politicians).where(eq(politicians.personId, chosen.personId));
  expect(byId.party).toBe("התאחדות הספרדים");
});

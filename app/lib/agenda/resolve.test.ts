// Resolution sweep on real PGlite (the keystone): when an announced item's bill
// gets its decisive vote, set linkedVoteId + voted and adopt every pre-vote
// stance into user_stances atomically + idempotently. The adopted rows must be
// matchable (they sit on a decisive scoreable vote).
import { beforeEach, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { agendaItems, agendaStances, bills, knessetVotes, userStances, users } from "@/app/lib/schema";
import { CURRENT_KNESSET } from "@/app/lib/knesset/odata";
import { getScoreableStanceCount } from "@/app/lib/stances/repo";
import { resolveAgendaItems } from "./resolve";

let h: Awaited<ReturnType<typeof createTestDb>>;
const FETCHED = new Date("2026-06-14T00:00:00Z");
const PROV = { sourceDataset: "t", sourceUrl: "https://t", fetchedAt: FETCHED };

async function seedItem(billId: number, status: "announced" | "voted" = "announced"): Promise<string> {
  await h.db.insert(bills).values({ billId, knessetNum: CURRENT_KNESSET, nameHe: `חוק ${billId}`, statusId: 113, ...PROV });
  const [row] = await h.db
    .insert(agendaItems)
    .values({ titleHe: `חוק ${billId}`, billId, addedBy: "ingest", status, ...PROV })
    .returning({ id: agendaItems.id });
  return row.id;
}
async function seedDecisiveVote(voteId: number, billId: number, over?: Partial<typeof knessetVotes.$inferInsert>) {
  await h.db.insert(knessetVotes).values({
    voteId, knessetNum: CURRENT_KNESSET, billId, titleHe: `חוק ${billId}`,
    voteDate: new Date("2026-06-13T10:00:00Z"), voteType: "electronic", isDecisive: true, ...PROV, ...over,
  });
}

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values([
    { id: "u1", name: "א", email: "u1@x.co" },
    { id: "u2", name: "ב", email: "u2@x.co" },
  ]);
});

test("resolves an announced item whose bill has a decisive vote, adopting stances", async () => {
  const item = await seedItem(1);
  await h.db.insert(agendaStances).values([
    { userId: "u1", agendaItemId: item, stance: "for" },
    { userId: "u2", agendaItemId: item, stance: "against" },
  ]);
  await seedDecisiveVote(9001, 1);
  const res = await resolveAgendaItems({ db: h.db });
  expect(res).toEqual({ resolved: 1, adopted: 2 });

  const [a] = await h.db.select().from(agendaItems).where(eq(agendaItems.billId, 1));
  expect(a.status).toBe("voted");
  expect(a.linkedVoteId).toBe(9001);

  const adopted = await h.db.select().from(userStances).where(eq(userStances.voteId, 9001));
  expect(adopted.map((s) => [s.userId, s.stance]).sort()).toEqual([["u1", "for"], ["u2", "against"]].sort());
});

test("leaves an announced item with no decisive vote untouched", async () => {
  const item = await seedItem(1);
  await h.db.insert(agendaStances).values([{ userId: "u1", agendaItemId: item, stance: "for" }]);
  await seedDecisiveVote(9001, 1, { isDecisive: false }); // a non-decisive vote exists
  const res = await resolveAgendaItems({ db: h.db });
  expect(res).toEqual({ resolved: 0, adopted: 0 });
  const [a] = await h.db.select().from(agendaItems).where(eq(agendaItems.billId, 1));
  expect(a.status).toBe("announced");
  expect((await h.db.select().from(userStances)).length).toBe(0);
});

test("is idempotent — re-running does not double-adopt nor re-resolve", async () => {
  const item = await seedItem(1);
  await h.db.insert(agendaStances).values([{ userId: "u1", agendaItemId: item, stance: "for" }]);
  await seedDecisiveVote(9001, 1);
  await resolveAgendaItems({ db: h.db });
  const second = await resolveAgendaItems({ db: h.db });
  expect(second).toEqual({ resolved: 0, adopted: 0 }); // already voted, not re-picked
  expect((await h.db.select().from(userStances).where(eq(userStances.voteId, 9001))).length).toBe(1);
});

test("a pre-existing user_stance on the vote is not duplicated (ON CONFLICT DO NOTHING)", async () => {
  const item = await seedItem(1);
  await h.db.insert(agendaStances).values([{ userId: "u1", agendaItemId: item, stance: "against" }]);
  await seedDecisiveVote(9001, 1);
  await h.db.insert(userStances).values({ userId: "u1", voteId: 9001, stance: "for" }); // already stanced post-hoc
  const res = await resolveAgendaItems({ db: h.db });
  expect(res.resolved).toBe(1);
  expect(res.adopted).toBe(0); // conflict — existing stance wins, not overwritten
  const [s] = await h.db.select().from(userStances).where(and(eq(userStances.userId, "u1"), eq(userStances.voteId, 9001)));
  expect(s.stance).toBe("for");
});

test("adopted stance is matchable (counts as a scoreable stance)", async () => {
  const item = await seedItem(1);
  await h.db.insert(agendaStances).values([{ userId: "u1", agendaItemId: item, stance: "for" }]);
  await seedDecisiveVote(9001, 1); // electronic + decisive = scoreable
  await resolveAgendaItems({ db: h.db });
  expect(await getScoreableStanceCount({ db: h.db, userId: "u1" })).toBe(1);
});

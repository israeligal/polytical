// Agenda-stance service on real PGlite: announced-only guard, toggle delegation,
// and the k-gated community aggregate (mirrors the user_stances service).
import { beforeEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { agendaItems, users } from "@/app/lib/schema";
import { AgendaItemNotFoundError, AgendaItemNotStanceableError } from "@/app/lib/errors";
import { setAgendaStance, getAgendaStanceState, AGENDA_AGGREGATE_MIN_STANCERS } from "./service";

let h: Awaited<ReturnType<typeof createTestDb>>;
const PROV = { sourceDataset: "test", sourceUrl: "https://example.test", fetchedAt: new Date("2026-06-14T00:00:00Z") };

async function seedItem(over?: Partial<typeof agendaItems.$inferInsert>): Promise<string> {
  const [row] = await h.db
    .insert(agendaItems)
    .values({ titleHe: "הצעת חוק", addedBy: "ingest", status: "announced", ...PROV, ...over })
    .returning({ id: agendaItems.id });
  return row.id;
}

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values(
    Array.from({ length: 12 }, (_, i) => ({ id: `u${i}`, name: `u${i}`, email: `u${i}@x.co` })),
  );
});

test("setAgendaStance sets, flips, and retracts on an announced item", async () => {
  const item = await seedItem();
  expect((await setAgendaStance({ db: h.db, userId: "u0", agendaItemId: item, stance: "for" })).stance).toBe("for");
  expect((await setAgendaStance({ db: h.db, userId: "u0", agendaItemId: item, stance: "against" })).stance).toBe("against");
  expect((await setAgendaStance({ db: h.db, userId: "u0", agendaItemId: item, stance: "against" })).stance).toBeNull();
});

test("setAgendaStance throws on a missing item", async () => {
  await expect(
    setAgendaStance({ db: h.db, userId: "u0", agendaItemId: "00000000-0000-0000-0000-000000000000", stance: "for" }),
  ).rejects.toThrow(AgendaItemNotFoundError);
});

test("setAgendaStance refuses a voted/dropped item (announced-only)", async () => {
  const voted = await seedItem({ status: "voted" });
  const dropped = await seedItem({ status: "dropped" });
  await expect(setAgendaStance({ db: h.db, userId: "u0", agendaItemId: voted, stance: "for" })).rejects.toThrow(AgendaItemNotStanceableError);
  await expect(setAgendaStance({ db: h.db, userId: "u0", agendaItemId: dropped, stance: "for" })).rejects.toThrow(AgendaItemNotStanceableError);
});

test("aggregate stays hidden below k, appears at k (for the viewer with a stance)", async () => {
  const item = await seedItem();
  // k-1 stancers
  for (let i = 0; i < AGENDA_AGGREGATE_MIN_STANCERS - 1; i++) {
    await setAgendaStance({ db: h.db, userId: `u${i}`, agendaItemId: item, stance: i % 2 ? "against" : "for" });
  }
  const below = await getAgendaStanceState({ db: h.db, userId: "u0", agendaItemId: item });
  expect(below.stance).toBe("for");
  expect(below.aggregate).toBeNull();
  // the k-th stancer crosses the threshold
  await setAgendaStance({ db: h.db, userId: `u${AGENDA_AGGREGATE_MIN_STANCERS - 1}`, agendaItemId: item, stance: "for" });
  const at = await getAgendaStanceState({ db: h.db, userId: "u0", agendaItemId: item });
  expect(at.aggregate).not.toBeNull();
  expect(at.aggregate!.total).toBe(AGENDA_AGGREGATE_MIN_STANCERS);
});

test("aggregate hidden when the viewer has no stance (even above k)", async () => {
  const item = await seedItem();
  for (let i = 0; i < AGENDA_AGGREGATE_MIN_STANCERS; i++) {
    await setAgendaStance({ db: h.db, userId: `u${i}`, agendaItemId: item, stance: "for" });
  }
  const viewer = await getAgendaStanceState({ db: h.db, userId: "u11", agendaItemId: item }); // u11 never voted
  expect(viewer.stance).toBeNull();
  expect(viewer.aggregate).toBeNull();
});

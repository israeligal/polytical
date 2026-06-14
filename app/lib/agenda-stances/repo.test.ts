// agenda_stances repo on real PGlite: atomic toggle (set/flip/retract) keyed by
// (userId, agendaItemId), and the raw community split. Mirrors the user_stances repo.
import { beforeEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { agendaItems, users } from "@/app/lib/schema";
import {
  toggleAgendaStance, getAgendaStance, getAgendaStancesForItems, getAgendaStanceCounts,
} from "./repo";

let h: Awaited<ReturnType<typeof createTestDb>>;

const PROV = { sourceDataset: "test", sourceUrl: "https://example.test", fetchedAt: new Date("2026-06-14T00:00:00Z") };

async function seedItem(over?: Partial<typeof agendaItems.$inferInsert>): Promise<string> {
  const [row] = await h.db
    .insert(agendaItems)
    .values({ titleHe: "הצעת חוק כלשהי", addedBy: "ingest", status: "announced", ...PROV, ...over })
    .returning({ id: agendaItems.id });
  return row.id;
}

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values([
    { id: "u1", name: "אחת", email: "u1@x.co" },
    { id: "u2", name: "שתיים", email: "u2@x.co" },
  ]);
});

test("toggleAgendaStance sets, then flips in place", async () => {
  const item = await seedItem();
  expect(await toggleAgendaStance({ db: h.db, userId: "u1", agendaItemId: item, stance: "for" })).toEqual({ stance: "for" });
  expect(await getAgendaStance({ db: h.db, userId: "u1", agendaItemId: item })).toBe("for");
  expect(await toggleAgendaStance({ db: h.db, userId: "u1", agendaItemId: item, stance: "against" })).toEqual({ stance: "against" });
  expect(await getAgendaStance({ db: h.db, userId: "u1", agendaItemId: item })).toBe("against");
});

test("re-tapping the selected side retracts (deletes)", async () => {
  const item = await seedItem();
  await toggleAgendaStance({ db: h.db, userId: "u1", agendaItemId: item, stance: "for" });
  expect(await toggleAgendaStance({ db: h.db, userId: "u1", agendaItemId: item, stance: "for" })).toEqual({ stance: null });
  expect(await getAgendaStance({ db: h.db, userId: "u1", agendaItemId: item })).toBeNull();
});

test("getAgendaStancesForItems maps each item to the user's pick", async () => {
  const a = await seedItem();
  const b = await seedItem();
  await toggleAgendaStance({ db: h.db, userId: "u1", agendaItemId: a, stance: "for" });
  await toggleAgendaStance({ db: h.db, userId: "u1", agendaItemId: b, stance: "against" });
  const map = await getAgendaStancesForItems({ db: h.db, userId: "u1", agendaItemIds: [a, b] });
  expect(map.get(a)).toBe("for");
  expect(map.get(b)).toBe("against");
});

test("getAgendaStanceCounts returns the raw community split (no k-gate here)", async () => {
  const item = await seedItem();
  await toggleAgendaStance({ db: h.db, userId: "u1", agendaItemId: item, stance: "for" });
  await toggleAgendaStance({ db: h.db, userId: "u2", agendaItemId: item, stance: "against" });
  expect(await getAgendaStanceCounts({ db: h.db, agendaItemId: item })).toEqual({ forCount: 1, againstCount: 1 });
});

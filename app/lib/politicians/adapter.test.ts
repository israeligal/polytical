import { expect, test } from "vitest";
import type { PoliticianRow } from "./repo";
import { dbToCard } from "./adapter";

// Pure mapping tests for dbToCard — no DB. We assert the front-end `Politician`
// shape, the null-fallback behavior (party/role/inKnessetSince), and that the
// derived categorical color always lands in the 1..8 slot range. The color is
// now assigned stably per distinct factionId (first-seen → next free slot,
// cycling after 8) rather than `factionId % 8`, so we assert range +
// determinism, not a hard-coded slot — the exact slot depends on encounter
// order across the module's lifetime.

function row(overrides: Partial<PoliticianRow>): PoliticianRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    personId: 1,
    mkSiteId: null,
    nameHe: "ישראל ישראלי",
    nameEn: null,
    party: "מפלגה",
    factionId: 3,
    roleHe: "שר",
    inKnessetSince: "2015-03-17",
    dob: null,
    imageUrl: null,
    facts: {},
    active: true,
    gender: null,
    searchName: "israel israeli",
    billsCurrent: null,
    billsLifetime: null,
    queriesCurrent: null,
    queriesLifetime: null,
    activityCountsFetchedAt: null,
    sourceDataset: "KNS_PersonToPosition",
    sourceUrl: "https://knesset.gov.il/odata",
    fetchedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

test("dbToCard maps a fully-populated row to the front-end Politician shape", () => {
  const card = dbToCard(row({ personId: 42, factionId: 3 }));
  expect(card.id).toBe("42"); // personId stringified — it is the route id
  expect(card.name).toBe("ישראל ישראלי");
  expect(card.party).toBe("מפלגה");
  expect(card.role).toBe("שר");
  expect(card.cat).toBeGreaterThanOrEqual(1);
  expect(card.cat).toBeLessThanOrEqual(8);
  expect(card.facts).toEqual([
    { label: "סיעה", value: "מפלגה" },
    { label: "תפקיד", value: "שר" },
    { label: "בסיעה מאז", value: "2015" },
  ]);
  expect(card.imageUrl).toBeUndefined();
});

test("null party/role/inKnessetSince → empty party, role default, 'סיעה' fact dropped", () => {
  const card = dbToCard(
    row({ party: null, roleHe: null, inKnessetSince: null, factionId: null }),
  );
  expect(card.party).toBe(""); // empty, not the "ללא סיעה" placeholder
  expect(card.role).toBe("חבר/ת הכנסת");
  expect(card.cat).toBeGreaterThanOrEqual(1);
  expect(card.cat).toBeLessThanOrEqual(8);
  // No party → no "סיעה" fact, and no "בסיעה מאז" row.
  expect(card.facts).toEqual([{ label: "תפקיד", value: "חבר/ת הכנסת" }]);
});

test("color slot is stable & deterministic per distinct factionId", () => {
  // Same factionId → same slot, regardless of how many times it is mapped.
  const a = dbToCard(row({ factionId: 100 }));
  const b = dbToCard(row({ factionId: 100, personId: 2 }));
  expect(b.cat).toBe(a.cat);
  // A different factionId gets its own (distinct) slot while we are still
  // within the first 8 distinct factions seen by the module.
  const c = dbToCard(row({ factionId: 200 }));
  expect(c.cat).not.toBe(a.cat);
});

test("blank/whitespace party and role are treated as empty → empty party, default role", () => {
  const card = dbToCard(row({ party: "   ", roleHe: "  " }));
  expect(card.party).toBe("");
  expect(card.role).toBe("חבר/ת הכנסת");
});

test("dbToCard surfaces the Norwegian-minister flag and drops an empty party", () => {
  const card = dbToCard(row({
    party: null, roleHe: "שר החוץ",
    facts: { isNorwegianMinister: true },
  }));
  expect(card.isNorwegianMinister).toBe(true);
  expect(card.role).toBe("שר החוץ");
  expect(card.party).toBe("");
  expect(card.facts.find((f) => f.label === "סיעה")).toBeUndefined();
});

test("dbToCard: a normal MK keeps party and is not flagged", () => {
  const card = dbToCard(row({ party: "מפלגה" }));
  expect(card.isNorwegianMinister).toBe(false);
  expect(card.party).toBe("מפלגה");
});

test("gender=male → gendered role fallback 'חבר הכנסת'", () => {
  const card = dbToCard(row({ roleHe: null, gender: "male" }));
  expect(card.role).toBe("חבר הכנסת");
  expect(card.gender).toBe("male");
});

test("gender=female → gendered role fallback 'חברת הכנסת'", () => {
  const card = dbToCard(row({ roleHe: null, gender: "female" }));
  expect(card.role).toBe("חברת הכנסת");
  expect(card.gender).toBe("female");
});

test("gender=null (unknown) → neutral role fallback 'חבר/ת הכנסת'", () => {
  const card = dbToCard(row({ roleHe: null, gender: null }));
  expect(card.role).toBe("חבר/ת הכנסת");
  expect(card.gender).toBeUndefined();
});

test("explicit roleHe is never overridden by gender fallback", () => {
  const card = dbToCard(row({ roleHe: "שרת החוץ", gender: "female" }));
  expect(card.role).toBe("שרת החוץ");
  expect(card.gender).toBe("female");
});

test("derived categorical color is always within the 1..8 slot range", () => {
  for (const factionId of [null, 0, 1, 7, 8, 15, 54, 911, 1000]) {
    const { cat } = dbToCard(row({ factionId }));
    expect(cat).toBeGreaterThanOrEqual(1);
    expect(cat).toBeLessThanOrEqual(8);
  }
});

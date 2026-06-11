import { expect, test } from "vitest";
import { groupByFaction, type MkVoteWithPolitician } from "./read-repo";

function row(over: Partial<MkVoteWithPolitician>): MkVoteWithPolitician {
  return { personId: 1, result: "for", factionId: 1, factionNameHe: "א", politician: null, ...over };
}

test("groups by faction name, largest first; null faction lands in ללא שיוך", () => {
  const groups = groupByFaction([
    row({ personId: 1, factionNameHe: "א" }),
    row({ personId: 2, factionNameHe: "ב" }),
    row({ personId: 3, factionNameHe: "ב" }),
    row({ personId: 4, factionNameHe: null, factionId: null }),
  ]);
  expect(groups.map((g) => g.name)).toEqual(["ב", "א", "ללא שיוך סיעתי"]);
  expect(groups[0].members).toHaveLength(2);
});

test("members within a faction cluster by result (enum order, locale-stable)", () => {
  const [g] = groupByFaction([
    row({ personId: 1, result: "for" }),
    row({ personId: 2, result: "abstain" }),
    row({ personId: 3, result: "against" }),
    row({ personId: 4, result: "for" }),
  ]);
  expect(g.members.map((m) => m.result)).toEqual(["abstain", "against", "for", "for"]);
});

test("empty breakdown yields no groups", () => {
  expect(groupByFaction([])).toEqual([]);
});

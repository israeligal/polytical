import { expect, test } from "vitest";
import { statureTierForPolitician } from "./rarity";

// 999999 is a fake personId in none of the party-leader / former-PM lists, so the
// tier is decided purely by the role regex — isolating the "לשעבר" guard.

test("current minister → uncommon (sapphire)", () => {
  expect(statureTierForPolitician({ personId: 999999, role: "שר הביטחון" })).toBe("uncommon");
});

test("current PM → legendary", () => {
  expect(statureTierForPolitician({ personId: 999999, role: "ראש הממשלה" })).toBe("legendary");
});

test("former minister ('שר X לשעבר') is NOT a sitting-minister tier", () => {
  expect(statureTierForPolitician({ personId: 999999, role: "שר הביטחון לשעבר" })).toBe("common");
});

test("'ראש הממשלה לשעבר' is NOT treated as a sitting PM", () => {
  expect(statureTierForPolitician({ personId: 999999, role: "ראש הממשלה לשעבר" })).not.toBe("legendary");
});

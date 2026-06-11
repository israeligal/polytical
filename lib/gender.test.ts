import { expect, test } from "vitest";
import { mkTitle, appearsIn, voted } from "./gender";

// Unit tests for the gendered-copy helpers. The null-fallback for each function
// MUST be byte-identical to the string currently in production — callers that
// pass null (unknown gender) see zero copy change.

test("mkTitle — male", () => {
  expect(mkTitle({ gender: "male" })).toBe("חבר הכנסת");
});

test("mkTitle — female", () => {
  expect(mkTitle({ gender: "female" })).toBe("חברת הכנסת");
});

test("mkTitle — null (unknown) returns today's neutral form", () => {
  expect(mkTitle({ gender: null })).toBe("חבר/ת הכנסת");
});

test("appearsIn — female", () => {
  expect(appearsIn({ gender: "female" })).toBe("שהיא מופיעה בהן");
});

test("appearsIn — male returns today's copy (null and male both map to it)", () => {
  expect(appearsIn({ gender: "male" })).toBe("שהוא מופיע בהן");
});

test("appearsIn — null (unknown) returns today's copy unchanged", () => {
  expect(appearsIn({ gender: null })).toBe("שהוא מופיע בהן");
});

test("voted — male", () => {
  expect(voted({ gender: "male" })).toBe("הצביע");
});

test("voted — female", () => {
  expect(voted({ gender: "female" })).toBe("הצביעה");
});

test("voted — null (unknown) returns today's neutral slash form", () => {
  expect(voted({ gender: null })).toBe("הצביע/ה");
});

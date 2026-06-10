import { expect, test } from "vitest";
import { HANDLE_RE, normalizeHandle } from "./handle";

test.each([
  ["latin", "swift_falcon_7", true],
  ["hebrew", "מנדט_עודף", true],
  ["hebrew with digits", "קואליציה_42", true],
  ["hebrew final letters", "בלגן_שקט", true],
  ["mixed scripts rejected", "מנדטx", false],
  ["mixed scripts rejected 2", "abcד", false],
  ["niqqud rejected", "מַנדט_עודף", false],
  ["geresh rejected", "אג׳נדה", false],
  ["too short", "אב", false],
  ["too long latin", "a".repeat(21), false],
  ["too long hebrew", "א".repeat(21), false],
  ["spaces rejected", "מנדט עודף", false],
  ["uppercase rejected (pre-normalize)", "Falcon", false],
  ["digits-only ok", "12345", true],
])("HANDLE_RE %s", (_name, input, ok) => {
  expect(HANDLE_RE.test(input)).toBe(ok);
});

test("normalizeHandle strips @, trims, lowercases — Hebrew untouched", () => {
  expect(normalizeHandle("  @Falcon_7 ")).toBe("falcon_7");
  expect(normalizeHandle("@מנדט_עודף")).toBe("מנדט_עודף");
});

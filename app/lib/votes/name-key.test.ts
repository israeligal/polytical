import { expect, test } from "vitest";
import { nameKey } from "@/app/lib/votes/name-key";

test("token order is irrelevant — website 'Last First' equals OData 'First Last'", () => {
  expect(nameKey("אזולאי ינון")).toBe(nameKey("ינון אזולאי"));
  expect(nameKey("כץ אופיר")).toBe(nameKey("אופיר כץ"));
});

test("final forms fold so כץ matches its folded spelling", () => {
  expect(nameKey("כץ אופיר")).toBe(nameKey("כצ אופיר"));
});

test("geresh names stay one token (ג'בארין is not split)", () => {
  const k = nameKey("ג׳בארין יוסף");
  expect(k.split(" ")).toHaveLength(2);
  expect(nameKey("יוסף ג'בארין")).toBe(k); // ASCII apostrophe variant, reversed order
});

test("niqqud doesn't change the key (same letters, pointed vs plain)", () => {
  expect(nameKey("דָּוִידְסוֹן סִימוֹן")).toBe(nameKey("דוידסון סימון"));
});

test("empty / whitespace input yields an empty key", () => {
  expect(nameKey("")).toBe("");
  expect(nameKey("   ")).toBe("");
});

test("distinct people produce distinct keys", () => {
  expect(nameKey("ליברמן אביגדור")).not.toBe(nameKey("לוי מיקי"));
});

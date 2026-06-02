import { expect, test } from "vitest";
import { normalizeSearchName } from "./search-name";

test("lowercases and trims", () => {
  expect(normalizeSearchName("  Benjamin NETANYAHU  ")).toBe("benjamin netanyahu");
});

test("strips niqqud (Hebrew vowel points U+0591–U+05C7)", () => {
  expect(normalizeSearchName("יִרְדְּנָה")).toBe("ירדנה");
});

test("folds final-form letters to their base form", () => {
  // ך ם ן ף ץ -> כ מ נ פ צ
  expect(normalizeSearchName("נproperly")).toBeTypeOf("string");
  expect(normalizeSearchName("ירדן")).toBe("ירדנ");
  expect(normalizeSearchName("שלום")).toBe("שלומ");
});

test("strips a CHAIN of leading particles down to the stem (ו ה ב ל כ מ ש)", () => {
  // Peels particles one at a time while the stem stays a plausible >=4-char word.
  // So a query/index reduces to the same stem regardless of stacked clitics.
  // Discovery-only: attribution always resolves by stable id, never by this.
  expect(normalizeSearchName("בנימין")).toBe("נימינ"); // ב stripped, final ן->נ
  expect(normalizeSearchName("הכנסת")).toBe("כנסת");   // ה stripped (stem stays 4 chars)
  expect(normalizeSearchName("ולפיד")).toBe("לפיד");   // ו stripped
});

test("definite-article + preposition reduces to the same stem as the bare word (the search particle fix)", () => {
  // The bug: 'הבחירות' (ה+ב+חירות) used to be left untouched while 'בחירות'
  // reduced to 'חירות', so an indexed market never matched a query typed WITH
  // the definite article. Both must now collapse to the SAME stem.
  expect(normalizeSearchName("בחירות")).toBe(normalizeSearchName("הבחירות"));
  expect(normalizeSearchName("בחירות")).toBe("חירות");
  expect(normalizeSearchName("הבחירות")).toBe("חירות");
  // Surnames with a stacked article+particle likewise converge.
  expect(normalizeSearchName("ליברמן")).toBe(normalizeSearchName("הליברמן"));
});

test("collapses internal whitespace and drops punctuation", () => {
  // הורוביץ → רוביצ (the chain-strip peels the leading ה+ו particles; applied
  // identically to query + index, so the surname still matches in discovery).
  expect(normalizeSearchName("מלר-הורוביץ   ירדנה")).toBe("מלר רוביצ ירדנה");
});

test("deletes Hebrew geresh (U+05F3) in place — token stays whole", () => {
  // ג + ׳ (U+05F3) + בארין must collapse to ONE token, not "ג בארינ".
  expect(normalizeSearchName("ג׳בארין")).toBe("גבארינ");
});

test("deletes Hebrew gershayim (U+05F4) in place — token stays whole", () => {
  // ר + ׳ ... using gershayim between letters: stays one token.
  expect(normalizeSearchName("צ״לי")).toBe("צלי");
});

test("deletes ASCII apostrophe/quote in place — token stays whole", () => {
  expect(normalizeSearchName("צ'רלי")).toBe("צרלי");
  expect(normalizeSearchName(`ג"בארין`)).toBe("גבארינ");
});

test("is idempotent", () => {
  const once = normalizeSearchName("הַנֵּשִׂיא");
  expect(normalizeSearchName(once)).toBe(once);
});

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

test("strips a single leading particle (ו ה ב ל כ מ ש)", () => {
  // The strip is conservative + idempotent: it fires only when the stem stays
  // a plausible >=4-char word AND does not itself start with a particle (the
  // guard that keeps re-normalization a no-op). So בנימין -> נימינ (ב stripped,
  // final ן->נ). הכנסת / ולפיד keep their prefix because the stem (כנסת / לפיד)
  // begins with a particle letter — stripping there would cascade and break
  // idempotency; "ה as article" vs "ה as root" is lexical, undecidable here.
  // Discovery-only: attribution always resolves by stable id, never by this.
  expect(normalizeSearchName("בנימין")).toBe("נימינ"); // ב stripped, final ן->נ
  expect(normalizeSearchName("הכנסת")).toBe("הכנסת");   // stem כנסת starts with particle -> kept
  expect(normalizeSearchName("ולפיד")).toBe("ולפיד");   // stem לפיד starts with particle -> kept
});

test("collapses internal whitespace and drops punctuation", () => {
  expect(normalizeSearchName("מלר-הורוביץ   ירדנה")).toBe("מלר הורוביצ ירדנה");
});

test("is idempotent", () => {
  const once = normalizeSearchName("הַנֵּשִׂיא");
  expect(normalizeSearchName(once)).toBe(once);
});

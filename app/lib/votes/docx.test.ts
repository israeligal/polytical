// Extraction is exercised against the REAL captured DOCX fixtures (see
// test-payloads-items.ts header for refresh commands) — no synthetic zips.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { extractDocxText, extractExplanatoryNotes } from "./docx";

const FIXTURES = join(__dirname, "fixtures");
const billDocx = new Uint8Array(readFileSync(join(FIXTURES, "25_lst_7584510.docx")));
const agendaDocx = new Uint8Array(readFileSync(join(FIXTURES, "25_as_13440018.docx")));

describe("extractDocxText", () => {
  test("yields the plain Hebrew body of a real bill DOCX", () => {
    const text = extractDocxText({ docx: billDocx });
    expect(text).toContain("דברי הסבר");
    expect(text).toContain("הצעת חוק זכויות נפגעי עבירה");
    expect(text).not.toMatch(/<w:|<\/w:/); // no WordprocessingML left
    expect(text).not.toContain("﻿"); // BOM stripped
  });

  test("throws on a zip without word/document.xml", () => {
    // tiny valid zip with a single unrelated file, built with fflate itself
    expect(() => extractDocxText({ docx: new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]) }))
      .toThrow(/word\/document\.xml/);
  });
});

describe("extractExplanatoryNotes", () => {
  test("returns the verbatim דברי הסבר of the bill, without the submission boilerplate", () => {
    const notes = extractExplanatoryNotes({ text: extractDocxText({ docx: billDocx }) });
    expect(notes).not.toBeNull();
    expect(notes!).toMatch(/^סעיף 22א לחוק זכויות נפגעי עבירה/);
    expect(notes!).toContain("ערכות דגימה");
    expect(notes!).not.toContain("הוגשה ליו\"ר הכנסת"); // boilerplate after the dash rule cut
    expect(notes!).not.toMatch(/-{5,}/);
  });

  test("returns the agenda motion's דברי הסבר, without the signature block", () => {
    const notes = extractExplanatoryNotes({ text: extractDocxText({ docx: agendaDocx }) });
    expect(notes).not.toBeNull();
    expect(notes!).toMatch(/^מדינת ישראל מצויה/);
    expect(notes!).not.toContain("בכבוד רב"); // trailing signature cut
  });

  test("explicit not-found: null when no דברי הסבר heading exists", () => {
    expect(extractExplanatoryNotes({ text: "סתם טקסט בלי כותרת רלוונטית" })).toBeNull();
  });

  test("null when the heading exists but the section is empty", () => {
    expect(extractExplanatoryNotes({ text: "כותרת\nדברי הסבר:\n---------\nחתימה" })).toBeNull();
  });
});

// Pure DOCX text extraction for the vote-items enrichment. A .docx is a zip;
// the body is word/document.xml (WordprocessingML). We reduce it to plain
// text VERBATIM — official text only, no interpretation: an absent דברי הסבר
// section returns null (explicit not-found), never a guess (house rule).

import { strFromU8, unzipSync } from "fflate";

/** Plain text of a DOCX body: paragraphs → newlines, tags stripped, entities decoded. */
export function extractDocxText({ docx }: { docx: Uint8Array }): string {
  const files = unzipSync(docx);
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("not a DOCX: missing word/document.xml");
  return (
    strFromU8(xml)
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      // entity decode — &amp; LAST so "&amp;lt;" can't double-decode
      .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/﻿/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim()
  );
}

// Anchored to its own line (the heading is a standalone paragraph in the
// official template) so a mid-sentence mention of "דברי הסבר" earlier in the
// document can't be mistaken for the section heading.
const EXPLANATORY_HEADING = /^[ \t]*דברי הסבר:?[ \t]*$/m;
// Official-template trailers, observed on the real fixtures: bills end with a
// dash rule + submission block; agenda motions end with a signature block.
const TRAILERS = [/\n-{3,}/, /\nבכבוד רב,/];

/**
 * The verbatim דברי הסבר section of an official bill/agenda document, or null
 * when the heading is absent (explicit not-found — caller stores a links-only row).
 */
export function extractExplanatoryNotes({ text }: { text: string }): string | null {
  const m = EXPLANATORY_HEADING.exec(text);
  if (!m) return null;
  let body = text.slice(m.index + m[0].length);
  for (const trailer of TRAILERS) {
    const t = trailer.exec(body);
    if (t) body = body.slice(0, t.index);
  }
  body = body.trim();
  return body.length ? body : null;
}

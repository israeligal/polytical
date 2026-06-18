import { ImageResponse } from "next/og";
import bidiFactory from "bidi-js";
import { getChallengeByToken } from "@/app/lib/duels/repo";
import { getMarketBundle } from "@/app/lib/markets/repo";

export const alt = "פוליטיקל · דו-קרב";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const bidi = bidiFactory();

/**
 * Satori (behind ImageResponse) has NO Unicode-bidi support, so raw Hebrew
 * renders letter-reversed. We reorder each string to **visual order** with the
 * full bidi algorithm (handles embedded LTR like "@handle" correctly), then
 * hand Satori a plain LTR string it renders as-is. See the spec's spike note.
 */
function toVisual(text: string): string {
  const levels = bidi.getEmbeddingLevels(text, "rtl");
  return bidi.getReorderedString(text, levels);
}

/**
 * Bidi reorder must happen PER VISUAL LINE, after wrapping — Satori can't wrap
 * bidi text, so we greedy-wrap by a conservative char budget and reorder each
 * line on its own (reordering the whole string then letting Satori wrap flips
 * the line order on RTL text). Each line is rendered as its own row.
 */
function wrapVisualLines(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > maxChars) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + " " + w : w;
    }
  }
  if (cur) lines.push(cur);
  return lines.map(toVisual);
}

/**
 * Fetch a Satori-compatible (ttf/woff, not woff2) Hebrew font, subset to the
 * glyphs we render. An old User-Agent forces a non-woff2 format. Returns null
 * on failure → image still renders, text unfurl from generateMetadata remains.
 */
async function loadHebrewFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const api = `https://fonts.googleapis.com/css2?family=Heebo:wght@800&text=${encodeURIComponent(text)}`;
    const css = await (
      await fetch(api, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1; rv:6.0) Gecko/20110814 Firefox/6.0" },
      })
    ).text();
    const url = css.match(/src:\s*url\((https:[^)]+)\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const challenge = await getChallengeByToken({ token });
  const bundle = challenge ? await getMarketBundle({ marketId: challenge.marketId }) : null;
  const questionRaw = (bundle?.market.questionHe ?? "מי צודק?").slice(0, 110);
  const handle = challenge?.challengerHandle ?? "";

  const kicker = toVisual("פוליטיקל · דו-קרב");
  const hail = toVisual(`@${handle} מזמין/ה אותך לעימות`);
  const questionLines = wrapVisualLines(questionRaw, 26);
  const cta = toVisual("בחרו צד — מי צדק?");
  // Subset on the original (pre-reorder) text — same glyph set.
  const font = await loadHebrewFont("פוליטיקל · דו-קרב" + `@${handle} מזמין/ה אותך לעימות` + questionRaw + "בחרו צד — מי צדק?");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "72px",
          textAlign: "center",
          background: "linear-gradient(135deg, #0b1020 0%, #1a2244 100%)",
          color: "#f5f7ff",
          fontFamily: "Heebo",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, letterSpacing: 6, color: "#ffc23d" }}>{kicker}</div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 46, color: "#ffc23d" }}>{hail}</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 24, fontSize: 62, lineHeight: 1.18 }}>
          {questionLines.map((line, i) => (
            <div key={i} style={{ display: "flex" }}>{line}</div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 48,
            fontSize: 36,
            fontWeight: 800,
            color: "#07112b",
            background: "#00e0a4",
            padding: "16px 48px",
            borderRadius: 999,
          }}
        >
          {cta}
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "Heebo", data: font, weight: 800, style: "normal" }] : [] },
  );
}

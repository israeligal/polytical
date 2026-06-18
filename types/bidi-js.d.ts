// Minimal ambient types for bidi-js (ships no declarations). Covers only the
// surface we use in the duel OG image — the Unicode-bidi reorder to visual order.
declare module "bidi-js" {
  interface EmbeddingLevels {
    levels: Uint8Array;
    paragraphs: Array<{ start: number; end: number; level: number }>;
  }

  interface Bidi {
    getEmbeddingLevels(text: string, baseDirection?: "ltr" | "rtl" | "auto"): EmbeddingLevels;
    getReorderedString(text: string, embeddingLevels: EmbeddingLevels): string;
    getReorderSegments(
      text: string,
      embeddingLevels: EmbeddingLevels,
      start?: number,
      end?: number,
    ): Array<[number, number]>;
    getReorderedIndices(text: string, embeddingLevels: EmbeddingLevels): number[];
    getMirroredCharacter(char: string): string | null;
  }

  export default function bidiFactory(): Bidi;
}

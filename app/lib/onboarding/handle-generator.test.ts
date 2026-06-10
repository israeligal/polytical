import { expect, test } from "vitest";
import { HANDLE_RE } from "./handle";
import { generateHandleCandidate, NOUNS, ADJECTIVES } from "./handle-generator";

test("every candidate passes HANDLE_RE (1000 rolls)", () => {
  for (let i = 0; i < 1000; i++) {
    const c = generateHandleCandidate();
    expect(c, c).toMatch(HANDLE_RE);
  }
});

test("word lists are large and single-script Hebrew", () => {
  const all = [...NOUNS.m, ...NOUNS.f, ...ADJECTIVES.m, ...ADJECTIVES.f];
  expect(NOUNS.m.length).toBeGreaterThanOrEqual(40);
  expect(NOUNS.f.length).toBeGreaterThanOrEqual(40);
  expect(ADJECTIVES.m.length).toBeGreaterThanOrEqual(40);
  expect(ADJECTIVES.f.length).toBeGreaterThanOrEqual(40);
  for (const w of all) expect(w, w).toMatch(/^[א-ת]{2,12}$/);
});

test("no duplicates within a list", () => {
  for (const list of [NOUNS.m, NOUNS.f, ADJECTIVES.m, ADJECTIVES.f])
    expect(new Set(list).size).toBe(list.length);
});

test("deterministic with injected rng; respects gender pairing", () => {
  // rng pinned to 0 → masc bucket, first noun + first adjective, suffix _1
  const c = generateHandleCandidate({ random: () => 0 });
  expect(c).toBe(`${NOUNS.m[0]}_${ADJECTIVES.m[0]}_1`);
});

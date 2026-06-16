import { describe, expect, it } from "vitest";
import { parseArenas, formatArenas, MAX_ARENAS } from "./arenas";
import { InvalidArenaError } from "@/app/lib/errors";

describe("parseArenas", () => {
  it("returns an empty list for null/empty", () => {
    expect(parseArenas(null)).toEqual([]);
    expect(parseArenas("")).toEqual([]);
  });
  it("splits comma-joined keys and trims", () => {
    expect(parseArenas("elections, security ,coalition")).toEqual(["elections", "security", "coalition"]);
  });
  it("treats a single value as a 1-item list (back-compat with old single arena)", () => {
    expect(parseArenas("elections")).toEqual(["elections"]);
  });
});

describe("formatArenas", () => {
  it("joins a valid 1..MAX set", () => {
    expect(formatArenas(["elections"])).toBe("elections");
    expect(formatArenas(["elections", "security", "coalition"])).toBe("elections,security,coalition");
  });
  it("dedupes", () => {
    expect(formatArenas(["elections", "elections", "security"])).toBe("elections,security");
  });
  it("rejects an empty set", () => {
    expect(() => formatArenas([])).toThrow(InvalidArenaError);
    expect(() => formatArenas(["", "  "])).toThrow(InvalidArenaError);
  });
  it("rejects more than MAX_ARENAS", () => {
    expect(() => formatArenas(["elections", "security", "coalition", "legislation"])).toThrow(InvalidArenaError);
  });
  it("rejects an unknown key", () => {
    expect(() => formatArenas(["elections", "not_a_category"])).toThrow(InvalidArenaError);
  });
  it("MAX_ARENAS is 3", () => {
    expect(MAX_ARENAS).toBe(3);
  });
});

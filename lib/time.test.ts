import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, jerusalemWallToUtc, APP_TIMEZONE } from "./time";

describe("lib/time — Asia/Jerusalem formatting", () => {
  it("formatDateTime renders an Israel-time clock (summer = UTC+3)", () => {
    // 2026-06-01T20:30:00Z → 23:30 the same day in Asia/Jerusalem (IDT, UTC+3)
    const s = formatDateTime("2026-06-01T20:30:00Z");
    expect(s).toContain("23:30");
    expect(s).toContain("ביוני");
  });

  it("formatDateTime handles the winter offset (UTC+2)", () => {
    // 2026-01-01T20:30:00Z → 22:30 in Asia/Jerusalem (IST, UTC+2)
    expect(formatDateTime("2026-01-01T20:30:00Z")).toContain("22:30");
  });

  it("formatDateTime rolls the date across the Israel midnight boundary", () => {
    // 2026-06-01T22:30:00Z → 01:30 on 2026-06-02 in Asia/Jerusalem
    const s = formatDateTime("2026-06-01T22:30:00Z");
    expect(s).toContain("2"); // 2 ביוני
    expect(s).toContain("01:30");
  });

  it("formatDate renders day + Hebrew month only (no time)", () => {
    const s = formatDate("2026-06-01T20:30:00Z");
    expect(s).toContain("ביוני");
    expect(s).not.toMatch(/\d{2}:\d{2}/);
  });

  it("accepts a Date as well as an ISO string", () => {
    expect(formatDateTime(new Date("2026-06-01T20:30:00Z"))).toBe(
      formatDateTime("2026-06-01T20:30:00Z"),
    );
  });

  it("is timezone-independent (the hydration-safety guarantee)", () => {
    // Forcing process.env.TZ must NOT change the output — the formatter is pinned.
    const before = formatDateTime("2026-06-01T20:30:00Z");
    const prev = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      expect(formatDateTime("2026-06-01T20:30:00Z")).toBe(before);
    } finally {
      process.env.TZ = prev;
    }
  });

  it("exposes the timezone constant", () => {
    expect(APP_TIMEZONE).toBe("Asia/Jerusalem");
  });
});

describe("jerusalemWallToUtc — Knesset website naive wall-clock → UTC instant", () => {
  // Israel 2026: IDT (UTC+3) starts Fri 2026-03-27 02:00, ends Sun 2026-10-25 02:00.

  it("winter wall time is IST (UTC+2)", () => {
    expect(jerusalemWallToUtc("2026-01-15T12:00:00").toISOString()).toBe("2026-01-15T10:00:00.000Z");
  });

  it("summer wall time is IDT (UTC+3) — real vote timestamp", () => {
    // VoteId 46078's header VoteDate
    expect(jerusalemWallToUtc("2026-06-09T19:00:00").toISOString()).toBe("2026-06-09T16:00:00.000Z");
  });

  it("seconds are optional and default to 0", () => {
    expect(jerusalemWallToUtc("2026-06-09T19:00").toISOString()).toBe("2026-06-09T16:00:00.000Z");
  });

  it("just before the spring-forward gap is still IST", () => {
    expect(jerusalemWallToUtc("2026-03-27T01:59:00").toISOString()).toBe("2026-03-26T23:59:00.000Z");
  });

  it("just after the spring-forward gap is IDT", () => {
    expect(jerusalemWallToUtc("2026-03-27T03:00:00").toISOString()).toBe("2026-03-27T00:00:00.000Z");
  });

  it("after the fall-back boundary is IST again", () => {
    expect(jerusalemWallToUtc("2026-10-25T03:00:00").toISOString()).toBe("2026-10-25T01:00:00.000Z");
  });

  it("midnight wall time maps to the previous UTC day (hand votes carry T00:00:00)", () => {
    expect(jerusalemWallToUtc("2026-06-08T00:00:00").toISOString()).toBe("2026-06-07T21:00:00.000Z");
  });

  it("is host-timezone independent", () => {
    const prev = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      expect(jerusalemWallToUtc("2026-06-09T19:00:00").toISOString()).toBe("2026-06-09T16:00:00.000Z");
    } finally {
      process.env.TZ = prev;
    }
  });

  it("rejects non-naive or malformed input", () => {
    expect(() => jerusalemWallToUtc("2026-06-09T19:00:00Z")).toThrow();
    expect(() => jerusalemWallToUtc("9.6.2026")).toThrow();
  });
});

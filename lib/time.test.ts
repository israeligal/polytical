import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, APP_TIMEZONE } from "./time";

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

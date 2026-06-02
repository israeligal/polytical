import { beforeEach, expect, test } from "vitest";
import { checkRateLimit, __resetRateLimits } from "./rate-limit";

beforeEach(() => __resetRateLimits());

test("allows up to max hits in a window, denies the next", () => {
  const opts = { key: "suggest:u1", max: 3, windowMs: 10_000, now: 1000 };
  expect(checkRateLimit(opts).allowed).toBe(true); // 1
  expect(checkRateLimit(opts).allowed).toBe(true); // 2
  expect(checkRateLimit(opts).allowed).toBe(true); // 3
  const denied = checkRateLimit(opts); // 4 → over
  expect(denied.allowed).toBe(false);
  expect(denied.retryAfterMs).toBe(10_000); // window opened at now=1000, resets at 11000
});

test("resets after the window elapses", () => {
  const base = { key: "suggest:u1", max: 2, windowMs: 10_000 };
  checkRateLimit({ ...base, now: 0 });
  checkRateLimit({ ...base, now: 0 });
  expect(checkRateLimit({ ...base, now: 5_000 }).allowed).toBe(false); // still in window
  expect(checkRateLimit({ ...base, now: 10_000 }).allowed).toBe(true); // window rolled over
});

test("different keys are limited independently", () => {
  const a = { key: "suggest:alice", max: 1, windowMs: 10_000, now: 0 };
  const b = { key: "suggest:bob", max: 1, windowMs: 10_000, now: 0 };
  expect(checkRateLimit(a).allowed).toBe(true);
  expect(checkRateLimit(a).allowed).toBe(false); // alice exhausted
  expect(checkRateLimit(b).allowed).toBe(true); // bob unaffected
});

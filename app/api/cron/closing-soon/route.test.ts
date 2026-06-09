import { afterEach, beforeEach, expect, test, vi } from "vitest";

// Mock the sweep at the service boundary — the route's job is auth + delegation.
vi.mock("@/app/lib/markets/service", () => ({ notifyClosingSoonMarkets: vi.fn() }));
import { notifyClosingSoonMarkets } from "@/app/lib/markets/service";
import { GET } from "./route";

const SECRET = "test-cron-secret";

function req(authorization?: string): Request {
  return new Request("http://localhost/api/cron/closing-soon", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  vi.mocked(notifyClosingSoonMarkets).mockReset();
  vi.mocked(notifyClosingSoonMarkets).mockResolvedValue({ notified: 3 });
});
afterEach(() => vi.unstubAllEnvs());

test("503 when CRON_SECRET is not configured (refuses to run unauthenticated)", async () => {
  vi.stubEnv("CRON_SECRET", "");
  const res = await GET(req(`Bearer ${SECRET}`));
  expect(res.status).toBe(503);
  expect(notifyClosingSoonMarkets).not.toHaveBeenCalled();
});

test("401 when the Authorization header is missing or wrong", async () => {
  vi.stubEnv("CRON_SECRET", SECRET);
  expect((await GET(req("Bearer wrong"))).status).toBe(401);
  expect((await GET(req())).status).toBe(401);
  expect(notifyClosingSoonMarkets).not.toHaveBeenCalled();
});

test("200 runs the sweep and returns the notified count with a valid secret", async () => {
  vi.stubEnv("CRON_SECRET", SECRET);
  const res = await GET(req(`Bearer ${SECRET}`));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, notified: 3 });
  expect(notifyClosingSoonMarkets).toHaveBeenCalledTimes(1);
});

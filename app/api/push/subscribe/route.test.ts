import { beforeEach, describe, expect, test, vi } from "vitest";

// Mock the external boundaries: the auth/session read and the repo (the DB
// layer). Asserting the repo CALL + the HTTP status IS the observable behavior
// for a thin route handler — there is no DB to read back from here.
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/app/lib/push/repo", () => ({
  upsertSubscription: vi.fn(),
  deleteByUserAndEndpoint: vi.fn().mockResolvedValue({ deleted: 1 }),
}));

import { getSession } from "@/lib/auth";
import { upsertSubscription, deleteByUserAndEndpoint } from "@/app/lib/push/repo";
import { __resetRateLimits } from "@/app/lib/rate-limit";
import { POST, DELETE } from "./route";

const getSessionMock = vi.mocked(getSession);
const upsertMock = vi.mocked(upsertSubscription);
const deleteMock = vi.mocked(deleteByUserAndEndpoint);

const ENDPOINT = "https://fcm.example/u1-device-a";
const P256DH = "p256-key";
const AUTH = "auth-key";

function makeReq(method: string, body: unknown): Request {
  return new Request("http://localhost/api/push/subscribe", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function signedIn(userId: string) {
  // The route only reads session.user.id — a partial session is sufficient.
  getSessionMock.mockResolvedValue({ user: { id: userId } } as never);
}

beforeEach(() => {
  __resetRateLimits();
  vi.clearAllMocks();
  deleteMock.mockResolvedValue({ deleted: 1 });
});

describe("POST /api/push/subscribe", () => {
  test("401 when there is no session", async () => {
    getSessionMock.mockResolvedValue(null as never);
    const res = await POST(makeReq("POST", { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } }));
    expect(res.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  test("200 for a valid body + session, and upserts once with the parsed fields", async () => {
    signedIn("u1");
    const res = await POST(makeReq("POST", { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith({
      userId: "u1",
      endpoint: ENDPOINT,
      p256dh: P256DH,
      auth: AUTH,
    });
  });

  test("400 for a malformed body (missing keys)", async () => {
    signedIn("u1");
    const res = await POST(makeReq("POST", { endpoint: ENDPOINT }));
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  test("the 21st rapid request from the same user is rate-limited (429)", async () => {
    signedIn("u1");
    const valid = { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } };
    for (let i = 0; i < 20; i++) {
      const ok = await POST(makeReq("POST", valid));
      expect(ok.status).toBe(200);
    }
    const limited = await POST(makeReq("POST", valid));
    expect(limited.status).toBe(429);
  });
});

describe("DELETE /api/push/subscribe", () => {
  test("401 when there is no session", async () => {
    getSessionMock.mockResolvedValue(null as never);
    const res = await DELETE(makeReq("DELETE", { endpoint: ENDPOINT }));
    expect(res.status).toBe(401);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  test("200 for a valid body + session, and deletes by user + endpoint", async () => {
    signedIn("u1");
    const res = await DELETE(makeReq("DELETE", { endpoint: ENDPOINT }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(deleteMock).toHaveBeenCalledWith({ userId: "u1", endpoint: ENDPOINT });
  });

  test("400 when endpoint is not a string", async () => {
    signedIn("u1");
    const res = await DELETE(makeReq("DELETE", { endpoint: 123 }));
    expect(res.status).toBe(400);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

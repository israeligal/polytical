import { describe, expect, test, vi, afterEach } from "vitest";
import { buildODataUrl, fetchAll, fetchCount, odataCountFromPage, PARLIAMENT_BASE } from "./odata";
import type { KnsFaction, ODataPage } from "./odata-types";

afterEach(() => vi.restoreAllMocks());

describe("odataCountFromPage", () => {
  test("coerces the STRING odata.count the live service returns", () => {
    expect(odataCountFromPage({ "odata.count": "213", value: [] })).toBe(213);
    expect(odataCountFromPage({ "odata.count": "0", value: [] })).toBe(0);
  });
  test("throws (never silently 0) when odata.count is missing or garbage", () => {
    expect(() => odataCountFromPage({ value: [] })).toThrow();
    expect(() => odataCountFromPage({ "odata.count": "abc", value: [] })).toThrow();
  });
});

describe("fetchCount", () => {
  test("requests $inlinecount=allpages with $top=1 and returns the parsed total", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ "odata.count": "213", value: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const n = await fetchCount({ entity: "KNS_BillInitiator", filter: "PersonID eq 30300" });
    expect(n).toBe(213);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("%24inlinecount=allpages");
    expect(url).toContain("%24top=1");
    expect(url).toContain("PersonID%20eq%2030300");
  });
});

describe("buildODataUrl", () => {
  test("always sets $format=json and the base", () => {
    const u = buildODataUrl({ entity: "KNS_Faction" });
    expect(u.startsWith(`${PARLIAMENT_BASE}KNS_Faction?`)).toBe(true);
    expect(u).toContain("%24format=json");
  });

  test("URL-encodes a Hebrew + operator $filter and the $ sigils", () => {
    const u = buildODataUrl({
      entity: "KNS_PersonToPosition",
      filter: "IsCurrent eq true and (PositionID eq 43 or PositionID eq 61)",
      top: 100,
      skip: 200,
    });
    expect(u).toContain("%24filter=IsCurrent%20eq%20true");
    expect(u).toContain("PositionID%20eq%2043");
    expect(u).toContain("%24top=100");
    expect(u).toContain("%24skip=200");
    // a Hebrew literal must come back percent-encoded, never raw
    const heb = buildODataUrl({ entity: "KNS_Faction", filter: "Name eq 'אין נתונים'" });
    expect(heb).not.toMatch(/[֐-׿]/);
    expect(heb).toContain("%D7%90"); // 'א'
  });
});

describe("fetchAll paging", () => {
  test("follows d.__next until exhausted and concatenates results", async () => {
    const page1: ODataPage<KnsFaction> = { d: { results: [{ FactionID: 1, Name: "a" } as KnsFaction], __next: `${PARLIAMENT_BASE}KNS_Faction?%24skiptoken=1` } };
    const page2: ODataPage<KnsFaction> = { d: { results: [{ FactionID: 2, Name: "b" } as KnsFaction] } }; // no __next -> stop
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => page2 });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchAll<KnsFaction>({ entity: "KNS_Faction", top: 1, throttleMs: 0 });
    expect(rows.map((r) => r.FactionID)).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // page 1 is the built URL; page 2 is the verbatim __next link
    expect(fetchMock.mock.calls[1][0]).toBe(page2.d?.__next ?? `${PARLIAMENT_BASE}KNS_Faction?%24skiptoken=1`);
  });

  test("retries once on a 503 then succeeds", async () => {
    const ok = { d: { results: [{ FactionID: 9, Name: "z" }] } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ok });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchAll<KnsFaction>({ entity: "KNS_Faction", throttleMs: 0, retryDelayMs: 0 });
    expect(rows.map((r) => r.FactionID)).toEqual([9]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

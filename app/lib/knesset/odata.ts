import { logger } from "@/app/lib/logger";
import type { ODataPage } from "./odata-types";

/** System of record. ParliamentInfo.svc — NOT Votes.svc (frozen at K24, deferred). */
export const PARLIAMENT_BASE = "https://knesset.gov.il/Odata/ParliamentInfo.svc/";

/**
 * The current Knesset number — single source of truth for the ingest filters AND the
 * "current term" UI label, so they never drift. Verified current 2026-06-11 (no K26
 * bills exist). Bump this one line when the 26th Knesset is seated.
 */
export const CURRENT_KNESSET = 25;

export type KnsEntity =
  | "KNS_Person"
  | "KNS_PersonToPosition"
  | "KNS_Faction"
  | "KNS_Position"
  | "KNS_Bill"
  | "KNS_BillInitiator"
  | "KNS_Query"
  | "KNS_Committee"
  | "KNS_DocumentBill"
  | "KNS_Status";

interface BuildUrlArgs {
  entity: KnsEntity;
  filter?: string;          // raw OData $filter (Hebrew + operators) — we encode it
  expand?: string;          // raw OData $expand path, e.g. "KNS_Bill/KNS_DocumentBills"
  top?: number;
  skip?: number;
  base?: string;
}

/**
 * Builds an OData URL with $format=json always set. The service defaults to
 * Atom/XML without it. We percent-encode each key + value with
 * encodeURIComponent (NOT URLSearchParams, which form-encodes spaces as "+" —
 * the OData service expects "%20"), so the "$" sigils and Hebrew filter
 * literals come back percent-encoded and spaces stay as %20.
 */
export function buildODataUrl({ entity, filter, expand, top, skip, base = PARLIAMENT_BASE }: BuildUrlArgs): string {
  const pairs: [string, string][] = [["$format", "json"]];
  if (filter) pairs.push(["$filter", filter]);
  if (expand) pairs.push(["$expand", expand]);
  if (typeof top === "number") pairs.push(["$top", String(top)]);
  if (typeof skip === "number") pairs.push(["$skip", String(skip)]);
  const query = pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${base}${entity}?${query}`;
}

interface FetchAllArgs {
  entity: KnsEntity;
  filter?: string;
  expand?: string;          // raw OData $expand path, e.g. "KNS_Bill/KNS_DocumentBills"
  top?: number;             // requested page size (default ALL_TOP — see below)
  throttleMs?: number;      // self-throttle between pages (default 250)
  retries?: number;         // retry attempts per page (default 2)
  retryDelayMs?: number;    // backoff base (default 500)
  base?: string;
  maxPages?: number;        // safety cap (default 10000)
}

/**
 * The live ParliamentInfo.svc (OData v4) caps every response at 100 rows
 * server-side. Quirk: if you request `$top=100` and exactly 100 come back, it
 * does NOT emit `odata.nextLink` (it reads `$top` as "you asked for 100, here
 * they are"). To get true paging-to-exhaustion we must request a `$top` LARGER
 * than the server cap — then it returns 100 rows + a nextLink that decrements
 * the remaining `$top` and carries a `$skiptoken`, repeating until drained.
 * 100000 is "effectively all" for every entity we ingest (largest is ~7.4k).
 */
const ALL_TOP = 100000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url: string, retries: number, retryDelayMs: number): Promise<ODataPage<unknown>> {
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as ODataPage<unknown>;
    } catch (err) {
      if (attempt >= retries) {
        logger.error("knesset.odata.fetch_failed", { url, attempt, err: String(err) });
        throw err;
      }
      const backoff = retryDelayMs * Math.pow(2, attempt);
      logger.warn("knesset.odata.retry", { url, attempt, backoff, err: String(err) });
      await sleep(backoff);
      attempt += 1;
    }
  }
}

/** Rows from either dialect: v4 `value` or v3 `d.results`. */
function pageRows<T>(page: ODataPage<unknown>): T[] {
  if (Array.isArray(page.value)) return page.value as T[];
  return (page.d?.results ?? []) as T[];
}

/**
 * Next-page URL from either dialect, resolved to an absolute URL. v3 emits an
 * absolute `d.__next`; v4 emits a RELATIVE `odata.nextLink` (e.g.
 * "KNS_Faction?$top=200&$skiptoken=..."), which we resolve against the service
 * root so the follow-up fetch hits the right host.
 */
function pageNextLink(page: ODataPage<unknown>, base: string): string | undefined {
  const v4 = page["odata.nextLink"] ?? page["@odata.nextLink"];
  if (v4) return new URL(v4, base).toString();
  return page.d?.__next; // v3: already absolute
}

/**
 * Fetches every page of an entity/filter, following the service's next-page
 * link until exhausted. Handles BOTH OData dialects (v4 `value`/`odata.nextLink`
 * — the live shape — and v3 `d.results`/`d.__next`). Self-throttles between
 * pages. Generic T is the row type from odata-types.
 */
export async function fetchAll<T>({
  entity, filter, expand, top = ALL_TOP, throttleMs = 250, retries = 2, retryDelayMs = 500,
  base = PARLIAMENT_BASE, maxPages = 10000,
}: FetchAllArgs): Promise<T[]> {
  const out: T[] = [];
  let url: string | undefined = buildODataUrl({ entity, filter, expand, top, base });
  let pages = 0;
  while (url && pages < maxPages) {
    const page = await fetchPage(url, retries, retryDelayMs);
    out.push(...pageRows<T>(page));
    pages += 1;
    url = pageNextLink(page, base); // undefined => done
    if (url && throttleMs > 0) await sleep(throttleMs);
  }
  logger.info("knesset.odata.fetched", { entity, filter, rows: out.length, pages });
  return out;
}

/**
 * Pulls the total off an `$inlinecount=allpages` response. The live service returns
 * `odata.count` as a STRING ("213"), so we coerce. Throws on a missing/garbage value
 * rather than silently reporting 0 — a wrong count is worse than a loud failure.
 */
export function odataCountFromPage(page: ODataPage<unknown>): number {
  const raw = page["odata.count"];
  // NB: Number("") === 0, so an empty/whitespace string must be treated as garbage too.
  const n = raw == null || (typeof raw === "string" && raw.trim() === "") ? NaN : Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`odata.count missing/invalid (got ${JSON.stringify(raw)}) — API shape changed?`);
  }
  return n;
}

/**
 * Counts rows matching a filter in ONE call, WITHOUT downloading them, via
 * `$inlinecount=allpages&$top=1`. This is the only working count mechanism on
 * ParliamentInfo.svc (`$count=true`/`$count` path are unsupported — see the
 * `knesset-odata` skill). Used for per-MK activity totals (bills/queries,
 * current-term and lifetime) so a single MK costs 4 tiny calls, not a bulk download.
 */
export async function fetchCount({
  entity, filter, retries = 2, retryDelayMs = 500, base = PARLIAMENT_BASE,
}: {
  entity: KnsEntity; filter: string; retries?: number; retryDelayMs?: number; base?: string;
}): Promise<number> {
  const url = `${buildODataUrl({ entity, filter, top: 1, base })}&${encodeURIComponent("$inlinecount")}=allpages`;
  const page = await fetchPage(url, retries, retryDelayMs);
  return odataCountFromPage(page);
}

/** Convenience for the verified current-MK roster filter. */
export const CURRENT_MK_FILTER =
  "IsCurrent eq true and (PositionID eq 43 or PositionID eq 61)";

// --- Open Knesset CSV gap-filler (English names + current committee rosters) ---

export const OKNESSET_BASE = "https://production.oknesset.org/pipelines/data/";

/** Minimal CSV parser: header row -> array of {col: value}. Handles quoted fields. */
export function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); records.push(row); field = ""; row = []; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); records.push(row); }
  if (records.length === 0) return [];
  const [header, ...body] = records;
  return body
    .filter((r) => r.some((v) => v !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

/** Fetches + parses an Open Knesset CSV (relative path under OKNESSET_BASE). */
export async function fetchOknessetCsv(
  relativePath: string,
  { retries = 2, retryDelayMs = 500 }: { retries?: number; retryDelayMs?: number } = {},
): Promise<{ rows: Record<string, string>[]; url: string }> {
  const url = `${OKNESSET_BASE}${relativePath}`;
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url, { headers: { Accept: "text/csv" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = parseCsv(await res.text());
      logger.info("knesset.oknesset.fetched", { url, rows: rows.length });
      return { rows, url };
    } catch (err) {
      if (attempt >= retries) {
        logger.error("knesset.oknesset.fetch_failed", { url, attempt, err: String(err) });
        throw err;
      }
      await sleep(retryDelayMs * Math.pow(2, attempt));
      attempt += 1;
    }
  }
}

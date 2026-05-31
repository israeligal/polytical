import { logger } from "@/app/lib/logger";
import type { ODataPage } from "./odata-types";

/** System of record. ParliamentInfo.svc — NOT Votes.svc (frozen at K24, deferred). */
export const PARLIAMENT_BASE = "https://knesset.gov.il/Odata/ParliamentInfo.svc/";

export type KnsEntity =
  | "KNS_Person"
  | "KNS_PersonToPosition"
  | "KNS_Faction"
  | "KNS_Position"
  | "KNS_Bill"
  | "KNS_BillInitiator"
  | "KNS_Query"
  | "KNS_Committee";

interface BuildUrlArgs {
  entity: KnsEntity;
  filter?: string;          // raw OData $filter (Hebrew + operators) — we encode it
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
export function buildODataUrl({ entity, filter, top, skip, base = PARLIAMENT_BASE }: BuildUrlArgs): string {
  const pairs: [string, string][] = [["$format", "json"]];
  if (filter) pairs.push(["$filter", filter]);
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
  top?: number;             // page size (default 100)
  throttleMs?: number;      // self-throttle between pages (default 250)
  retries?: number;         // retry attempts per page (default 2)
  retryDelayMs?: number;    // backoff base (default 500)
  base?: string;
  maxPages?: number;        // safety cap (default 10000)
}

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

/**
 * Fetches every page of an entity/filter, following d.__next (OData v3 carries
 * the next page — incl. $skiptoken — as an absolute URL we use verbatim).
 * Self-throttles between pages. Generic T is the row type from odata-types.
 */
export async function fetchAll<T>({
  entity, filter, top = 100, throttleMs = 250, retries = 2, retryDelayMs = 500,
  base = PARLIAMENT_BASE, maxPages = 10000,
}: FetchAllArgs): Promise<T[]> {
  const out: T[] = [];
  let url: string | undefined = buildODataUrl({ entity, filter, top, base });
  let pages = 0;
  while (url && pages < maxPages) {
    const page = await fetchPage(url, retries, retryDelayMs);
    const rows = (page.d?.results ?? []) as T[];
    out.push(...rows);
    pages += 1;
    url = page.d?.__next; // absolute; undefined => done
    if (url && throttleMs > 0) await sleep(throttleMs);
  }
  logger.info("knesset.odata.fetched", { entity, filter, rows: out.length, pages });
  return out;
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

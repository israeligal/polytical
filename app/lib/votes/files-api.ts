// Binary download from fs.knesset.gov.il (official document store — publicly
// fetchable server-side; NEVER fetch main.knesset.gov.il pages, they sit
// behind the Radware bot challenge). Separate module so tests mock the
// boundary, not the enrichment logic.

import { fetchWithRetry } from "@/app/lib/http/fetch-retry";

export async function fetchBinaryFile({
  url,
  retries = 2,
  retryDelayMs = 500,
}: {
  url: string;
  retries?: number;
  retryDelayMs?: number;
}): Promise<Uint8Array> {
  return fetchWithRetry({
    url,
    label: "votes.files",
    retries,
    retryDelayMs,
    parse: async (res) => new Uint8Array(await res.arrayBuffer()),
  });
}

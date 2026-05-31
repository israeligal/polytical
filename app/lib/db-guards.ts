/**
 * Refuses to run a mutating script against production unless explicitly allowed.
 * Heuristic: a host containing "prod" (and not "dev"/"branch"/"localhost") is
 * treated as production. Set ALLOW_PROD_INGEST=1 to override deliberately.
 */
export function assertNonProductionDb(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("assertNonProductionDb: DATABASE_URL is not set");
  if (process.env.ALLOW_PROD_INGEST === "1") return;

  let host = "";
  try { host = new URL(url.replace(/^postgres(ql)?:/, "http:")).host.toLowerCase(); }
  catch { host = url.toLowerCase(); }

  const looksDev = /(localhost|127\.0\.0\.1|dev|branch|staging|test|preview)/.test(host);
  const looksProd = /prod/.test(host);
  if (looksProd && !looksDev) {
    throw new Error(
      `assertNonProductionDb: refusing to run against production host "${host}". ` +
      `Set ALLOW_PROD_INGEST=1 to override.`,
    );
  }
}

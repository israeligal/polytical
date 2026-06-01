import { afterEach, beforeEach, expect, test } from "vitest";
import { assertNonProductionDb } from "./db-guards";

const ORIG = { ...process.env };
beforeEach(() => { process.env = { ...ORIG }; });
afterEach(() => { process.env = { ...ORIG }; });

test("throws when DATABASE_URL is missing", () => {
  delete process.env.DATABASE_URL;
  expect(() => assertNonProductionDb()).toThrow(/DATABASE_URL/);
});

test("throws on a production-looking host", () => {
  process.env.DATABASE_URL = "postgres://u:p@ep-prod-main.neon.tech/neondb";
  delete process.env.ALLOW_PROD_INGEST;
  expect(() => assertNonProductionDb()).toThrow(/production/i);
});

test("passes for a dev/branch host", () => {
  process.env.DATABASE_URL = "postgres://u:p@ep-dev-branch.neon.tech/neondb";
  expect(() => assertNonProductionDb()).not.toThrow();
});

test("escape hatch ALLOW_PROD_INGEST=1 permits a prod host", () => {
  process.env.DATABASE_URL = "postgres://u:p@ep-prod-main.neon.tech/neondb";
  process.env.ALLOW_PROD_INGEST = "1";
  expect(() => assertNonProductionDb()).not.toThrow();
});

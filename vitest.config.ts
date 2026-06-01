import { config } from "dotenv";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Load .env so module-load guards (e.g. app/lib/db.ts's DATABASE_URL check)
// pass. Tests themselves use PGlite, not the real Neon connection.
config({ path: ".env" });

export default defineConfig({
  plugins: [tsconfigPaths()],
  // Every integration test replays the full (growing) Drizzle migration chain on
  // a fresh PGlite instance in beforeEach. Under `forks` parallelism the cold
  // replay can exceed the small defaults — so we raise BOTH timeouts:
  //   testTimeout — the test body; hookTimeout — the beforeEach/afterEach hooks
  //   (the createTestDb migration replay lives in beforeEach, so this is the one
  //   that was flaking at the 10s default).
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    pool: "forks",
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});

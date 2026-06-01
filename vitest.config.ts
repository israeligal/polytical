import { config } from "dotenv";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Load .env so module-load guards (e.g. app/lib/db.ts's DATABASE_URL check)
// pass. Tests themselves use PGlite, not the real Neon connection.
config({ path: ".env" });

export default defineConfig({
  plugins: [tsconfigPaths()],
  // testTimeout raised above the 5s default: every integration test replays the
  // full Drizzle migration chain on a fresh PGlite instance, and under `forks`
  // parallelism the cold first-replay of the (growing) chain can exceed 5s.
  test: { environment: "node", include: ["**/*.test.ts"], pool: "forks", testTimeout: 30000 },
});

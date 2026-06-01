import { config } from "dotenv";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Load .env so module-load guards (e.g. app/lib/db.ts's DATABASE_URL check)
// pass. Tests themselves use PGlite, not the real Neon connection.
config({ path: ".env" });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { environment: "node", include: ["**/*.test.ts"], pool: "forks" },
});

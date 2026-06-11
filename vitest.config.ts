import { config } from "dotenv";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Load .env so module-load guards (e.g. app/lib/db.ts's DATABASE_URL check)
// pass. Tests themselves use PGlite, not the real Neon connection.
config({ path: ".env" });

// Two projects:
//  - node: the integration suite. Every test replays the full (growing) Drizzle
//    migration chain on a fresh PGlite instance in beforeEach. Under `forks`
//    parallelism the cold replay can exceed the small defaults — so we raise BOTH
//    timeouts: testTimeout (the body) and hookTimeout (the createTestDb replay in
//    beforeEach, the one that was flaking at the 10s default). Matches *.test.ts
//    only (so .test.tsx files never load the React plugin into the node env).
//  - dom: client-surface unit tests (hooks + components) under happy-dom with the
//    React JSX transform. Matches *.test.tsx only.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      {
        plugins: [tsconfigPaths()],
        test: {
          name: "node",
          environment: "node",
          include: ["**/*.test.ts"],
          // .claude/worktrees holds other sessions' in-progress checkouts —
          // their duplicated suites must not run (or fail) in the root run.
          exclude: ["**/node_modules/**", "**/.claude/**"],
          pool: "forks",
          testTimeout: 30000,
          hookTimeout: 30000,
        },
      },
      {
        plugins: [tsconfigPaths(), react()],
        test: {
          name: "dom",
          environment: "happy-dom",
          include: ["**/*.test.tsx"],
          exclude: ["**/node_modules/**", "**/.claude/**"],
        },
      },
    ],
  },
});

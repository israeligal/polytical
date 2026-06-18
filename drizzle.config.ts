import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env" });

export default defineConfig({
  schema: ["./app/lib/schema.ts", "./app/lib/schema-votes.ts", "./app/lib/schema-groups.ts", "./app/lib/schema-duels.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

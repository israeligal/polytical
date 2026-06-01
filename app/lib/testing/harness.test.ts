import { expect, test } from "vitest";
import { createTestDb } from "./create-test-db";
import { users } from "@/app/lib/schema";

test("PGlite applies migrations; new user defaults balance 0", async () => {
  const { db, close } = await createTestDb();
  await db.insert(users).values({ id: "u1", name: "Gal", email: "g@x.co" });
  const [row] = await db.select().from(users);
  expect(row.balance).toBe(0);
  expect(row.isAdmin).toBe(false);
  await close();
});

import { beforeEach, afterEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users } from "@/app/lib/schema";
import {
  setHandle,
  checkHandleAvailable,
  completeOnboarding,
  generateAvailableHandle,
  readOnboardingState,
} from "./service";
import { HANDLE_RE } from "./handle";
import {
  AlreadyOnboardedError,
  HandleRequiredError,
  HandleTakenError,
  InvalidArenaError,
  InvalidHandleError,
} from "@/app/lib/errors";

let h: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values([
    { id: "u1", name: "גל", email: "g@x.co" },
    { id: "u2", name: "דנה", email: "d@x.co" },
  ]);
});
afterEach(async () => h.close());

test("setHandle normalizes (@-strip + lowercase) and persists", async () => {
  const res = await setHandle({ db: h.db, userId: "u1", handle: "  @Gal_2026  " });
  expect(res.handle).toBe("gal_2026");
  const state = await readOnboardingState({ db: h.db, userId: "u1" });
  expect(state?.handle).toBe("gal_2026");
});

test("setHandle rejects a malformed handle", async () => {
  await expect(setHandle({ db: h.db, userId: "u1", handle: "ab" })).rejects.toBeInstanceOf(InvalidHandleError);
  await expect(setHandle({ db: h.db, userId: "u1", handle: "has spaces" })).rejects.toBeInstanceOf(InvalidHandleError);
  await expect(setHandle({ db: h.db, userId: "u1", handle: "שלוםx" })).rejects.toBeInstanceOf(InvalidHandleError); // mixed scripts
});

test("setHandle accepts an all-Hebrew handle", async () => {
  const res = await setHandle({ db: h.db, userId: "u1", handle: "@מנדט_עודף" });
  expect(res.handle).toBe("מנדט_עודף");
  const state = await readOnboardingState({ db: h.db, userId: "u1" });
  expect(state?.handle).toBe("מנדט_עודף");
});

test("a handle taken by another user is rejected; availability reflects it", async () => {
  await setHandle({ db: h.db, userId: "u1", handle: "shared" });

  expect(await checkHandleAvailable({ db: h.db, userId: "u2", handle: "shared" })).toMatchObject({
    available: false,
    reason: "taken",
  });
  // But the owner re-checking their own handle sees it as available.
  expect(await checkHandleAvailable({ db: h.db, userId: "u1", handle: "shared" })).toMatchObject({
    available: true,
  });

  await expect(setHandle({ db: h.db, userId: "u2", handle: "SHARED" })).rejects.toBeInstanceOf(HandleTakenError);
});

test("checkHandleAvailable flags malformed handles as invalid", async () => {
  expect(await checkHandleAvailable({ db: h.db, userId: "u1", handle: "x" })).toMatchObject({
    available: false,
    reason: "invalid",
  });
});

test("completeOnboarding requires a handle first", async () => {
  await expect(completeOnboarding({ db: h.db, userId: "u1", arena: "coalition" })).rejects.toBeInstanceOf(
    HandleRequiredError,
  );
});

test("completeOnboarding rejects an arena outside CATEGORIES", async () => {
  await setHandle({ db: h.db, userId: "u1", handle: "gal" });
  await expect(completeOnboarding({ db: h.db, userId: "u1", arena: "weather" })).rejects.toBeInstanceOf(
    InvalidArenaError,
  );
});

test("completeOnboarding sets arena + onboardedAt and is terminal", async () => {
  await setHandle({ db: h.db, userId: "u1", handle: "gal" });
  const { onboardedAt } = await completeOnboarding({ db: h.db, userId: "u1", arena: "security" });
  expect(onboardedAt).toBeInstanceOf(Date);

  const state = await readOnboardingState({ db: h.db, userId: "u1" });
  expect(state?.arena).toBe("security");
  expect(state?.onboardedAt).not.toBeNull();

  // Second call is rejected — never re-onboard.
  await expect(completeOnboarding({ db: h.db, userId: "u1", arena: "elections" })).rejects.toBeInstanceOf(
    AlreadyOnboardedError,
  );
});

test("generateAvailableHandle returns a valid, unclaimed handle", async () => {
  const got = await generateAvailableHandle({ db: h.db, userId: "u1" });
  expect(got).toMatch(HANDLE_RE);
  expect(await checkHandleAvailable({ db: h.db, userId: "u1", handle: got })).toMatchObject({ available: true });
});

test("generateAvailableHandle keeps producing valid suggestions across calls", async () => {
  for (let i = 0; i < 5; i++) {
    const got = await generateAvailableHandle({ db: h.db, userId: "u2" });
    expect(got).toMatch(HANDLE_RE);
  }
});

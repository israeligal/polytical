import { beforeEach, afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users } from "@/app/lib/schema";
import { MissingUserError, InvalidCaricatureError } from "@/app/lib/errors";
import { setCaricature, clearCaricature, parseCaricatureDataUrl } from "./caricature-service";

let h: Awaited<ReturnType<typeof createTestDb>>;

const PNG_DATA_URL = `data:image/png;base64,${Buffer.from([1, 2, 3, 4]).toString("base64")}`;

async function seed() {
  await h.db.insert(users).values([
    { id: "amir", name: "Amir", handle: "amir_h", email: "a@x.co" },
    { id: "noa", name: "Noa", handle: "noa_h", email: "n@x.co" },
  ]);
}

async function caricatureOf(id: string): Promise<string | null> {
  const [row] = await h.db.select({ caricatureUrl: users.caricatureUrl }).from(users).where(eq(users.id, id));
  return row?.caricatureUrl ?? null;
}

beforeEach(async () => {
  h = await createTestDb();
});
afterEach(async () => {
  await h.close();
});

test("setCaricature uploads via the injected uploader and stores the returned URL", async () => {
  await seed();
  const calls: { path: string; contentType: string; size: number }[] = [];
  const { caricatureUrl } = await setCaricature({
    db: h.db,
    userId: "amir",
    dataUrl: PNG_DATA_URL,
    _upload: async ({ path, bytes, contentType }) => {
      calls.push({ path, contentType, size: bytes.length });
      return { url: "https://store.public.blob.vercel-storage.com/avatars/amir" };
    },
  });

  expect(caricatureUrl).toBe("https://store.public.blob.vercel-storage.com/avatars/amir");
  expect(await caricatureOf("amir")).toBe(caricatureUrl);
  // Stable per-user key + decoded mime/size handed to the uploader.
  expect(calls).toEqual([{ path: "avatars/amir", contentType: "image/png", size: 4 }]);
});

test("setCaricature is scoped — it never touches another user's row", async () => {
  await seed();
  await setCaricature({
    db: h.db,
    userId: "amir",
    dataUrl: PNG_DATA_URL,
    _upload: async () => ({ url: "https://store.public.blob.vercel-storage.com/avatars/amir" }),
  });
  expect(await caricatureOf("noa")).toBeNull();
});

test("clearCaricature resets the avatar to null", async () => {
  await seed();
  await setCaricature({
    db: h.db,
    userId: "amir",
    dataUrl: PNG_DATA_URL,
    _upload: async () => ({ url: "https://store.public.blob.vercel-storage.com/avatars/amir" }),
  });
  await clearCaricature({ db: h.db, userId: "amir" });
  expect(await caricatureOf("amir")).toBeNull();
});

test("setCaricature rejects a missing userId before uploading", async () => {
  let uploaded = false;
  await expect(
    setCaricature({
      db: h.db,
      userId: "",
      dataUrl: PNG_DATA_URL,
      _upload: async () => {
        uploaded = true;
        return { url: "x" };
      },
    }),
  ).rejects.toBeInstanceOf(MissingUserError);
  expect(uploaded).toBe(false);
});

test("parseCaricatureDataUrl accepts png/jpeg/webp and normalizes jpg→jpeg", () => {
  const b64 = Buffer.from([9, 9, 9]).toString("base64");
  expect(parseCaricatureDataUrl(`data:image/webp;base64,${b64}`).contentType).toBe("image/webp");
  expect(parseCaricatureDataUrl(`data:image/png;base64,${b64}`).contentType).toBe("image/png");
  expect(parseCaricatureDataUrl(`data:image/jpg;base64,${b64}`).contentType).toBe("image/jpeg");
  expect(parseCaricatureDataUrl(`data:image/jpeg;base64,${b64}`).bytes.length).toBe(3);
});

test("parseCaricatureDataUrl rejects non-image, malformed, and oversized data URLs", () => {
  expect(() => parseCaricatureDataUrl("data:text/plain;base64,aGk=")).toThrow(InvalidCaricatureError);
  expect(() => parseCaricatureDataUrl("not-a-data-url")).toThrow(InvalidCaricatureError);
  expect(() => parseCaricatureDataUrl("data:image/png;base64,")).toThrow(InvalidCaricatureError); // empty
  const tooBig = Buffer.alloc(1_500_001).toString("base64");
  expect(() => parseCaricatureDataUrl(`data:image/png;base64,${tooBig}`)).toThrow(InvalidCaricatureError);
});

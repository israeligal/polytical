import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { put } from "@vercel/blob";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { updateUserCaricature } from "@/app/lib/users/repo";
import { InvalidCaricatureError, requireUserId } from "@/app/lib/errors";

// Caricature-avatar service. The client normalizes the image to a small square
// (≤512px WebP) before sending it as a base64 data URL, so the payload stays
// modest and we keep the established plain-object Server-Action shape (no route
// handler). We decode + validate here, store in Vercel Blob, then persist the
// public URL on the user row. The blob `put` is injectable so tests never need a
// token or network.

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

/** ~1.5 MB cap on the decoded image — generous for a 512px avatar, bounds the
 *  Server-Action payload and blob storage. */
const MAX_BYTES = 1_500_000;
const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Decode + validate a base64 image data URL. Throws `InvalidCaricatureError` on
 *  a bad mime, malformed base64, empty image, or one over the size cap. Exported
 *  for unit tests. */
export function parseCaricatureDataUrl(dataUrl: string): { bytes: Buffer; contentType: string } {
  const m = DATA_URL_RE.exec(dataUrl.trim());
  if (!m) throw new InvalidCaricatureError();
  const ext = m[1] === "jpg" ? "jpeg" : m[1];
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new InvalidCaricatureError();
  return { bytes, contentType: `image/${ext}` };
}

/** Uploads bytes to Vercel Blob at a stable per-user key (overwriting any prior
 *  avatar) and returns the public URL. Injected in tests. */
export type CaricatureUploader = (args: {
  path: string;
  bytes: Buffer;
  contentType: string;
}) => Promise<{ url: string }>;

const blobUploader: CaricatureUploader = async ({ path, bytes, contentType }) => {
  const { url } = await put(path, bytes, { access: "public", contentType, allowOverwrite: true });
  return { url };
};

/**
 * Validates the data URL, stores the image in Blob, and saves the public URL on
 * the user's row. Scope-guarded — a caller only ever writes their own avatar.
 */
export async function setCaricature({
  db = defaultDb,
  userId,
  dataUrl,
  _upload = blobUploader,
}: {
  db?: DB;
  userId: string;
  dataUrl: string;
  _upload?: CaricatureUploader;
}): Promise<{ caricatureUrl: string }> {
  requireUserId(userId);
  const { bytes, contentType } = parseCaricatureDataUrl(dataUrl);
  // Stable key (no random suffix) so a replace overwrites the same object.
  const { url } = await _upload({ path: `avatars/${userId}`, bytes, contentType });
  await updateUserCaricature({ db, userId, caricatureUrl: url });
  return { caricatureUrl: url };
}

/** Clears the caricature (back to the handle-initial fallback). The blob object
 *  is left in place (cheap; next upload overwrites it) — del() can be added later. */
export async function clearCaricature({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<void> {
  await updateUserCaricature({ db, userId, caricatureUrl: null });
}

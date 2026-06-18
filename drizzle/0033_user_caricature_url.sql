-- user.caricatureUrl — self-service caricature avatar (Vercel Blob URL). Nullable;
-- null → the handle-initial fallback avatar. Distinct from user.image (the Google
-- OAuth photo, never shown as an avatar). Additive + idempotent.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "caricatureUrl" text;

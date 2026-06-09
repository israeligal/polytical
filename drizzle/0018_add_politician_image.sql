-- politicians.imageUrl was added to main via db:push (no migration). This catch-up
-- migration brings the migration chain (and the PGlite test DB) in line with the
-- schema. IF NOT EXISTS keeps it a no-op on the live DB where the column already exists.
ALTER TABLE "politicians" ADD COLUMN IF NOT EXISTS "imageUrl" text;
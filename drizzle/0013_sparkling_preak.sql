-- IF NOT EXISTS: migration 0003 already created this index on PGlite/migrate; this
-- statement exists so db:push (which dropped it — it was migration-only) recreates
-- it on Neon and the snapshot tracks it. Idempotent on replay.
CREATE INDEX IF NOT EXISTS "politicians_searchname_trgm_idx" ON "politicians" USING gin ("searchName" gin_trgm_ops);
-- Discovery-only fuzzy search on politicians.searchName.
-- Extensions are Neon-supported (pg_trgm 1.6, unaccent 1.1). IF NOT EXISTS
-- keeps this idempotent and replayable on PGlite.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
-- Trigram GIN over the already-normalized searchName (codepoint trigrams;
-- Hebrew has no Postgres stemmer, so we lean on the normalized column).
CREATE INDEX IF NOT EXISTS "politicians_searchname_trgm_idx"
  ON "politicians" USING gin ("searchName" gin_trgm_ops);

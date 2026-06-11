-- politicians.gender — sourced from KNS_Person.GenderDesc ("זכר"→"male", "נקבה"→"female").
-- Nullable: rows ingested before this column existed, or whose OData value is neither
-- of the two known strings, stay NULL. Unknown gender → neutral copy everywhere.
ALTER TABLE "politicians" ADD COLUMN IF NOT EXISTS "gender" text;

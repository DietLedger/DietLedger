DROP TABLE IF EXISTS import_object_mappings;
ALTER TABLE ingredients DROP COLUMN IF EXISTS source_key;
ALTER TABLE ingredients DROP COLUMN IF EXISTS source_type;

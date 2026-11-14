DROP TRIGGER IF EXISTS custom_foods_protect_portable_identity ON custom_foods;
DROP TRIGGER IF EXISTS recipes_protect_portable_identity ON recipes;
DROP FUNCTION IF EXISTS protect_portable_identity();
DROP INDEX IF EXISTS custom_foods_owner_portable_id;
DROP INDEX IF EXISTS recipes_owner_portable_id;
ALTER TABLE custom_foods DROP COLUMN IF EXISTS portable_id;
ALTER TABLE recipes DROP COLUMN IF EXISTS portable_id;

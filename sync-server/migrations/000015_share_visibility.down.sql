ALTER TABLE shared_recipes ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE shared_recipes SET is_public = (visibility = 'public');

ALTER TABLE shared_recipes DROP COLUMN visibility;

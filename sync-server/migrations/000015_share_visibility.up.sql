-- Replace the binary is_public flag with a three-tier visibility model:
--   private : only the owner can open the share link
--   users   : any authenticated DietLedger user can open the link
--   public  : anyone can open the link; appears in the community gallery

ALTER TABLE shared_recipes ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';

UPDATE shared_recipes SET visibility = CASE WHEN is_public THEN 'public' ELSE 'users' END;

ALTER TABLE shared_recipes DROP COLUMN is_public;

CREATE INDEX IF NOT EXISTS idx_shared_recipes_visibility ON shared_recipes(visibility);

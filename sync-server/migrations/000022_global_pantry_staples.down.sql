-- Re-seed nothing; just undo the schema changes. Account staples had no globals before.
DROP INDEX IF EXISTS pantry_staples_user_name_key;
DROP INDEX IF EXISTS pantry_staples_global_name_key;
DELETE FROM pantry_staples WHERE is_global = TRUE;
ALTER TABLE pantry_staples DROP COLUMN IF EXISTS is_global;
-- Restore NOT NULL on user_id (only safe if no NULL rows remain, which holds after the DELETE above).
ALTER TABLE pantry_staples ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE pantry_staples ADD CONSTRAINT pantry_staples_user_id_name_key UNIQUE (user_id, name);

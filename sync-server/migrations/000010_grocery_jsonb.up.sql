ALTER TABLE grocery_checklists
  ALTER COLUMN checked_items DROP DEFAULT,
  ALTER COLUMN checked_items SET DATA TYPE JSONB USING checked_items::jsonb,
  ALTER COLUMN checked_items SET DEFAULT '[]'::jsonb;

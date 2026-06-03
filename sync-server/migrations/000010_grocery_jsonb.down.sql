ALTER TABLE grocery_checklists ALTER COLUMN checked_items SET DATA TYPE TEXT USING checked_items::text;
ALTER TABLE grocery_checklists ALTER COLUMN checked_items SET DEFAULT '[]';

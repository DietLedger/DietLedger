CREATE VIRTUAL TABLE IF NOT EXISTS food_item_fts USING fts5(
  description,
  content='FoodItem',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS food_item_ai AFTER INSERT ON FoodItem BEGIN
  INSERT INTO food_item_fts(rowid, description) VALUES (new.id, new.description);
END;

CREATE TRIGGER IF NOT EXISTS food_item_ad AFTER DELETE ON FoodItem BEGIN
  INSERT INTO food_item_fts(food_item_fts, rowid, description) VALUES('delete', old.id, old.description);
END;

CREATE TRIGGER IF NOT EXISTS food_item_au AFTER UPDATE ON FoodItem BEGIN
  INSERT INTO food_item_fts(food_item_fts, rowid, description) VALUES('delete', old.id, old.description);
  INSERT INTO food_item_fts(rowid, description) VALUES (new.id, new.description);
END;

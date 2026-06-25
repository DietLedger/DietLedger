UPDATE weight_entries SET weight_kg = 0 WHERE weight_kg IS NULL;
ALTER TABLE weight_entries ALTER COLUMN weight_kg SET NOT NULL;

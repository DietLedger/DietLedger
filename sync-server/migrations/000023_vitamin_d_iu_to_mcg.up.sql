-- Correct stored vitamin D values that were ingested from USDA sources in
-- IU into a field that is micrograms everywhere downstream (labels use a
-- 20 mcg Daily Value reference; profile goals are micrograms). 1 ug = 40 IU.
--
-- Scope:
--   food_items  — rows seeded from USDA datasets or cached from live USDA
--                 search (source identifies the origin). Custom foods are
--                 user-authored in micrograms and are NOT touched.
--   ingredients — snapshots linked to real USDA foods (fdc_id > 0). Manual
--                 (-2) and recipe-linked (-1) ingredients are left alone
--                 because their provenance cannot be distinguished in SQL.
--
-- food_log_entries and day_plan_entries are intentionally NOT migrated:
-- they are historical consumption records (docs/NUTRITION_DOMAIN.md: historical
-- data is immutable). Existing logs keep their legacy values; new entries
-- are correct from the fixed ingestion path onward.
UPDATE food_items
   SET vitamin_d = vitamin_d * 0.025, updated_at = NOW()
 WHERE source IN ('foundation', 'sr_legacy', 'fndds', 'branded', 'usda', 'fda')
   AND vitamin_d > 0;

UPDATE ingredients
   SET vitamin_d = vitamin_d * 0.025
 WHERE fdc_id > 0
   AND vitamin_d > 0;

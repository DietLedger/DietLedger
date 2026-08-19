-- Not safely reversible: scaling back by 40 would overcorrect any row that
-- was already stored in micrograms (custom foods, re-seeded rows). Restoring
-- the pre-migration state requires re-seeding USDA data.
SELECT 1;

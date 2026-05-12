DROP TABLE IF EXISTS food_item_fts;
DROP TABLE IF EXISTS food_item_fts_config;
DROP TABLE IF EXISTS food_item_fts_data;
DROP TABLE IF EXISTS food_item_fts_docsize;
DROP TABLE IF EXISTS food_item_fts_idx;

CREATE TABLE IF NOT EXISTS "PersonProfile" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "name" TEXT NOT NULL,
    "sex" TEXT NOT NULL,
    "birthDate" TEXT,
    "heightCm" REAL,
    "activityLevel" TEXT NOT NULL DEFAULT 'sedentary',
    "goalWeightKg" REAL,
    "goalDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "FoodLogEntry" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "profileId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "mealSlot" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "name" TEXT NOT NULL,
    "servings" REAL NOT NULL DEFAULT 1,
    "calories" REAL NOT NULL DEFAULT 0,
    "totalFat" REAL NOT NULL DEFAULT 0,
    "saturatedFat" REAL NOT NULL DEFAULT 0,
    "transFat" REAL NOT NULL DEFAULT 0,
    "cholesterol" REAL NOT NULL DEFAULT 0,
    "sodium" REAL NOT NULL DEFAULT 0,
    "totalCarbs" REAL NOT NULL DEFAULT 0,
    "dietaryFiber" REAL NOT NULL DEFAULT 0,
    "totalSugars" REAL NOT NULL DEFAULT 0,
    "addedSugars" REAL NOT NULL DEFAULT 0,
    "protein" REAL NOT NULL DEFAULT 0,
    "vitaminD" REAL NOT NULL DEFAULT 0,
    "calcium" REAL NOT NULL DEFAULT 0,
    "iron" REAL NOT NULL DEFAULT 0,
    "potassium" REAL NOT NULL DEFAULT 0,
    "lastSyncedAt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodLogEntry_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PersonProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "WeightEntry" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "profileId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "weightKg" REAL NOT NULL,
    "notes" TEXT,
    "lastSyncedAt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeightEntry_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PersonProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PersonProfile_updatedAt_idx" ON "PersonProfile"("updatedAt");

CREATE INDEX IF NOT EXISTS "FoodLogEntry_profileId_idx" ON "FoodLogEntry"("profileId");
CREATE INDEX IF NOT EXISTS "FoodLogEntry_date_idx" ON "FoodLogEntry"("date");
CREATE INDEX IF NOT EXISTS "FoodLogEntry_profileId_date_idx" ON "FoodLogEntry"("profileId", "date");
CREATE INDEX IF NOT EXISTS "FoodLogEntry_sourceType_sourceId_idx" ON "FoodLogEntry"("sourceType", "sourceId");

CREATE UNIQUE INDEX IF NOT EXISTS "WeightEntry_profileId_date_key" ON "WeightEntry"("profileId", "date");
CREATE INDEX IF NOT EXISTS "WeightEntry_profileId_idx" ON "WeightEntry"("profileId");
CREATE INDEX IF NOT EXISTS "WeightEntry_date_idx" ON "WeightEntry"("date");

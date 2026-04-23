-- CreateTable
CREATE TABLE "FoodItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fdcId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "brandOwner" TEXT,
    "gtinUpc" TEXT,
    "servingSize" REAL NOT NULL DEFAULT 100,
    "servingSizeUnit" TEXT NOT NULL DEFAULT 'g',
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
    "source" TEXT NOT NULL DEFAULT 'usda',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SeedJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dataType" TEXT NOT NULL,
    "releaseDate" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" REAL NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "FoodItem_fdcId_key" ON "FoodItem"("fdcId");

-- CreateIndex
CREATE INDEX "FoodItem_description_idx" ON "FoodItem"("description");

-- CreateIndex
CREATE INDEX "FoodItem_dataType_idx" ON "FoodItem"("dataType");

-- CreateIndex
CREATE INDEX "FoodItem_gtinUpc_idx" ON "FoodItem"("gtinUpc");

-- FTS5 virtual table for fast text search
CREATE VIRTUAL TABLE IF NOT EXISTS food_item_fts USING fts5(
  description,
  content='FoodItem',
  content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS food_item_ai AFTER INSERT ON FoodItem BEGIN
  INSERT INTO food_item_fts(rowid, description) VALUES (new.id, new.description);
END;

CREATE TRIGGER IF NOT EXISTS food_item_ad AFTER DELETE ON FoodItem BEGIN
  INSERT INTO food_item_fts(food_item_fts, rowid, description) VALUES('delete', old.id, old.description);
END;

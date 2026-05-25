import { PrismaClient } from '@prisma/client'
import path from 'path'
import { homedir } from 'os'
import { mkdirSync } from 'fs'

function getDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  if (process.env.DOCKER) return 'file:/app/db/custom.db'
  const dbDir = path.join(homedir(), '.recipetool')
  mkdirSync(dbDir, { recursive: true })
  return `file:${path.join(dbDir, 'dev.db')}`
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: getDbUrl(),
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

let schemaEnsured = false

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS Recipe (id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL, servings INTEGER NOT NULL DEFAULT 1, instructions TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS Ingredient (id TEXT NOT NULL PRIMARY KEY, recipeId TEXT NOT NULL, fdcId INTEGER NOT NULL, name TEXT NOT NULL, amount REAL NOT NULL, unit TEXT NOT NULL, calories REAL NOT NULL DEFAULT 0, totalFat REAL NOT NULL DEFAULT 0, saturatedFat REAL NOT NULL DEFAULT 0, transFat REAL NOT NULL DEFAULT 0, cholesterol REAL NOT NULL DEFAULT 0, sodium REAL NOT NULL DEFAULT 0, totalCarbs REAL NOT NULL DEFAULT 0, dietaryFiber REAL NOT NULL DEFAULT 0, totalSugars REAL NOT NULL DEFAULT 0, addedSugars REAL NOT NULL DEFAULT 0, protein REAL NOT NULL DEFAULT 0, vitaminD REAL NOT NULL DEFAULT 0, calcium REAL NOT NULL DEFAULT 0, iron REAL NOT NULL DEFAULT 0, potassium REAL NOT NULL DEFAULT 0, FOREIGN KEY (recipeId) REFERENCES Recipe(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS Ingredient_recipeId_idx ON Ingredient(recipeId)`,
  `CREATE TABLE IF NOT EXISTS FoodItem (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, fdcId INTEGER NOT NULL, description TEXT NOT NULL, dataType TEXT NOT NULL, brandOwner TEXT, gtinUpc TEXT, servingSize REAL NOT NULL DEFAULT 100, servingSizeUnit TEXT NOT NULL DEFAULT 'g', calories REAL NOT NULL DEFAULT 0, totalFat REAL NOT NULL DEFAULT 0, saturatedFat REAL NOT NULL DEFAULT 0, transFat REAL NOT NULL DEFAULT 0, cholesterol REAL NOT NULL DEFAULT 0, sodium REAL NOT NULL DEFAULT 0, totalCarbs REAL NOT NULL DEFAULT 0, dietaryFiber REAL NOT NULL DEFAULT 0, totalSugars REAL NOT NULL DEFAULT 0, addedSugars REAL NOT NULL DEFAULT 0, protein REAL NOT NULL DEFAULT 0, vitaminD REAL NOT NULL DEFAULT 0, calcium REAL NOT NULL DEFAULT 0, iron REAL NOT NULL DEFAULT 0, potassium REAL NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'usda', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS FoodItem_fdcId_key ON FoodItem(fdcId)`,
  `CREATE INDEX IF NOT EXISTS FoodItem_description_idx ON FoodItem(description)`,
  `CREATE INDEX IF NOT EXISTS FoodItem_dataType_idx ON FoodItem(dataType)`,
  `CREATE INDEX IF NOT EXISTS FoodItem_gtinUpc_idx ON FoodItem(gtinUpc)`,
  `CREATE TABLE IF NOT EXISTS SeedJob (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, dataType TEXT NOT NULL, releaseDate TEXT NOT NULL, fileName TEXT NOT NULL, recordCount INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', progress REAL NOT NULL DEFAULT 0, error TEXT, checkpoint TEXT, startedAt DATETIME, completedAt DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS RecipeBook (id TEXT NOT NULL PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', coverColor TEXT NOT NULL DEFAULT '#059669', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS RecipeBook_updatedAt_idx ON RecipeBook("updatedAt")`,
  `CREATE TABLE IF NOT EXISTS Chapter (id TEXT NOT NULL PRIMARY KEY, bookId TEXT NOT NULL, title TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (bookId) REFERENCES RecipeBook(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS Chapter_bookId_idx ON Chapter(bookId)`,
  `CREATE INDEX IF NOT EXISTS Chapter_position_idx ON Chapter(position)`,
  `CREATE TABLE IF NOT EXISTS ChapterRecipe (id TEXT NOT NULL PRIMARY KEY, chapterId TEXT NOT NULL, recipeId TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, FOREIGN KEY (chapterId) REFERENCES Chapter(id) ON DELETE CASCADE, UNIQUE(chapterId, recipeId))`,
  `CREATE INDEX IF NOT EXISTS ChapterRecipe_chapterId_idx ON ChapterRecipe(chapterId)`,
  `CREATE INDEX IF NOT EXISTS ChapterRecipe_recipeId_idx ON ChapterRecipe(recipeId)`,
  `CREATE TABLE IF NOT EXISTS ChapterPage (id TEXT NOT NULL PRIMARY KEY, chapterId TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (chapterId) REFERENCES Chapter(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS ChapterPage_chapterId_idx ON ChapterPage(chapterId)`,
  `CREATE INDEX IF NOT EXISTS ChapterPage_position_idx ON ChapterPage(position)`,
  `CREATE TABLE IF NOT EXISTS Category (id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL, parentId TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (parentId) REFERENCES Category(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS Category_parentId_idx ON Category(parentId)`,
  `CREATE TABLE IF NOT EXISTS RecipeCategory (id TEXT NOT NULL PRIMARY KEY, recipeId TEXT NOT NULL, categoryId TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(recipeId, categoryId))`,
  `CREATE INDEX IF NOT EXISTS RecipeCategory_recipeId_idx ON RecipeCategory(recipeId)`,
  `CREATE INDEX IF NOT EXISTS RecipeCategory_categoryId_idx ON RecipeCategory(categoryId)`,
  `CREATE TABLE IF NOT EXISTS PersonProfile (id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL, sex TEXT NOT NULL, birthDate TEXT, heightCm REAL, activityLevel TEXT NOT NULL DEFAULT 'moderate', goalWeightKg REAL, goalDate TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS PersonProfile_updatedAt_idx ON PersonProfile("updatedAt")`,
  `CREATE TABLE IF NOT EXISTS FoodLogEntry (id TEXT NOT NULL PRIMARY KEY, profileId TEXT NOT NULL, date TEXT NOT NULL, mealSlot TEXT NOT NULL, sourceType TEXT NOT NULL, sourceId TEXT, name TEXT NOT NULL, servings REAL NOT NULL DEFAULT 1, calories REAL NOT NULL DEFAULT 0, totalFat REAL NOT NULL DEFAULT 0, saturatedFat REAL NOT NULL DEFAULT 0, transFat REAL NOT NULL DEFAULT 0, cholesterol REAL NOT NULL DEFAULT 0, sodium REAL NOT NULL DEFAULT 0, totalCarbs REAL NOT NULL DEFAULT 0, dietaryFiber REAL NOT NULL DEFAULT 0, totalSugars REAL NOT NULL DEFAULT 0, addedSugars REAL NOT NULL DEFAULT 0, protein REAL NOT NULL DEFAULT 0, vitaminD REAL NOT NULL DEFAULT 0, calcium REAL NOT NULL DEFAULT 0, iron REAL NOT NULL DEFAULT 0, potassium REAL NOT NULL DEFAULT 0, lastSyncedAt TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (profileId) REFERENCES PersonProfile(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS FoodLogEntry_profileId_idx ON FoodLogEntry(profileId)`,
  `CREATE INDEX IF NOT EXISTS FoodLogEntry_date_idx ON FoodLogEntry(date)`,
  `CREATE INDEX IF NOT EXISTS FoodLogEntry_profileId_date_idx ON FoodLogEntry(profileId, date)`,
  `CREATE INDEX IF NOT EXISTS FoodLogEntry_sourceType_sourceId_idx ON FoodLogEntry(sourceType, sourceId)`,
  `CREATE TABLE IF NOT EXISTS WeightEntry (id TEXT NOT NULL PRIMARY KEY, profileId TEXT NOT NULL, date TEXT NOT NULL, weightKg REAL NOT NULL, notes TEXT, lastSyncedAt TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (profileId) REFERENCES PersonProfile(id) ON DELETE CASCADE, UNIQUE(profileId, date))`,
  `CREATE INDEX IF NOT EXISTS WeightEntry_profileId_idx ON WeightEntry(profileId)`,
  `CREATE INDEX IF NOT EXISTS WeightEntry_date_idx ON WeightEntry(date)`,
]

export async function ensureSchema() {
  if (schemaEnsured) return
  try {
    await db.$queryRaw`SELECT 1 FROM Recipe LIMIT 1`
    schemaEnsured = true
  } catch {
    console.log('[ensureSchema] Tables missing, creating...')
    try {
      for (const sql of CREATE_TABLES) {
        try {
          await db.$executeRawUnsafe(sql)
        } catch (e) {
          console.error('[ensureSchema] SQL failed:', sql.substring(0, 80), e)
        }
      }
      console.log('[ensureSchema] Done')
      schemaEnsured = true
    } catch (e) {
      console.error('[ensureSchema] Fatal:', e)
    }
  }
}

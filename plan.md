# USDA Food Database Seeding + Local-First Search

## Architecture Decision

**Hybrid storage model:**
- **SQLite** (via Prisma) for the food ingredient database — handles millions of records with indexed search
- **IndexedDB** (existing) for user recipes — keeps the web version working offline for recipe editing
- **Next.js API routes** for all food database operations (search, seed, cache)
- **Tauri** can use the same SQLite database natively via `tauri-plugin-sql`

---

## Phase 1: Prisma Schema Extension & Migration

**File: `prisma/schema.prisma`**

Add new models alongside the existing `Recipe` and `Ingredient`:

```prisma
model FoodItem {
  id              Int      @id @default(autoincrement())
  fdcId           Int      @unique
  description     String
  dataType        String   // Foundation, SR Legacy, Survey (FNDDS), Branded
  brandOwner      String?
  gtinUpc         String?  // UPC/barcode (Branded foods)
  servingSize     Float    @default(100)
  servingSizeUnit String   @default("g")

  // FDA Nutrition Label nutrients (per 100g, normalized)
  calories      Float @default(0)
  totalFat      Float @default(0)
  saturatedFat  Float @default(0)
  transFat      Float @default(0)
  cholesterol   Float @default(0)
  sodium        Float @default(0)
  totalCarbs    Float @default(0)
  dietaryFiber  Float @default(0)
  totalSugars   Float @default(0)
  addedSugars   Float @default(0)
  protein       Float @default(0)
  vitaminD      Float @default(0)
  calcium       Float @default(0)
  iron          Float @default(0)
  potassium     Float @default(0)

  source    String   @default("usda") // usda, fda_api, manual
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([description])
  @@index([dataType])
  @@index([gtinUpc])
}

model SeedJob {
  id           Int      @id @default(autoincrement())
  dataType     String   // Foundation, SR Legacy, FNDDS, Branded, Full
  releaseDate  String   // e.g. "2025-12-18"
  fileName     String
  recordCount  Int      @default(0)
  status       String   @default("pending") // pending, downloading, extracting, importing, completed, failed
  progress     Float    @default(0)
  error        String?
  startedAt    DateTime?
  completedAt  DateTime?
  createdAt    DateTime @default(now())
}
```

**Raw SQL migration** to add FTS5 virtual table for fast text search on `description`:

```sql
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
```

---

## Phase 2: USDA Download & Import Engine

**New file: `src/lib/usda-import.ts`** — Server-side module for:
- Downloading USDA zip files via Node.js `fetch` (no CORS issues server-side)
- Extracting JSON/CSV from zip (using `adm-zip` or Node `zlib`)
- Streaming parse & normalize food records
- Batch insert into SQLite via Prisma (chunks of 500-1000 for performance)
- Nutrient extraction using the same ID mapping already in `fda-client.ts:78-122`

**New file: `src/lib/usda-datasets.ts`** — Dataset configuration:

```typescript
export const USDA_DATASETS = {
  foundation: {
    name: 'Foundation Foods',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2025-12-18.zip',
    releaseDate: '2025-12-18',
    format: 'json',
    estimatedSize: '467K zipped / 6.5M',
    description: 'Analytically derived data on ~400 commodity foods',
  },
  srLegacy: {
    name: 'SR Legacy',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip',
    releaseDate: '2018-04',
    format: 'json',
    estimatedSize: '12.3M zipped / 205M',
    description: 'Historic Standard Reference data (~7,800 foods)',
  },
  fndds: {
    name: 'FNDDS',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip',
    releaseDate: '2024-10-31',
    format: 'json',
    estimatedSize: '3.7M zipped / 64M',
    description: 'Survey foods for dietary studies (~8,600 foods)',
  },
  branded: {
    name: 'Branded Foods',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_json_2025-12-18.zip',
    releaseDate: '2025-12-18',
    format: 'json',
    estimatedSize: '195M zipped / 3.1G',
    description: 'Branded food products (~1.8M products with UPCs)',
  },
  full: {
    name: 'Full Download (All Data Types)',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_csv_2025-12-18.zip',
    releaseDate: '2025-12-18',
    format: 'csv',
    estimatedSize: '458M zipped / 3.1G',
    description: 'All data types combined (CSV format only)',
  },
};
```

**New file: `src/lib/nutrient-map.ts`** — Centralized nutrient ID mapping:

```typescript
// Maps USDA nutrient IDs to our field names
// Currently tracks the 15 nutrients on the FDA Nutrition Facts label
// Designed to be easily extensible if the label changes
export const NUTRIENT_MAP = {
  1008: 'calories',
  1004: 'totalFat',
  1258: 'saturatedFat',
  1257: 'transFat',
  1253: 'cholesterol',
  1093: 'sodium',
  1005: 'totalCarbs',
  1079: 'dietaryFiber',
  2000: 'totalSugars',
  1235: 'addedSugars',
  1003: 'protein',
  1114: 'vitaminD',
  1087: 'calcium',
  1089: 'iron',
  1092: 'potassium',
} as const;

export type NutrientField = typeof NUTRIENT_MAP[keyof typeof NUTRIENT_MAP];
```

This replaces the duplicate `getNutrient()` logic in both `fda-client.ts` and the API route.

**Note on Glycemic Index**: USDA FoodData Central does not include glycemic index data. The field can be added to the schema later if a complementary data source (e.g., University of Sydney GI Database) is integrated.

---

## Phase 3: API Routes

### Seed Management

**New file: `src/app/api/foods/seed/route.ts`**

- `GET /api/foods/seed` — Returns current seed status (which datasets loaded, record counts, version info from `SeedJob` table)
- `POST /api/foods/seed` — Starts a seed job:
  - Body: `{ dataset: 'foundation' | 'srLegacy' | 'fndds' | 'branded' | 'full' }`
  - Downloads zip, extracts, parses, imports into SQLite
  - Returns job ID for progress tracking

**New file: `src/app/api/foods/seed/[jobId]/route.ts`**

- `GET /api/foods/seed/[jobId]` — Polls seed job progress (status, progress %, record count, errors)
- `DELETE /api/foods/seed/[jobId]` — Cancels an in-progress seed job

**New file: `src/app/api/foods/seed/upload/route.ts`** — Manual upload endpoint

- `POST /api/foods/seed/upload` — Accepts multipart form data with a `.zip` file
  - Body: `{ file: File, dataType: string }`
  - Extracts and imports the uploaded file
  - Same parsing/import pipeline as the download route

### Food Search

**New file: `src/app/api/foods/search/route.ts`** — Local-first food search

- `GET /api/foods/search?query=chicken&limit=25`
  1. Search SQLite first using FTS5: `SELECT * FROM FoodItem WHERE id IN (SELECT rowid FROM food_item_fts WHERE description MATCH ?)`
  2. If results found, return `{ foods: [...], source: 'local' }`
  3. If no results, fall back to FDA API search
  4. If FDA API results found, **cache them** by inserting into `FoodItem` table with `source: 'fda_api'`
  5. Return `{ foods: [...], source: 'fda' }`

**New file: `src/app/api/foods/upc/route.ts`** — UPC/barcode lookup

- `GET /api/foods/upc?code=041196020524`
  - Queries `FoodItem` by `gtinUpc` index
  - Returns single food item or 404

**New file: `src/app/api/foods/stats/route.ts`** — Database statistics

- `GET /api/foods/stats` — Returns counts by dataType, total records, last seed dates

**New file: `src/app/api/foods/cache/route.ts`** — Cache endpoint

- `POST /api/foods/cache` — Upserts food items from FDA API results into SQLite

---

## Phase 4: Search Flow Update

**Modify: `src/lib/fda-client.ts`** — Change from direct FDA API calls to local-first via API routes:

```typescript
export async function searchFDAFoods(query: string): Promise<FDASearchResponse> {
  // Step 1: Check local SQLite database first
  try {
    const localResponse = await fetch(`/api/foods/search?query=${encodeURIComponent(query)}`);
    if (localResponse.ok) {
      const localData = await localResponse.json();
      if (localData.foods && localData.foods.length > 0) {
        return { foods: localData.foods, source: localData.source };
      }
    }
  } catch {
    // Server unavailable (offline mode) - fall through to direct FDA API
  }

  // Step 2: Fall back to direct FDA API (existing logic)
  // ... existing code ...

  // Step 3: Cache results back to local DB
  if (result.source === 'fda') {
    try {
      await fetch('/api/foods/cache', {
        method: 'POST',
        body: JSON.stringify({ foods: result.foods }),
      });
    } catch {
      // Cache failure is non-critical
    }
  }
}
```

**Modify: `src/lib/recipe-store.ts`** — Update `searchSource` type to include `'local'`:

```typescript
searchSource: 'fda' | 'fallback' | 'local' | null;
```

---

## Phase 5: Seed UI (Dedicated Page)

A dedicated `/food-database` page rather than extending the Settings dialog — the seed process involves progress tracking, dataset selection, and stats that are too complex for the existing small settings dialog. A "Food Database" link will be added in settings and header nav.

**New file: `src/app/food-database/page.tsx`**

UI Components:

1. **Dataset Selection Panel** — Cards for each dataset with:
   - Checkbox to select
   - Name, description, estimated size, record count
   - Current status (not imported / imported v2025-12-18 / updating...)
   - "Seed" button or "Update" button

2. **Seed Progress Panel** — Active job progress:
   - Progress bar with percentage
   - Records imported count
   - Estimated time remaining
   - Cancel button
   - Uses polling to `/api/foods/seed/[jobId]`

3. **Manual Upload Panel** — Alternative for CORS-blocked environments:
   - File input for `.zip` upload
   - Data type selector
   - Upload progress bar

4. **Database Statistics Panel**:
   - Total foods by data type (e.g., Foundation: 400, SR Legacy: 7,800, Branded: 1.8M)
   - Storage usage
   - Last updated dates
   - "Clear Database" button with confirmation

5. **Search Test Panel** — Quick search to verify the database works:
   - Search input → shows results from local DB with source badge

---

## Phase 6: UI Updates to Main Page

**Modify: `src/app/page.tsx`**:

- Update the search dialog to show result source: `Local DB`, `FDA API`, or `Fallback`
- Add a badge or indicator showing local database status (e.g., "1.8M foods indexed" next to the search)
- Add nav link to the Food Database management page
- If searching offline and local DB has data, skip FDA API entirely

---

## Phase 7: Tauri Integration (Optional Enhancement)

For the desktop app, bypass the Next.js server entirely:

- **New file: `src-tauri/src/food_db.rs`** — Direct SQLite access via Rust
- Register Tauri commands for `search_foods`, `seed_database`, `get_seed_status`
- Client detects Tauri environment and calls Tauri commands instead of API routes
- This gives native performance for the 1.8M record Branded Foods search

---

## File Change Summary

| Action | File | Description |
|--------|------|-------------|
| **Modify** | `prisma/schema.prisma` | Add `FoodItem`, `SeedJob` models |
| **New** | `prisma/migrations/.../migration.sql` | FTS5 virtual table + triggers |
| **New** | `src/lib/nutrient-map.ts` | Centralized nutrient ID→field mapping |
| **New** | `src/lib/usda-datasets.ts` | Dataset URLs, sizes, metadata |
| **New** | `src/lib/usda-import.ts` | Download, extract, parse, import pipeline |
| **New** | `src/app/api/foods/search/route.ts` | Local-first food search |
| **New** | `src/app/api/foods/upc/route.ts` | UPC/barcode lookup |
| **New** | `src/app/api/foods/stats/route.ts` | Database statistics |
| **New** | `src/app/api/foods/seed/route.ts` | Start seed job |
| **New** | `src/app/api/foods/seed/[jobId]/route.ts` | Poll seed progress |
| **New** | `src/app/api/foods/seed/upload/route.ts` | Manual file upload |
| **New** | `src/app/api/foods/cache/route.ts` | Cache FDA API results |
| **Modify** | `src/lib/fda-client.ts` | Local-first search flow, use nutrient-map |
| **Modify** | `src/lib/recipe-store.ts` | Add `'local'` search source |
| **New** | `src/app/food-database/page.tsx` | Food Database management UI |
| **Modify** | `src/app/page.tsx` | Source badges, nav link to food DB page |
| **New** | `src/app/api/foods/route.ts` | Base foods API route |

---

## Implementation Order

1. **Schema + Migration** — FoodItem, SeedJob, FTS5 (foundation for everything)
2. **nutrient-map.ts + usda-datasets.ts** — Shared config modules
3. **usda-import.ts** — Core import engine
4. **Seed API routes** — `/api/foods/seed/*`
5. **Search + Cache API routes** — `/api/foods/search`, `/api/foods/cache`, `/api/foods/upc`, `/api/foods/stats`
6. **Food Database UI page** — `src/app/food-database/page.tsx`
7. **Update fda-client.ts + recipe-store.ts** — Local-first search flow
8. **Update page.tsx** — Source badges, nav link
9. **Tauri integration** (optional, separate phase)

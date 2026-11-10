# DietLedger Native Recipe/Cookbook Import Design

## Status

Proposed for approval.

## Objective

Replace the current browser-driven recipe/demo import with a server-authoritative Go API import/export system for DietLedger-native recipe bundles.

The system must support:

- recipes
- linked recipes
- books/cookbooks
- supporting food data
- duplicate-safe re-imports

Initial scope is DietLedger-native bundles only. Third-party recipe import formats are out of scope.

---

## Bundle Format

Initial format:

```json
{
  "format": "dietledger.recipe-bundle",
  "version": 1,
  "exportedAt": "...",
  "source": {
    "app": "DietLedger",
    "version": "..."
  },
  "recipes": [],
  "books": [],
  "chapters": [],
  "chapterRecipes": [],
  "chapterPages": [],
  "bookPages": [],
  "categories": [],
  "recipeCategories": [],
  "templates": [],
  "foodItems": [],
  "customFoods": []
}
```

This is not a raw database dump. It is a portable DietLedger bundle.

---

## Identity Rules

### Local primary keys are not portable

Source database primary keys must not become target database primary keys.

Do not preserve source IDs as target IDs:

- `recipes.id`
- `ingredients.id`
- `recipe_books.id`
- `chapters.id`
- `chapter_pages.id`
- `book_pages.id`
- `custom_foods.id`
- `food_items.id`

The importer generates new target IDs.

Source IDs may be used only as bundle-local identity metadata so the importer can build mappings.

Example:

```json
{
  "bundleRecipeId": "source-recipe-id-or-generated-key",
  "name": "Chicken Soup"
}
```

The target recipe gets a new local `recipes.id`.

### USDA identity is portable

USDA identifiers are stable external identifiers and must be preserved.

For USDA-backed food rows, preserve:

- `fdc_id`
- `description`
- `data_type`
- `brand_owner`
- `gtin_upc`
- `serving_size`
- `serving_size_unit`
- canonical nutrients
- `source`

Import behavior:

- insert missing USDA rows
- if `fdc_id` already exists, reuse/skip it
- never reuse source `food_items.id`

This allows a recipe bundle to work in a fresh instance with no USDA seed import.

---

## Stable Import Identity

To avoid duplicate recipes/books on re-import, each importable object needs stable import identity.

Use this priority:

1. Origin key: stable source object identity inside the bundle.
2. Content fingerprint: canonical hash of meaningful object content.
3. Conflict detection: same name/title but different content becomes a conflict, not an automatic duplicate.

The target database should persist import mappings, likely in a new table such as:

```sql
CREATE TABLE import_object_mappings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_format TEXT NOT NULL,
  source_object_type TEXT NOT NULL,
  source_object_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, source_format, source_object_type, source_object_key)
);
```

Object types:

- `recipe`
- `book`
- `chapter`
- `chapter_page`
- `book_page`
- `category`
- `template`
- `custom_food`

USDA `food_items` do not need this mapping because `fdc_id` is already the stable external identity.

---

## Duplicate Policy

Imports must not duplicate existing recipes or books.

### If origin mapping exists

Update/replace the existing imported object from the bundle **only when the mapped target still exists and belongs to the importing user**. Deleted recipes or books leave stale mappings: create a new local recipe shell or book, remap their dependent ingredients/pages/chapters, and replace the stale origin mapping. Check content-hash mappings the same way before reuse. On a valid book update, refresh the origin mapping and replace its pages and chapters within the same transaction.

This makes re-import idempotent without writing ingredients or book pages against deleted or foreign-owned parent IDs.

### If exact content hash already exists

Reuse the existing object and record a mapping.

### If same name/title exists but content differs

Do not silently duplicate.

Treat it as an import conflict.

Default v1 behavior:

- skip conflicted object
- report the conflict in the import result
- do not create names like `Chicken Soup (Imported)` automatically

Later versions may add user-selectable conflict strategies.

---

## Supporting Food Data

A bundle must be self-contained. It must include all food rows needed by exported recipes.

### USDA food items

Export all USDA `food_items` used by ingredients.

Import by `fdc_id`:

- insert missing rows
- reuse existing rows
- ignore duplicate rows safely

### Custom/local foods

All custom/local foods required by recipes must be included.

Because custom foods do not have a global external ID, they need:

- bundle-local ID
- content hash
- nutrient values
- name

Import behavior:

- if origin mapping exists, reuse/update
- else if exact content hash exists for that user, reuse
- else create a new custom food with a new local ID

---

## Ingredient Source Metadata

To know which food records support a recipe, ingredients need explicit source metadata.

Current ingredients have:

- `fdcId`
- `linkedRecipeId`
- nutrient snapshot fields

That is enough for USDA and linked recipes, but not enough to reliably identify custom-food dependencies.

Requirement: add ingredient source metadata.

Suggested fields:

```txt
source_type
source_key
```

Possible values:

```txt
source_type = 'usda'
source_key = fdc_id

source_type = 'custom_food'
source_key = custom food bundle key or mapped target key

source_type = 'recipe'
source_key = linked recipe bundle key or mapped target key

source_type = 'manual'
source_key = null
```

Ingredients should still store nutrient snapshot fields.

---

## Nutrient Snapshots

Even though food rows are included, ingredients must still import nutrient snapshot values.

Reason:

- imported recipes should immediately match the source recipe nutrition
- food rows allow future recalculation/editing
- snapshots preserve import-time calculation state

Ingredient import writes both:

- source/reference metadata
- snapshot nutrient values

---

## Linked Recipes

If a recipe uses another recipe as an ingredient, the linked recipe must be included in the bundle.

Import order:

1. import/reuse foods
2. create/reuse all recipe shells
3. build bundle recipe ID to target recipe ID map
4. hydrate ingredients with remapped linked recipe IDs

No imported ingredient may point at a source instance recipe ID.

---

## Books/Cookbooks

Cookbook structure is part of v1.

The bundle must include:

- `recipe_books`
- `chapters`
- `chapter_recipes`
- `chapter_pages`
- `book_pages`
- positions/order
- chapter recipe placement
- book/chapter page content

Import must preserve ordering.

If a book exists by origin mapping, re-import updates/replaces its structure rather than duplicating it.

---

## Templates

Chapters may reference:

- `pageTemplateId`
- `recipeTemplateId`

The bundle should include referenced templates.

Import behavior:

- import/reuse templates
- remap chapter template IDs
- if a referenced template is missing and not included, clear the reference rather than creating a dangling ID

---

## Categories

Recipe category assignments should be preserved.

The bundle should include:

- categories assigned to exported recipes
- parent category closure
- recipe-category joins

Import behavior:

- import/reuse categories by origin/content/name path
- remap recipe-category joins
- do not create duplicate category trees if already imported

---

## Server-Authoritative Implementation

The Go API owns:

- export graph traversal
- bundle generation
- schema validation
- import transaction orchestration
- food upserts
- ID remapping
- duplicate detection
- conflict reporting
- import mapping persistence

The frontend owns only:

- triggering export/import
- uploading/downloading bundle files
- showing progress/results

---

## API Shape

Proposed endpoints:

```txt
POST /api/recipe-bundles/export
POST /api/recipe-bundles/import
```

Optional later endpoint:

```txt
GET /api/recipe-bundles/imports/{id}
```

For v1, synchronous import is acceptable if bundle size is small enough. If import becomes slow, move to job-based import.

---

## Import Result

Import should return an explicit summary:

```json
{
  "ok": true,
  "data": {
    "created": {
      "recipes": 10,
      "books": 1,
      "foods": 42
    },
    "updated": {
      "recipes": 3,
      "books": 1
    },
    "reused": {
      "foods": 20,
      "customFoods": 2
    },
    "skipped": {},
    "conflicts": []
  }
}
```

Conflicts should be explicit and actionable.

---

## Replacement of Old Import Path

The current browser-driven import path will be replaced entirely.

Eventually remove or stop using:

- `src/lib/export-import.ts`
- `src/app/api/unpack/route.ts`
- `src/app/api/pack/route.ts`
- `public/demo/demo-cookbook.zip`
- setup wizard demo import flow

The future one-time starter data import can be SQL/seed-based, but that is separate and not the current focus.

---

## Acceptance Criteria

A complete v1 must prove:

1. Export includes recipes and linked recipe dependencies.
2. Export includes book/cookbook structure.
3. Export includes required USDA `food_items`.
4. Export includes required custom foods.
5. Import into a fresh instance with no USDA seed data succeeds.
6. USDA foods dedupe by `fdc_id`.
7. Custom foods dedupe by origin/content hash.
8. Recipes do not duplicate on re-import.
9. Books do not duplicate on re-import.
10. Linked recipe ingredients remap correctly.
11. Chapter/book ordering is preserved.
12. Template references are remapped or safely cleared.
13. Recipe categories are preserved.
14. No source database primary key is reused as a target primary key.
15. Browser-side import orchestration is no longer the import authority.

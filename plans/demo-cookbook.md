# Demo Cookbook — Content API & Wizard Seed Plan

> Status: Complete. Wizard install step + Settings re-run both shipped.
> Last updated: 2026-06-30

This document covers three things, in order:

1. **The Content Creation API** — the programmatic interface for creating recipes, cookbooks, chapters, pages, and placing recipes into chapters. Use this to author demo content (or anything else) via script.
2. **The wizard seed plan** — how the same content becomes the optional "demo cookbook" installed during first-run setup.
3. **Creating the seed file** — the format, the recommended authoring path, and the nutrition rules.

The importer that consumes the seed file was repaired in `src/lib/export-import.ts` (`importFromJson` now reconstructs full recipes, the cookbook graph, and categories with id remapping).

---

## Part 1 — Content Creation API

All endpoints are under the Go API (`sync-server`). Every route is `requireAuth`-wrapped (`server.go:399`).

### Authentication

```
Authorization: Bearer <token>
```

`requireAuth` accepts either:
- **A JWT** from `POST /api/auth/login` `{email, password}` → `accessToken`. Reliable, but short-lived (refresh via `/api/auth/refresh`).
- **The user's personal API key** (`users.api_key`, looked up by `GetUserByAPIKey`).

> ⚠️ **Scoped API keys created on the Settings page (`/api/keys`, the `api_keys` table) are NOT validated by `requireAuth`.** There is no `ValidateAPIKey` path — they are only stored/listed/deleted. They will not authenticate scripts. Use a JWT or the personal key for programmatic access. (Wiring scoped-key validation into `requireAuth` is a planned follow-up so scripts can use stable, permission-scoped keys.)

All responses are `{ ok: boolean, data: <record> }` (`201` on create). All created content is **owned by the authenticated user**.

### Endpoints

| Operation | Method & URL | Request body |
|---|---|---|
| **Create recipe** | `POST /api/recipes` | `{name}` (only required field); `servings`, `servingName`, `ingredients` optional |
| **Hydrate recipe** | `PUT /api/recipes/{id}` | `{name?, servings?, servingName?, instructions?, leftoverStorage?, ingredients?, ingredientGroups?}` |
| **Add ingredient** | `POST /api/recipes/{id}/ingredients` | full ingredient object (see format spec) |
| **Create book** | `POST /api/books` | `{title, description, coverColor}` |
| **Update book** | `PUT /api/books/{id}` | `{title?, description?, coverColor?}` |
| **Create chapter** | `POST /api/books/{bookId}/chapters` | `{title, position}` |
| **Update chapter** | `PUT /api/chapters/{id}` | `{title?, position?, pageTemplateId?, recipeTemplateId?}` |
| **Add book page** | `POST /api/books/{bookId}/pages` | `{title, content, position}` |
| **Add chapter page** | `POST /api/chapters/{chapterId}/pages` | `{title, content, position}` |
| **Add recipe to chapter** | `POST /api/chapters/{chapterId}/recipes` | `{recipeId, position}` |
| **Update any page** | `PUT /api/pages/{id}` | `{title?, content?, position?}` |

Verified handlers: `createRecipe` (`handlers_crud.go:163`), `bookItemRouter` → `chaptersRouter` / `bookPagesRouter` (`:793` / `:846` / `:1179`), `chapterRecipesRouter` (`:916`), `chapterPagesRouter` (`:963`).

Supporting operations also exist: delete recipe/book/chapter/page, remove recipe from chapter, and reorder endpoints (`/api/books/{id}/chapters/reorder`, `/api/chapters/{id}/items`, book-level reorder). These are out of scope for seeding but available.

### Scripting notes

- **`position` is accepted on every create/add** above (chapters, chapter-pages, chapter-recipes, book-pages). Impose order directly in the POST rather than a separate reorder call. (The TS client omits `position` and reorders afterwards, so raw HTTP is strictly more capable here.)
- **`ingredientGroups` must be a JSON *string*** in the recipe `PUT`, not an array — see `api-client-go.ts:270` (`JSON.stringify`). `ingredients` stays a normal array of objects.
- **`instructions`** is the serialized string. Accepts: `null`, a plain string (one step), a JSON array `[{id,text},...]`, or the full `{"steps":[{"id","text","groupId?"}],"groups":[{"id","title"}]}` stringified. Multi-step recipes should use the full object form.
- Ids in create responses are server-generated; capture them to wire children (chapter → book, recipe-into-chapter, page → chapter).

### Minimal end-to-end example (pseudocode)

```
POST /api/auth/login            → accessToken
POST /api/recipes  {name}        → recipe.id            (r1)
PUT  /api/recipes/{r1} {servings, instructions, ingredients, ingredientGroups}
POST /api/books    {title,...}   → book.id              (b1)
POST /api/books/{b1}/chapters {title, position:0}       → chapter.id (c1)
POST /api/chapters/{c1}/recipes {recipeId:r1, position:0}
POST /api/books/{b1}/pages      {title, content, position:0}   (optional editorial page)
```

---

## Part 2 — Wizard seed plan (Phase 3)

### Goal

Ship a curated, real-recipe cookbook bundled with the instance. On a fresh install the admin can install it from the setup wizard ("Install demo cookbook?"); afterwards it is re-runnable from Settings. The cookbook is ordinary user data owned by the admin — deletable like anything else, never system data.

### Architecture decisions

- **Reuse the repaired importer.** The same `src/lib/export-import.ts` import path is used for backups and for the demo bundle. No second, server-side importer is introduced (avoids duplicating business logic). A server-side `POST /api/instance/demo` is explicitly **deferred** — it would duplicate the import logic; revisit only if atomicity/performance of a one-time ~10-recipe bundle ever justifies it.
- **Server-authoritative content, client-orchestrated install.** The bundle is a static asset; the client fetches it and runs it through the importer, which calls the existing user-scoped endpoints. The Go API remains the source of truth; the browser is not authoritative (per `ARCHITECTURE.md`).
- **Nutrition is derived, not invented** (high-risk domain, `NUTRITION_DOMAIN.md`). See Part 3.
- **No dependency on USDA seeding.** Ingredient nutrition lives in the snapshot on each ingredient, so the cookbook is correct whether or not the admin seeded USDA in the previous wizard step. `fdcId`s are included for food-database linkage when USDA data is present.

### Bundle + install path

1. Bundle lives at `public/demo/demo-cookbook.json` (served as a static asset at `/demo/demo-cookbook.json`).
2. Refactor `src/lib/export-import.ts`: extract `importData(data: ExportData): Promise<ImportResult>` from `importFromJson` (which becomes: parse file → call `importData`). This lets the wizard import a fetched object without a `File`.
3. Wizard `demo` step fetches `/demo/demo-cookbook.json` and calls `importData`. On success, show counts; on failure, show the error but allow continue/skip.
4. Settings exposes the same fetch + `importData` behind a "Re-seed demo cookbook" action.

### Wizard step

Insert a `demo` step into `src/components/setup/setup-wizard.tsx` between `usda` and `profile`:

- Step order becomes: `welcome → account → basics → registration → usda → demo → profile → finish`.
- UI: a short description + two radio options — **Install demo cookbook** / **Skip**. Default: install on a fresh instance.
- On continue: if install selected, `await importData(bundle)` (non-blocking of correctness, but awaits so counts/errors surface before advancing).
- "Continue" is always enabled; a failed install shows an error but does not trap the user.

### Settings re-run

Add an admin-only "Demo cookbook" card to `src/app/(app)/settings/page.tsx`:
- Button: "Install / Re-seed demo cookbook" → fetch + `importData`.
- Shows last import result counts.

### Idempotency

Import does not dedupe by name — re-installing creates a second copy. Approach:
- Track install state in the per-user settings as `demoCookbookInstalled` (boolean + timestamp). The wizard step defaults to **Skip** when already installed; Settings shows a confirmation dialog ("This adds a second copy — continue?") before re-seeding.
- Acceptable because the data is admin-owned and individually deletable. True content-addressed dedup is out of scope.

### Nutrition correctness

- Each ingredient carries its own 16-nutrient snapshot, scaled to its quantity (see Part 3). Recipe per-serving nutrition is computed by the existing calculator (sum ingredients ÷ servings) — never authored at the recipe level.
- Treat seed authoring as nutrition-domain work: validate a sample of recipes against an independent calculation before shipping.

### Phased tasks

1. **Refactor importer** — DONE. `importData(data, onProgress?)` extracted; `importFromJson`/`importFromZip` are thin wrappers. Id remapping covered (recipe `linkedRecipeId`, chapter→book, chapter-recipe, category parent, ingredient `groupId`).
2. **Author the bundle** — DONE. `scripts/convert-seed-recipes.js` (`npm run convert-seed-recipes`) converts the markdown in `seed-recipes/` → `seed-recipes/dist/seed-recipes.{json,zip}` and publishes `public/demo/demo-cookbook.zip` for the wizard. 408 recipes, 381 categories. Nutrition best-effort via USDA auto-match (set `SEED_API_URL` + `SEED_API_TOKEN` and re-run after seeding to populate).
3. **Wizard step** — DONE. `demo` step between `usda` and `profile`: opt-in (default Skip), fetches `/demo/demo-cookbook.zip`, runs `importFromZip` with `onProgress`, finishes before advancing.
4. **Settings re-run** — DONE. Admin-only "Administration" card in Settings with a confirm dialog that re-runs the same fetch + `importFromZip` and invalidates books/recipes. (Re-install duplicates, as noted.)
5. **Validation** — bundle structure validated (0 broken refs); install on a fresh instance still to be confirmed end-to-end.

---

## Part 3 — Creating the seed file

### Recommended path: build in-app, then export

This guarantees format and nutrition correctness because the bundle is a snapshot of real, calculator-verified data.

1. As the admin, create the cookbook: book → chapters → recipes (with real ingredients linked to foods) → place recipes into chapters → optional pages. Use the UI, or script it with the Part 1 API.
2. Export: Settings → Export All Data (calls `exportAllData()` in `src/lib/export-import.ts`), or run it from the browser console.
3. Trim the resulting JSON to **only** the demo cookbook: keep the target `books`, their `chapters`, `chapterRecipes`, `chapterPages`, `bookPages`, and the `recipes` those chapters reference. Drop unrelated recipes, meal plans, profiles, templates, custom foods, and categories (unless the cookbook uses them).
4. Save as `public/demo/demo-cookbook.json`.

### Alternative: author the JSON directly

Hand- or script-author an `ExportData` document following the format spec below. This requires computing each ingredient's 16 nutrient values yourself (per-100g × grams/100). Only choose this if you cannot use the build-then-export path; it is the riskier route for nutrition accuracy.

### Format specification

The seed file is an `ExportData` document (version 1). Every `data.*` section is optional and defaults to empty; a cookbook bundle typically uses only `recipes`, `books`, `chapters`, `chapterRecipes`, and optionally `chapterPages` / `bookPages`.

```jsonc
{
  "version": 1,
  "exportedAt": "2026-06-30T00:00:00.000Z",
  "data": {
    "recipes":        [ /* RecipeRecord[] — see below */ ],
    "books":          [ /* { id, title, description, coverColor } */ ],
    "chapters":       [ /* { id, bookId, title, position, pageTemplateId?, recipeTemplateId? } */ ],
    "chapterRecipes": [ /* { id, chapterId, recipeId, position } */ ],
    "chapterPages":   [ /* { id, chapterId, title, content, position } */ ],
    "bookPages":      [ /* { id, bookId, title, content, position } */ ],
    "categories":     [],
    "mealPlans":      [],
    "nutritionProfiles": [],
    "templates":      [],
    "customFoods":    []
  }
}
```

**Recipe object**

```jsonc
{
  "id": "r1",                         // any unique string within the bundle (remapped on import)
  "name": "Chocolate Chip Cookies",
  "servings": 24,
  "servingName": "cookie",
  "instructions": "{\"steps\":[{\"id\":\"s1\",\"text\":\"...\"}],\"groups\":[]}", // see Part 1 notes
  "leftoverStorage": "",
  "ingredientGroups": [{ "id": "g1", "title": "Dry" }],
  "ingredients": [ /* IngredientRecord[] — see below */ ]
}
```

- `id` only needs to be unique within the bundle (referenced by `chapterRecipes.recipeId` and by other ingredients' `linkedRecipeId`).
- Recipe-level nutrition is **never** authored — it is derived by the calculator.

**Ingredient object (nutrition lives here — high-risk)**

```jsonc
{
  "id": "i1",
  "fdcId": 123456,                   // real USDA fdcId for linkage, or -2 for a custom ingredient
  "name": "All purpose flour",
  "amount": 1,
  "unit": "cup",
  "description": "",
  "calories": 455, "totalFat": 1.2, "saturatedFat": 0.2, "transFat": 0,
  "cholesterol": 0, "sodium": 2, "totalCarbs": 95, "dietaryFiber": 3.4,
  "totalSugars": 0.3, "addedSugars": 0, "protein": 12.9, "vitaminD": 0,
  "calcium": 19, "iron": 5.8, "potassium": 134,
  "groupId": "g1",                    // matches an ingredientGroups[].id, or null
  "linkedRecipeId": null,             // another recipe's id only if "× recipe" (sub-recipe)
  "prepInstructions": [],
  "storageLocation": ""
}
```

### Ingredient nutrition (high-risk — `NUTRITION_DOMAIN.md`)

The 16 nutrient values are **per-ingredient-quantity, already scaled to `amount`/`unit` — NOT per-100g.** For each ingredient:

```
grams        = convert(amount, unit) -> grams
scaleFactor  = grams / 100
nutrientValue = round(per_100g_value * scaleFactor, 2)   // for each of the 16 keys
```

The 16 keys: `calories`, `totalFat`, `saturatedFat`, `transFat`, `cholesterol`, `sodium`, `totalCarbs`, `dietaryFiber`, `totalSugars`, `addedSugars`, `protein`, `vitaminD`, `calcium`, `iron`, `potassium`.

The authoritative nutrient values come from the linked food's per-100g data (USDA Foundation/SR Legacy, or the fallback set in `src/lib/fallback-foods.ts`). The build-then-export path produces these automatically and correctly; hand-authoring requires recomputing them.

### Validation checklist

- [ ] Bundle parses as `ExportData` (`version: 1`).
- [ ] All `chapterRecipes.recipeId` / `chapterId` and `chapters.bookId` resolve to ids present in the bundle.
- [ ] Every `ingredient.groupId` resolves to an `ingredientGroups[].id` (or is `null`).
- [ ] Spot-check 2–3 recipes: per-serving nutrition equals (Σ ingredient nutrients) ÷ `servings`, recomputed independently.
- [ ] Install on a fresh instance produces the expected counts; chapters contain the right recipes in order.
- [ ] Installed cookbook is owned by the admin and individually deletable; it does not appear as system data or pollute shared food stats.

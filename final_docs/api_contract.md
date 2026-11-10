# DietLedger Phase 1 API Contract

Status: Contract baseline for Phase 1 migration
Date: 2026-07-06
Authority: `final_docs/system_requirements.md` (section 16)
Server: `sync-server/` Go API server

## Conventions

- Base URL: configured via `NEXT_PUBLIC_API_BASE_URL` or proxied through Next.js middleware
- Auth: `Authorization: Bearer <token>` header required on all authenticated endpoints
- Response envelope: `{ "ok": true, "data": ... }` or `{ "ok": false, "error": "message" }`
- Paginated responses: `{ "data": [...], "total": N, "page": N, "perPage": N, "totalPages": N }`
- All timestamps are ISO 8601
- All IDs are UUID strings

---

## Health and About

### GET /api/health

- Auth: None
- Response: `{ "ok": true, "service": "dietledger-api", "version": "..." }`

### GET /api/about

- Auth: None
- Response: `{ "name": "DietLedger API Server", "version": "...", "description": "..." }`

---

## Auth

### POST /api/auth/register

- Auth: None
- Request: `{ "email": string, "password": string, "displayName": string }`
- Response 201: `{ "accessToken": string, "refreshToken": string, "expiresIn": number, "user": User }`
- Response 400: invalid email or missing fields
- Response 409: email already registered
- Ownership: Public (anyone can register unless disabled by admin)

### POST /api/auth/login

- Auth: None
- Request: `{ "email": string, "password": string }`
- Response 200: `{ "accessToken": string, "refreshToken": string, "expiresIn": number, "user": User }`
- Response 401: invalid credentials
- Ownership: Public

### POST /api/auth/refresh

- Auth: None
- Request: `{ "refreshToken": string }`
- Response 200: `{ "accessToken": string, "refreshToken": string, "expiresIn": number, "user": User }`
- Response 401: invalid or expired refresh token
- Ownership: Token-based (only the token owner)

### POST /api/auth/logout

- Auth: Required
- Ownership: Private (own session only)
- Note: TBD — not yet implemented. Required for full session lifecycle.

---

## Instance

These endpoints own instance-level onboarding and administration state. They are
separate from per-user settings: instance setup completion and registration
policy live in PostgreSQL `instance_meta`; per-user onboarding completion lives
in account settings.

### GET /api/instance/state

- Auth: None
- Response 200: `{ "ok": true, "data": { "onboardingComplete": boolean, "onboardingCompletedAt"?: string, "registrationEnabled": boolean, "hasUsers": boolean, "onboardingVersion": number, "updatedAt": string } }`
- Ownership: Instance-level public read, intentionally unauthenticated so the frontend can route first-run setup before login.

### POST /api/instance/onboarding/complete

- Auth: Required admin
- Request: none
- Response 200: `{ "ok": true, "data": InstanceState }`
- Ownership: Instance-level admin-only mutation; stamps setup completion for the whole instance.

### PUT/PATCH /api/instance/registration

- Auth: Required admin
- Request: `{ "registrationEnabled": boolean }`
- Response 200: `{ "ok": true, "data": InstanceState }`
- Response 400: invalid JSON
- Ownership: Instance-level admin-only mutation; controls whether non-first-user registration is allowed.

---

## Account

### GET /api/account/profile

- Auth: Required
- Response: `{ "ok": true, "data": User }`
- Ownership: Private
- Note: TBD — not yet implemented. Currently user data is returned inline with auth responses.

### PUT /api/account/profile

- Auth: Required
- Request: `{ "displayName"?: string, "email"?: string }`
- Response: `{ "ok": true, "data": User }`
- Ownership: Private
- Note: TBD — not yet implemented.

### DELETE /api/account

- Auth: Required
- Response: `{ "ok": true }`
- Ownership: Private
- Note: TBD — not yet implemented. Required for data portability and privacy.

### GET /api/account/export

- Auth: Required
- Response: JSON export of all user data
- Ownership: Private
- Note: TBD — not yet implemented. Required for data portability.

### GET /api/account/settings

- Auth: Required
- Response: `{ "ok": true, "data": { ...settings } }`
- Ownership: Private
- Note: TBD — not yet implemented.

### PUT /api/account/settings

- Auth: Required
- Request: `{ ...settings }`
- Response: `{ "ok": true, "data": { ...settings } }`
- Ownership: Private
- Note: TBD — not yet implemented.

---

## Recipes

### GET /api/recipes

- Auth: Required
- Query: `page` (default 1), `perPage` (default 20)
- Response 200: Paginated `{ "data": Recipe[], "total": N, "page": N, "perPage": N, "totalPages": N }`
- Ownership: Private (user-scoped)

### POST /api/recipes

- Auth: Required
- Request: `CreateRecipeRequest`
- Response 201: `{ "ok": true, "data": Recipe }`
- Response 400: invalid JSON or missing required fields
- Ownership: Private (owned by authenticated user)

### GET /api/recipes/{id}

- Auth: Required
- Response 200: `{ "ok": true, "data": Recipe }`
- Response 404: not found or not owned
- Ownership: Private (owner only)

### PUT /api/recipes/{id}

- Auth: Required
- Request: `UpdateRecipeRequest`
- Response 200: `{ "ok": true, "data": Recipe }`
- Response 404: not found or not owned
- Ownership: Private (owner only)

### DELETE /api/recipes/{id}

- Auth: Required
- Response 200: `{ "ok": true }`
- Response 404: not found or not owned
- Ownership: Private (owner only)

### Ingredient sub-routes

- POST /api/recipes/{id}/ingredients — add ingredient
- PUT /api/recipes/{id}/ingredients/{ingId} — update ingredient
- DELETE /api/recipes/{id}/ingredients/{ingId} — delete ingredient
- POST /api/recipes/{id}/ingredients/replace — replace all ingredients
- PUT/DELETE return 404 when `{ingId}` does not belong to the authorized `{id}` recipe. A first saved nonempty storage location for a matching USDA/custom food atomically records that user's first default without overwriting any existing default.
- Ownership: Private (recipe owner only)

### Recipe category sub-routes

- GET /api/recipes/{id}/categories — list category assignments
- POST /api/recipes/{id}/categories — `{ "categoryId": string }` — add category
- DELETE /api/recipes/{id}/categories?categoryId=... — remove category
- Ownership: Private (recipe owner only)

---

## Books

### GET /api/books

- Auth: Required
- Response 200: `{ "ok": true, "data": RecipeBook[] }`
- Ownership: Private (user-scoped)

### POST /api/books

- Auth: Required
- Request: `CreateBookRequest` `{ "title": string, "description": string, "coverColor": string }`
- Response 201: `{ "ok": true, "data": RecipeBook }`
- Ownership: Private (owned by authenticated user)

### GET /api/books/{id}

- Auth: Required
- Response 200: `{ "ok": true, "data": RecipeBook }`
- Response 404: not found or not owned
- Ownership: Private (owner only)

### PUT /api/books/{id}

- Auth: Required
- Request: `CreateBookRequest`
- Response 200: `{ "ok": true, "data": RecipeBook }`
- Ownership: Private (owner only)

### DELETE /api/books/{id}

- Auth: Required
- Response 200: `{ "ok": true }`
- Ownership: Private (owner only)

### Chapter sub-routes

- GET /api/books/{id}/chapters — list chapters
- POST /api/books/{id}/chapters — create chapter `{ "title": string, "position": int }`
- PUT /api/books/{id}/chapters/{chapterId} — update chapter
- DELETE /api/books/{id}/chapters/{chapterId} — delete chapter
- POST /api/books/{id}/chapters/reorder — `{ "chapterIds": string[] }` — reorder chapters
- Ownership: Private (book owner only)

### Chapter recipe sub-routes

- GET /api/books/{id}/chapters/{chapterId}/recipes — list chapter recipes
- POST /api/books/{id}/chapters/{chapterId}/recipes — `{ "recipeId": string, "position": int }`
- DELETE /api/books/{id}/chapters/{chapterId}/recipes?recipeId=... — remove recipe from chapter
- Ownership: Private (book owner only)

### Chapter page sub-routes

- GET /api/books/{id}/chapters/{chapterId}/pages — list chapter pages
- POST /api/books/{id}/chapters/{chapterId}/pages — `{ "title": string, "content": string, "position": int }`
- PUT /api/books/{id}/chapters/{chapterId}/pages/{pageId} — update page
- DELETE /api/books/{id}/chapters/{chapterId}/pages/{pageId} — delete page
- Ownership: Private (book owner only)

### Book page sub-routes

- GET /api/books/{id}/pages — list book pages
- POST /api/books/{id}/pages — create book page
- PUT /api/books/{id}/pages/{pageId} — update book page
- DELETE /api/books/{id}/pages/{pageId} — delete book page
- Ownership: Private (book owner only)

---

## Categories

### GET /api/categories

- Auth: Required
- Response 200: `{ "ok": true, "data": Category[] }`
- Ownership: Shared (global categories, readable by all users)

### POST /api/categories

- Auth: Required
- Request: `CreateCategoryRequest` `{ "name": string, "parentId"?: string }`
- Response 201: `{ "ok": true, "data": Category }`
- Ownership: TBD — currently global, may need user-scoping

### PUT /api/categories/{id}

- Auth: Required
- Request: `CreateCategoryRequest`
- Response 200: `{ "ok": true, "data": Category }`
- Ownership: TBD

### DELETE /api/categories/{id}

- Auth: Required
- Response 200: `{ "ok": true }`
- Ownership: TBD

---

## Foods (USDA/FDA)

### GET /api/foods/search

- Auth: None
- Query: `q` (search query), `page` (default 1), `perPage` (default 20)
- Response 200: `{ "foods": FoodItem[], "total": N, "page": N, "perPage": N, "totalPages": N }`
- `FoodItem.portions` is an array of `{ amount: number, measureUnit: string, modifier: string, portionDescription: string, gramWeight: number }`; missing USDA portions are `[]`. These are food-specific weights, not generic volume densities. Imported foods from before migration 000026 have `[]` until USDA data is re-seeded. Sparse live-search upserts do not remove previously stored portions.
- Ownership: Public (read-only reference data)

### GET /api/foods/{fdcId}

- Auth: None
- Response 200: `{ "ok": true, "data": FoodItem }`
- Response 404: not found
- Ownership: Public (read-only)

### GET /api/foods/upc/{gtinUpc}

- Auth: None
- Response 200: `{ "ok": true, "data": FoodItem }`
- Response 404: not found
- Ownership: Public (read-only)

### GET /api/foods/stats

- Auth: None
- Response 200: `{ "ok": true, "data": FoodStats }`
- Ownership: Public (admin diagnostic)

### GET /api/foods/seed

- Auth: None
- Response: list of seed jobs
- Ownership: TBD — should require admin auth

### POST /api/foods/seed

- Auth: None
- Request: `{ "dataType": string, "releaseDate": string, "fileName": string }`
- Response: seed job
- Ownership: TBD — should require admin auth

### GET /api/foods/seed/{jobId}

- Auth: None
- Response: seed job status
- Ownership: TBD — should require admin auth

---

## Per-user food storage defaults

### GET /api/food-storage-defaults

- Auth: Required
- Response 200: `{ "ok": true, "data": [{ "sourceType": "usda" | "custom_food", "sourceKey": string, "location": string }] }` (empty array when none)
- Ownership: Only the authenticated user's defaults are returned.

### PUT /api/food-storage-defaults/{sourceType}/{sourceKey}

- Auth: Required
- Source: `usda` with a canonical positive FDC ID that exists in `food_items`, or `custom_food` with a custom-food ID owned by the authenticated user.
- Request: `{ "location": "Pantry" | "Refrigerator" | "Freezer" | "Countertop" }`
- Response 200: `{ "ok": true, "data": { "sourceType": string, "sourceKey": string, "location": string } }`
- Response 400: invalid source, key, or location; response 404: food not found or not owned.
- This changes the default for **future** ingredients only. It does not alter existing recipes. The first location saved for a matched ingredient inserts a default if none exists; later recipe edits do not replace it.

---

## Custom Foods

### GET /api/custom-foods

- Auth: Required
- Response 200: `{ "ok": true, "data": CustomFood[] }`
- Ownership: Private (user-scoped)

### POST /api/custom-foods

- Auth: Required
- Request: `CreateCustomFoodRequest`
- Response 201: `{ "ok": true, "data": CustomFood }`
- Ownership: Private (owned by authenticated user)

### GET /api/custom-foods/{id}

- Auth: Required
- Response 200: `{ "ok": true, "data": CustomFood }`
- Response 404: not found or not owned
- Ownership: Private (owner only)

### PUT /api/custom-foods/{id}

- Auth: Required
- Request: `CreateCustomFoodRequest`
- Response 200: `{ "ok": true, "data": CustomFood }`
- Ownership: Private (owner only)

### DELETE /api/custom-foods/{id}

- Auth: Required
- Response 200: `{ "ok": true }`
- Ownership: Private (owner only)

### POST /api/custom-foods/{id}/share

- Auth: Required
- Response 200: `{ "ok": true }`
- Ownership: Private (owner only)

### GET /api/custom-foods/community

- Auth: Required
- Query: `page`, `perPage`
- Response 200: Paginated list of shared custom foods
- Ownership: Public (shared by users)

---

## Nutrition Profiles

### GET /api/profiles

- Auth: Required
- Response 200: `{ "ok": true, "data": PersonProfile[] }`
- Ownership: Private (user-scoped)

### POST /api/profiles

- Auth: Required
- Request: `CreateProfileRequest`
- Response 201: `{ "ok": true, "data": PersonProfile }`
- Ownership: Private (owned by authenticated user)

### GET /api/profiles/{id}

- Auth: Required
- Response 200: `{ "ok": true, "data": PersonProfile }`
- Response 404: not found or not owned
- Ownership: Private (owner only)

### PUT /api/profiles/{id}

- Auth: Required
- Request: `CreateProfileRequest`
- Response 200: `{ "ok": true, "data": PersonProfile }`
- Ownership: Private (owner only)

### DELETE /api/profiles/{id}

- Auth: Required
- Response 200: `{ "ok": true }`
- Ownership: Private (owner only)

---

## Food Log Entries

### GET /api/profiles/{profileId}/log

- Auth: Required
- Query: `date` (YYYY-MM-DD) — filter by single date
- Query: `startDate`, `endDate` — filter by date range
- Response 200: `{ "ok": true, "data": FoodLogEntry[] }`
- Ownership: Private (profile owner only)

### POST /api/profiles/{profileId}/log

- Auth: Required
- Request: `CreateFoodLogRequest`
- Response 201: `{ "ok": true, "data": FoodLogEntry }`
- Ownership: Private (profile owner only)

### PUT /api/profiles/{profileId}/log/{entryId}

- Auth: Required
- Request: `CreateFoodLogRequest`
- Response 200: `{ "ok": true, "data": FoodLogEntry }`
- Ownership: Private (entry owner only)

### DELETE /api/profiles/{profileId}/log/{entryId}

- Auth: Required
- Response 200: `{ "ok": true }`
- Ownership: Private (entry owner only)

---

## Weight Entries

### GET /api/profiles/{profileId}/weight

- Auth: Required
- Query: `from` (YYYY-MM-DD), `to` (YYYY-MM-DD)
- Response 200: `{ "ok": true, "data": WeightEntry[] }`
- Ownership: Private (profile owner only)

### POST /api/profiles/{profileId}/weight

- Auth: Required
- Request: `CreateWeightEntryRequest`
- Response 201: `{ "ok": true, "data": WeightEntry }`
- Ownership: Private (profile owner only)

### PUT /api/profiles/{profileId}/weight/{entryId}

- Auth: Required
- Request: `CreateWeightEntryRequest`
- Response 200: `{ "ok": true, "data": WeightEntry }`
- Ownership: Private (entry owner only)

### DELETE /api/profiles/{profileId}/weight/{entryId}

- Auth: Required
- Response 200: `{ "ok": true }`
- Ownership: Private (entry owner only)

---

## Meal Plans

### GET /api/meal-plans

- Auth: Required
- Response 200: `{ "ok": true, "data": MealPlan[] }`
- Ownership: Private (user-scoped)

### POST /api/meal-plans

- Auth: Required
- Request: `CreateMealPlanRequest` `{ "name": string, "weekStart": string, "slotTimes"?: string }`
- Response 201: `{ "ok": true, "data": MealPlan }`
- Ownership: Private (owned by authenticated user)

### GET /api/meal-plans/{id}

- Auth: Required
- Response 200: `{ "ok": true, "data": MealPlan }`
- Response 404: not found or not owned
- Ownership: Private (owner only)

### PUT /api/meal-plans/{id}

- Auth: Required
- Request: `CreateMealPlanRequest`
- Response 200: `{ "ok": true, "data": MealPlan }`
- Ownership: Private (owner only)

### DELETE /api/meal-plans/{id}

- Auth: Required
- Response 200: `{ "ok": true }`
- Ownership: Private (owner only)

### Day plan entry sub-routes

- GET /api/meal-plans/{id}/entries — list entries
- POST /api/meal-plans/{id}/entries — create entry
- PUT /api/entries/{entryId} — update entry
- DELETE /api/entries/{entryId} — delete entry
- Ownership: Private (meal plan owner only)

### Meal group sub-routes

- GET /api/meal-plans/{id}/groups — list groups
- POST /api/meal-plans/{id}/groups — create group `{ "name": string, "date": string, "slot": string, "position": int }`
- DELETE /api/meal-plans/{id}/groups/{groupId} — delete group
- Ownership: Private (meal plan owner only)

---

## Grocery Checklists

### GET /api/grocery

- Auth: Required
- Query: `weekStart` (required, YYYY-MM-DD)
- Response 200: `{ "ok": true, "data": GroceryChecklist | null }`
- Ownership: Private (user-scoped)

### POST /api/grocery

- Auth: Required
- Request: `{ "weekStart": string, "checkedItems": string }` where `checkedItems` is a JSON-encoded string array; `id` and `updatedAt` are server-managed. The frontend API client accepts a `string[]` and encodes/decodes this wire field.
- Response 200: `{ "ok": true, "data": GroceryChecklist }` with JSON-string `checkedItems`
- Ownership: Private (owned by authenticated user)

### PUT /api/grocery

- Auth: Required
- Same as POST (upsert behavior)
- Ownership: Private (owned by authenticated user)

---

## API Keys

### GET /api/keys

- Auth: Required
- Response 200: `{ "ok": true, "data": ApiKey[] }`
- Ownership: Private (user-scoped)

### POST /api/keys

- Auth: Required
- Request: `{ "name": string, "permissions"?: string }`
- Response 201: `{ "ok": true, "data": { "id": string, "name": string, "key": string, "keyPrefix": string, "permissions": string, "createdAt": string } }`
- Ownership: Private (owned by authenticated user)
- Note: The raw key is returned only on creation. It is stored as a hash.

### DELETE /api/keys/{id}

- Auth: Required
- Response 200: `{ "ok": true }`
- Response 404: not found
- Ownership: Private (owner only)

---

## Sharing

### POST /api/share

- Auth: Required
- Request: `ShareRecipeRequest` `{ "recipeId": string, "title": string, "description"?: string, "category"?: string, "tags"?: string, "recipeData": string, "isPublic": bool }`
- Response 201: `SharedRecipe`
- Ownership: Private (owned by authenticated user, shared publicly or via token)

### GET /api/share

- Auth: Required
- Response 200: `SharedRecipe[]`
- Ownership: Private (user's own shares)

### GET /api/share/{shareToken}

- Auth: Required
- Response 200: `SharedRecipe`
- Response 404: not found
- Ownership: Public (any authenticated user can access via share token)

### DELETE /api/share/{id}

- Auth: Required
- Response 200: `{ "ok": true }`
- Ownership: Private (share owner only)

---

## Community

### GET /api/community

- Auth: None
- Query: `q`, `category`, `sort`, `page`, `perPage`
- Response 200: `SharedRecipe[]`
- Ownership: Public (publicly shared recipes only)

### GET /api/community/categories

- Auth: None
- Response 200: `CommunityCategory[]`
- Ownership: Public

---

## User Settings

### GET /api/settings

- Auth: Required
- Response: `{ "ok": true, "data": { "id": "uuid", "userId": "uuid", "settings": "JSON string", "updatedAt": "ISO8601" } }`
- Ownership: Private (user-scoped)
- Notes: `settings` is a JSON string containing all user preferences (meal slot times, unit system, theme, etc.)

### PUT /api/settings

- Auth: Required
- Request: `{ "settings": "JSON string" }`
- Response: `{ "ok": true, "data": { ... } }`
- Ownership: Private (user-scoped)
- Notes: Upserts settings for the authenticated user

### GET /api/settings/location

- Auth: Required
- Response: `{ "ok": true, "data": { "id": "uuid", "userId": "uuid", "country": "string", "region": "string", "updatedAt": "ISO8601" } }` or `{ "ok": true, "data": null }`
- Ownership: Private (user-scoped)

### PUT /api/settings/location

- Auth: Required
- Request: `{ "country": "string", "region": "string" }`
- Response: `{ "ok": true, "data": { ... } }`
- Ownership: Private (user-scoped)
- Notes: Upserts user location (one per user)

### GET /api/settings/seasonal-foods

- Auth: Required
- Query: `country`, `region`, `month` (1-12)
- Response: `{ "ok": true, "data": ["food1", "food2", ...] }`
- Ownership: Public (shared reference data)

## Templates

### GET /api/templates

- Auth: Required
- Query: `type` (optional, one of `recipe`, `book-page`, `book-recipe`)
- Response: `{ "ok": true, "data": [Template, ...] }`
- Ownership: Private user templates + public default templates
- Notes: Returns both user-owned templates and system defaults. Filter by type with query param.

### POST /api/templates

- Auth: Required
- Request: `{ "name": "string", "type": "recipe|book-page|book-recipe", "isDefault": false, "layout": "JSON string" }`
- Response: `{ "ok": true, "data": Template }` (201)
- Ownership: Private (user-scoped)

### GET /api/templates/{id}

- Auth: Required
- Response: `{ "ok": true, "data": Template }` or 404
- Ownership: User-owned or system default

### PUT /api/templates/{id}

- Auth: Required
- Request: `{ "name"?: "string", "layout"?: "JSON string", "isDefault"?: boolean }`
- Response: `{ "ok": true, "data": Template }`
- Ownership: Private (user-scoped, cannot edit system defaults)

### DELETE /api/templates/{id}

- Auth: Required
- Response: `{ "ok": true }` or 404
- Ownership: Private (user-scoped, cannot delete system defaults)

## Dietary Profiles

### GET /api/dietary-profiles

- Auth: Required
- Response: `{ "ok": true, "data": [DietaryProfile, ...] }`
- Ownership: Private (user-scoped)

### POST /api/dietary-profiles

- Auth: Required
- Request: `{ "name": "string", "allergens": "JSON array string", "dietaryTags": "JSON array string", "nutrientThresholds": "JSON array string", "isActive": boolean }`
- Response: `{ "ok": true, "data": DietaryProfile }` (201)
- Ownership: Private (user-scoped)

### GET /api/dietary-profiles/{id}

- Auth: Required
- Response: `{ "ok": true, "data": DietaryProfile }` or 404
- Ownership: Private (user-scoped)

### PUT /api/dietary-profiles/{id}

- Auth: Required
- Request: `{ "name"?: "string", "allergens"?: "JSON", "dietaryTags"?: "JSON", "nutrientThresholds"?: "JSON", "isActive"?: boolean }`
- Response: `{ "ok": true, "data": DietaryProfile }`
- Ownership: Private (user-scoped)

### DELETE /api/dietary-profiles/{id}

- Auth: Required
- Response: `{ "ok": true }` or 404
- Ownership: Private (user-scoped)

## Allergen Rules

### GET /api/dietary-profiles/{profileId}/allergen-rules

- Auth: Required
- Response: `{ "ok": true, "data": [AllergenRule, ...] }`
- Ownership: Private (user-scoped, profile-scoped)

### POST /api/dietary-profiles/{profileId}/allergen-rules

- Auth: Required
- Request: `{ "allergen": "string", "severity": "avoid|caution", "customKeywords": "JSON array string" }`
- Response: `{ "ok": true, "data": AllergenRule }` (201)
- Ownership: Private (user-scoped)

### PUT /api/allergen-rules/{id}

- Auth: Required
- Request: `{ "allergen"?: "string", "severity"?: "avoid|caution", "customKeywords"?: "JSON" }`
- Response: `{ "ok": true, "data": AllergenRule }`
- Ownership: Private (user-scoped)

### DELETE /api/allergen-rules/{id}

- Auth: Required
- Response: `{ "ok": true }`
- Ownership: Private (user-scoped)

## Brand Kits

### GET /api/brand-kits

- Auth: Required
- Response: `{ "ok": true, "data": [BrandKit, ...] }`
- Ownership: Private (user-scoped)

### POST /api/brand-kits

- Auth: Required
- Request: `{ "name": "string", "primaryColor": "string", "secondaryColor": "string", "fontFamily": "string", "logoDataUrl"?: "string", "tagline"?: "string" }`
- Response: `{ "ok": true, "data": BrandKit }` (201)
- Ownership: Private (user-scoped)

### GET /api/brand-kits/{id}

- Auth: Required
- Response: `{ "ok": true, "data": BrandKit }` or 404
- Ownership: Private (user-scoped)

### PUT /api/brand-kits/{id}

- Auth: Required
- Request: `{ "name"?: "string", "primaryColor"?: "string", "secondaryColor"?: "string", "fontFamily"?: "string", "logoDataUrl"?: "string|null", "tagline"?: "string|null" }`
- Response: `{ "ok": true, "data": BrandKit }`
- Ownership: Private (user-scoped)

### DELETE /api/brand-kits/{id}

- Auth: Required
- Response: `{ "ok": true }` or 404
- Ownership: Private (user-scoped)

## Pantry Staples

### GET /api/pantry-staples

- Auth: Required
- Response: `{ "ok": true, "data": [{ "id": "uuid", "userId": "uuid", "name": "string" }, ...] }`
- Ownership: Private (user-scoped)

### POST /api/pantry-staples

- Auth: Required
- Request: `{ "name": "string" }`
- Response: `{ "ok": true, "data": PantryStaple }` (201)
- Ownership: Private (user-scoped)
- Notes: Duplicates are ignored (case-insensitive)

### DELETE /api/pantry-staples

- Auth: Required
- Request: `{ "name": "string" }`
- Response: `{ "ok": true }`
- Ownership: Private (user-scoped)
- Notes: Removes by name (case-insensitive match)

## User Secrets

### GET /api/secrets

- Auth: Required
- Response: `{ "ok": true, "data": [{ "id": "uuid", "keyName": "string", "createdAt": "ISO8601", "updatedAt": "ISO8601" }, ...] }`
- Ownership: Private (user-scoped)
- Notes: List does NOT include secret values. Values only returned on individual GET.

### POST /api/secrets

- Auth: Required
- Request: `{ "keyName": "string", "value": "string" }`
- Response: `{ "ok": true, "data": { "id": "uuid", "keyName": "string", ... } }` (201)
- Ownership: Private (user-scoped, encrypted at rest with AES-256-GCM)
- Notes: Upserts by keyName. Value is encrypted before storage.

### GET /api/secrets/{id}

- Auth: Required
- Response: `{ "ok": true, "data": { "id": "uuid", "keyName": "string", "value": "decrypted plaintext" } }`
- Ownership: Private (user-scoped)
- Notes: Returns decrypted value. Only accessible by the secret owner.

### DELETE /api/secrets/{id}

- Auth: Required
- Response: `{ "ok": true }`
- Ownership: Private (user-scoped)

---

## Data Models

### User

```json
{
  "id": "uuid",
  "email": "string",
  "displayName": "string",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### Recipe

```json
{
  "id": "uuid",
  "userId": "uuid",
  "name": "string",
  "servings": "int",
  "servingName": "string",
  "instructions": "string | null",
  "leftoverStorage": "string | null",
  "ingredientGroups": "string (JSON)",
  "ingredients": ["Ingredient"],
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### Ingredient

```json
{
  "id": "uuid",
  "recipeId": "uuid",
  "fdcId": "int",
  "name": "string",
  "amount": "float",
  "unit": "string",
  "description": "string",
  "calories": "float",
  "totalFat": "float",
  "saturatedFat": "float",
  "transFat": "float",
  "cholesterol": "float",
  "sodium": "float",
  "totalCarbs": "float",
  "dietaryFiber": "float",
  "totalSugars": "float",
  "addedSugars": "float",
  "protein": "float",
  "vitaminD": "float",
  "calcium": "float",
  "iron": "float",
  "potassium": "float",
  "groupId": "string | null",
  "linkedRecipeId": "string | null",
  "prepInstructions": ["string"],
  "storageLocation": "string"
}
```

### RecipeBook

```json
{
  "id": "uuid",
  "userId": "uuid",
  "title": "string",
  "description": "string",
  "coverColor": "string",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### Chapter

```json
{
  "id": "uuid",
  "bookId": "uuid",
  "title": "string",
  "position": "int",
  "pageTemplateId": "string | null",
  "recipeTemplateId": "string | null",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### PersonProfile

```json
{
  "id": "uuid",
  "userId": "uuid",
  "name": "string",
  "sex": "string",
  "birthDate": "string | null",
  "heightCm": "float | null",
  "activityLevel": "string",
  "goalWeightKg": "float | null",
  "goalDate": "string | null",
  "bmrEquation": "string | null",
  "manualBmrValue": "float | null",
  "calorieTarget": "float | null",
  "proteinGoalG": "float | null",
  "carbsGoalG": "float | null",
  "fatGoalG": "float | null",
  "fiberGoalG": "float | null",
  "sodiumMaxMg": "float | null",
  "sugarMaxG": "float | null",
  "vitaminDGoalUg": "float | null",
  "calciumGoalMg": "float | null",
  "ironGoalMg": "float | null",
  "potassiumGoalMg": "float | null",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### FoodLogEntry

```json
{
  "id": "uuid",
  "userId": "uuid",
  "profileId": "uuid",
  "date": "YYYY-MM-DD",
  "time": "string | null",
  "mealSlot": "string",
  "sourceType": "string",
  "sourceId": "string | null",
  "name": "string",
  "servings": "float",
  "servingAmount": "float | null",
  "servingUnit": "string | null",
  "calories": "float",
  "...nutrient fields...": "float",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### WeightEntry

```json
{
  "id": "uuid",
  "userId": "uuid",
  "profileId": "uuid",
  "date": "YYYY-MM-DD",
  "weightKg": "float",
  "notes": "string | null",
  "bloodSugar": "float | null",
  "bloodPressureSystolic": "float | null",
  "bloodPressureDiastolic": "float | null",
  "measurementContext": "string | null",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### MealPlan

```json
{
  "id": "uuid",
  "userId": "uuid",
  "name": "string",
  "weekStart": "YYYY-MM-DD",
  "slotTimes": "string | null (JSON)",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### DayPlanEntry

```json
{
  "id": "uuid",
  "mealPlanId": "uuid",
  "date": "YYYY-MM-DD",
  "slot": "string",
  "recipeId": "string | null",
  "position": "int",
  "groupId": "string | null",
  "servings": "float",
  "isLeftover": "bool",
  "sourceType": "string",
  "foodName": "string | null",
  "calories": "float",
  "...nutrient fields...": "float",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### MealGroup

```json
{
  "id": "uuid",
  "mealPlanId": "uuid",
  "date": "YYYY-MM-DD",
  "slot": "string",
  "name": "string",
  "position": "int"
}
```

### CustomFood

```json
{
  "id": "uuid",
  "userId": "uuid",
  "name": "string",
  "calories": "float",
  "...nutrient fields...": "float",
  "sharedWithCommunity": "bool",
  "createdAt": "ISO8601"
}
```

### GroceryChecklist

```json
{
  "id": "uuid",
  "userId": "uuid",
  "weekStart": "YYYY-MM-DD",
  "checkedItems": "string (JSON)",
  "updatedAt": "ISO8601"
}
```

### Category

```json
{
  "id": "uuid",
  "name": "string",
  "parentId": "string | null",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### ApiKey

```json
{
  "id": "uuid",
  "userId": "uuid",
  "name": "string",
  "keyPrefix": "string",
  "permissions": "string (JSON)",
  "lastUsedAt": "ISO8601 | null",
  "createdAt": "ISO8601"
}
```

### SharedRecipe

```json
{
  "id": "uuid",
  "userId": "uuid",
  "recipeId": "uuid",
  "shareToken": "string",
  "isPublic": "bool",
  "title": "string",
  "description": "string",
  "category": "string",
  "tags": "string",
  "recipeData": "string (JSON)",
  "viewCount": "int",
  "importCount": "int",
  "averageRating": "float",
  "ratingCount": "int",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### ChapterRecipe

```json
{
  "id": "uuid",
  "chapterId": "uuid",
  "recipeId": "uuid",
  "position": "int"
}
```

### ChapterPage

```json
{
  "id": "uuid",
  "chapterId": "uuid",
  "title": "string",
  "content": "string",
  "position": "int",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### BookPage

```json
{
  "id": "uuid",
  "bookId": "uuid",
  "title": "string",
  "content": "string",
  "position": "int",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

---

## Change Control

This contract is a living document. Changes MUST be reflected here before implementation.
When implementation discovers that a contract entry is incorrect, update this file and notify the user.

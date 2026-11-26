# Go HTTP operations

See [connection and sessions](connection.md), [workflows and constraints](workflows.md), and [wire types](wire-types.md). This is the canonical path catalog: use the paths shown, including the trailing slash for the chapters collection. Explicit aliases are listed; incidental matches of loose path or method dispatch are not additional capabilities. `{...}` denotes a required URL path parameter. Opaque local IDs are strings unless noted. A dash means no query/body. A `!` marks a required query parameter. `page/perPage` are two optional integer parameters, default 1/20, with `perPage` capped at 100. Request bodies are JSON unless noted.

**Access**: `Public` = no credentials; `Optional` = valid Bearer adds privileges, invalid/absent is anonymous; `Session` = Bearer required (also subject to ownership); `Admin` = Bearer and server-confirmed administrator; `Origin` = configured Origin and POST; `Cookie` = configured Origin and CSRF header, see session protocol. Access labels do not substitute for row-level authorization. `Envelope<T>` means `{"ok":true,"data":...}`, `OK` means `{"ok":true}`, `Page<T>` means a bare `PaginatedResponse` containing a `T[]` in `data`. Other results are bare JSON unless wrapped. Shapes use JSON keys and Go type names. Statuses shown are success statuses unless the row expressly documents an unavailable operation. See [common and workflow-specific errors](connection.md#http-conventions).

The **Go handler** column names traceable symbols in the pinned backend. The repository/commit and lookup instructions are in [Start here](README.md); named DTOs link by name to the bundled wire type reference, not to frontend types.

## Service and sessions

| Method | Path | Access | Query | Body | Result | Go handler | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/health` | Public | — | — | `200 {ok:bool, service:string, version:string}` | `health` | Liveness, not a live PostgreSQL readiness probe. |
| GET | `/api/about` | Public | — | — | `200 {name:string, version:string, description:string}` | `about` | Version may be `dev` for source builds; not API negotiation. |
| POST | `/api/auth/register` | Origin | — | `RegisterRequest` | `201 AuthResponse` + Set-Cookie | `registerHandler` | First account requires `setupClaim` and becomes admin; later registration is gated. |
| POST | `/api/auth/login` | Origin | — | `LoginRequest` | `200 AuthResponse` + Set-Cookie | `loginHandler` | Bad credentials: 401. |
| POST | `/api/auth/refresh` | Cookie | — | — | `200 AuthResponse` + Set-Cookie | `refreshHandler` | Rotates cookie; invalid/missing session: 401. No JSON refresh token. |
| POST | `/api/auth/logout` | Cookie | — | — | `200 OK` + clearing Set-Cookie | `logoutHandler` | Revokes the cookie session; missing cookie succeeds but does not revoke a session. |

## Instance and account

| Method | Path | Access | Query | Body | Result | Go handler | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/instance/state` | Public | — | — | `200 Envelope<InstanceState>` | `instanceStateHandler` | Use `hasUsers` and `registrationEnabled` to choose admission flow. |
| POST | `/api/instance/onboarding/complete` | Admin | — | — | `200 Envelope<InstanceState>` | `completeOnboardingHandler` | Marks onboarding version 1 complete. |
| PUT, PATCH | `/api/instance/registration` | Admin | — | `UpdateRegistrationRequest` | `200 Envelope<InstanceState>` | `registrationHandler` | Send explicit `registrationEnabled` boolean; omission decodes false. |
| GET | `/api/instance/users` | Admin | — | — | `200 Envelope<UserListEntry[]>` | `listUsersHandler` | Instance-wide membership, including admin status. |
| POST | `/api/instance/reset-user-data` | Admin | — | `resetRequest` | `200 OK` | `resetUserDataHandler` | Destructive: resets custom content across the instance; retains accounts, sessions, settings and USDA data. |
| POST | `/api/instance/factory-reset` | Admin | — | `resetRequest` | `200 OK` | `factoryResetHandler` | Destructive: also removes accounts/sessions and resets onboarding; retains standard foods and used claim receipts. |
| POST | `/api/account/delete-data` | Session | — | `resetRequest` | `200 OK` | `deleteDataHandler` | Destructive: caller's content only; not account deletion. |
| POST | `/api/account/delete` | Session | — | `{password:string, newAdminUserId?:string}` | `200 OK` | `deleteAccountHandler` | Destructive: deletes caller; if required, supply another existing user as admin successor. Last-admin error: 400. |
| GET | `/api/keys` | Session | — | — | `200 Envelope<ApiKey[]>` | `apiKeysRouter` | Legacy metadata only, not credentials. |
| POST | `/api/keys` | Session | — | — | `410 error` | `apiKeysRouter` | Issuance intentionally disabled. Never use a legacy API key to authenticate. |
| DELETE | `/api/keys/{keyId}` | Session | — | — | `200 OK` | `apiKeyItemRouter` | Revokes caller's legacy key. |

## Recipes, ingredients and categorization

| Method | Path | Access | Query | Body | Result | Go handler | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/recipes` | Session | `page/perPage` | — | `200 Page<Recipe>` | `listRecipes` | Caller-owned. |
| POST | `/api/recipes` | Session | — | `CreateRecipeRequest` | `201 Envelope<Recipe>` | `createRecipe` | Name and integer servings 1–10,000; optional `requestKey` for duplicate-safe retry. |
| GET | `/api/recipes/{recipeId}` | Session | — | — | `200 Envelope<Recipe>` | `getRecipe` | Caller-owned; 404 for missing/foreign. |
| PUT | `/api/recipes/{recipeId}` | Session | — | `UpdateRecipeRequest` | `200 Envelope<Recipe>` | `updateRecipe` | Patch-like; present ingredient array replaces all ingredients; no portable ID writes. |
| DELETE | `/api/recipes/{recipeId}` | Session | — | — | `200 OK` | `deleteRecipe` | Destructive; invalidate affected book/category/plan reads. |
| GET | `/api/recipes/{recipeId}/ingredients` | Session | — | — | `200 Envelope<Ingredient[]>` | `ingredientRouter` | May be null for no ingredients; list in position order. |
| POST | `/api/recipes/{recipeId}/ingredients` | Session | — | `CreateIngredientReq` | `201 Envelope<Ingredient>` | `ingredientRouter` | Adds one ingredient at end. |
| PUT | `/api/recipes/{recipeId}/ingredients/{ingredientId}` | Session | — | `CreateIngredientReq` | `200 Envelope<Ingredient>` | `ingredientRouter` | Submit full editable ingredient snapshot, not a patch. |
| DELETE | `/api/recipes/{recipeId}/ingredients/{ingredientId}` | Session | — | — | `200 OK` | `ingredientRouter` | Parent and ingredient must match. |
| GET | `/api/recipes/{recipeId}/categories` | Session | — | — | `200 Envelope<RecipeCategory[]>` | `recipeCategoriesRouter` | Returns joins, not category objects. |
| POST | `/api/recipes/{recipeId}/categories` | Session | — | `{categoryId:string}` | `201 Envelope<RecipeCategory>` | `recipeCategoriesRouter` | Attach existing taxonomy node. |
| DELETE | `/api/recipes/{recipeId}/categories` | Session | `categoryId!` | — | `200 OK` | `recipeCategoriesRouter` | Detach, not taxonomy deletion. |
| GET | `/api/recipes/completions` | Session | — | — | `200 Envelope<RecipeCompletion[]>` | `recipeCompletionsRouter` | Per-user latest cooked date per recipe; not an event history. |
| PUT, POST | `/api/recipes/completions/{recipeId}` | Session | — | `{date:string}` | `200 OK` | `recipeCompletionsRouter` | Upsert; real `YYYY-MM-DD` required. |
| DELETE | `/api/recipes/completions/{recipeId}` | Session | — | — | `200 OK` | `recipeCompletionsRouter` | Clears the caller's completion. |
| GET | `/api/categories` | Session | — | — | `200 Envelope<Category[]>` | `categoriesRouter` | Global taxonomy. |
| POST | `/api/categories` | Admin | — | `CreateCategoryRequest` | `201 Envelope<Category>` | `categoriesRouter` | Global taxonomy mutation. |
| PUT | `/api/categories/{categoryId}` | Admin | — | `CreateCategoryRequest` | `200 Envelope<Category>` | `categoryItemRouter` | Submit name and parent (null for root); cycles rejected. |
| DELETE | `/api/categories/{categoryId}` | Admin | — | — | `200 OK` | `categoryItemRouter` | Global taxonomy mutation. |
| GET | `/api/categories/{categoryId}/descendants` | Session | — | — | `200 Envelope<string[]>` | `categoryDescendants` | Includes the requested ID itself; not an existence probe. |
| GET | `/api/categories/{categoryId}/recipes` | Session | — | — | `200 Envelope<RecipeCategory[]>` | `categoryRecipes` | Caller-owned recipe joins only. |

## Foods and food catalog administration

| Method | Path | Access | Query | Body | Result | Go handler | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/foods/search` | Session | `q, query, page/perPage` | — | `200 FoodSearchResult` | `foodSearchHandler` | `query` is a fallback when `q` is empty. |
| GET | `/api/foods` | Session | `q, query, page/perPage` | — | `200 FoodSearchResult` | `foodSearchHandler` | Alias of `/api/foods/search`. |
| GET | `/api/foods/{fdcId}` | Session | — | — | `200 Envelope<FoodItem>` | `foodItemHandler` | Use positive integer FDC ID, not `FoodItem.id`; unavailable/non-meaningful: 404. |
| GET | `/api/foods/upc/{gtinUpc}` | Session | — | — | `200 Envelope<FoodItem>` | `foodItemHandler` | Treat barcode as string; preserve leading zeroes. |
| GET | `/api/foods/stats` | Session | — | — | `200 FoodStats` | `foodStatsHandler` | Shared catalog counts. |
| GET | `/api/foods/seed` | Admin | — | — | `200 Envelope<datasetStatus[]>` | `listSeedJobsHandler` | Dataset status summary, not a job history. |
| POST | `/api/foods/seed` | Admin | — | `{dataType?:string, dataset?:string}` | `200 Envelope<{jobId:int}>` | `startSeedJobHandler` | Queue predefined dataset; `dataset` is fallback for `dataType`. Poll the job ID. |
| GET | `/api/foods/seed/{jobId}` | Admin | — | — | `200 Envelope<SeedJob>` | `getSeedJobHandler` | Integer job ID. |
| POST | `/api/foods/seed/upload` | Admin | — | multipart `file` (JSON `FoodItem[]`), optional `dataType` string | `200 Envelope<{jobId:int, inserted:int}>` | `foodSeedUploadHandler` | Shared catalog ingestion; runs in request, not whole-dataset atomic. |
| POST | `/api/foods/cache` | Admin | — | `{foods:FoodItem[]}` | `200 Envelope<{cached:int}>` | `cacheFoodsHandler` | Meaningful rows only; modifies shared catalog. |
| DELETE | `/api/foods/cache` | Admin | — | — | `200 Envelope<{message:string}>` | `clearFoodCacheHandler` | Destructive: clears shared food catalog. |
| GET | `/api/custom-foods` | Session | — | — | `200 Envelope<CustomFood[]>` | `customFoodsRouter` | Caller-owned. No item GET. |
| POST | `/api/custom-foods` | Session | — | `CreateCustomFoodRequest` | `201 Envelope<CustomFood>` | `customFoodsRouter` | Name required; omit `portableId`. |
| PUT | `/api/custom-foods/{foodId}` | Session | — | `CreateCustomFoodRequest` | `200 Envelope<CustomFood>` | `customFoodItemRouter` | Full write; `portableId` is immutable. |
| DELETE | `/api/custom-foods/{foodId}` | Session | — | — | `200 OK` | `customFoodItemRouter` | Caller-owned deletion. |
| POST | `/api/custom-foods/{foodId}/share` | Session | — | — | `404 error` | `customFoodItemRouter` | Intended share action passes `foodId/share` to the store instead of `foodId`; no supported workaround on this revision. |
| GET | `/api/custom-foods/community` | Session | `page/perPage` | — | `200 Page<CustomFood>` | `communityCustomFoodsRouter` | Shared custom foods, not anonymous. |
| GET | `/api/food-storage-defaults` | Session | — | — | `200 Envelope<FoodStorageDefault[]>` | `foodStorageDefaultsRouter` | Per caller and source identity. |
| PUT | `/api/food-storage-defaults/{sourceType}/{sourceKey}` | Session | — | `{location:string}` | `200 Envelope<FoodStorageDefault>` | `foodStorageDefaultItemRouter` | `usda` + canonical positive decimal FDC ID or `custom_food` + accessible local ID. |

## Person profiles, food logs and measurements

| Method | Path | Access | Query | Body | Result | Go handler | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/profiles` | Session | — | — | `200 Envelope<PersonProfile[]>` | `profilesRouter` | Caller-owned profiles, not login users or dietary profiles. |
| POST | `/api/profiles` | Session | — | `CreateProfileRequest` | `201 Envelope<PersonProfile>` | `profilesRouter` | Name and sex required. |
| GET | `/api/profiles/{profileId}` | Session | — | — | `200 Envelope<PersonProfile>` | `profileItemRouter` | Caller-owned. |
| PUT | `/api/profiles/{profileId}` | Session | — | `CreateProfileRequest` | `200 Envelope<PersonProfile>` | `profileItemRouter` | Full profile write; submit unchanged values to preserve them. |
| DELETE | `/api/profiles/{profileId}` | Session | — | — | `200 OK` | `profileItemRouter` | Destructive: dependent log/measurements can be removed. |
| GET | `/api/profiles/{profileId}/log` | Session | `date, startDate, endDate` | — | `200 Envelope<FoodLogEntry[]>` | `foodLogRouter` | Inclusive range wins when both bounds supplied; otherwise exact `date`, or all. |
| POST | `/api/profiles/{profileId}/log` | Session | — | `CreateFoodLogRequest` | `201 Envelope<FoodLogEntry>` | `foodLogRouter` | Path profile is authoritative. Name, date, slot, source and positive servings. |
| PUT | `/api/profiles/{profileId}/log/{entryId}` | Session | — | `CreateFoodLogRequest` | `200 Envelope<FoodLogEntry>` | `foodLogEntryRouter` | Full snapshot; response has empty owner/profile and zero timestamps; re-read for canonical metadata. |
| DELETE | `/api/profiles/{profileId}/log/{entryId}` | Session | — | — | `200 OK` | `foodLogEntryRouter` | Parent/entry scope verified together. |
| GET | `/api/profiles/{profileId}/weight` | Session | `from, to` | — | `200 Envelope<WeightEntry[]>` | `weightRouter` | Inclusive bounds, independently optional; sorted by date ascending. |
| POST | `/api/profiles/{profileId}/weight` | Session | — | `CreateWeightEntryRequest` | `201 Envelope<WeightEntry>` | `weightRouter` | Date required; optional vitals; weight zero means no weight measurement. |
| PUT | `/api/profiles/{profileId}/weight/{entryId}` | Session | — | `CreateWeightEntryRequest` | `200 Envelope<WeightEntry>` | `weightEntryRouter` | Full measurement write, including unchanged values. |
| DELETE | `/api/profiles/{profileId}/weight/{entryId}` | Session | — | — | `200 OK` | `weightEntryRouter` | Parent/entry scope verified together. |

## Meal planning and grocery state

| Method | Path | Access | Query | Body | Result | Go handler | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/meal-plans` | Session | — | — | `200 Envelope<MealPlan[]>` | `mealPlansRouter` | Caller-owned plans. |
| POST | `/api/meal-plans` | Session | — | `CreateMealPlanRequest` | `201 Envelope<MealPlan>` | `mealPlansRouter` | Supply date `weekStart` and name; `slotTimes` is raw JSON. |
| GET | `/api/meal-plans/week/{weekStart}` | Session | — | — | `200 Envelope<MealPlan>` | `mealPlanItemRouter` | `YYYY-MM-DD`; no plan: 404. |
| GET | `/api/meal-plans/{planId}` | Session | — | — | `200 Envelope<MealPlan>` | `mealPlanItemRouter` | Returns plan metadata; entries/groups are separate. |
| PUT | `/api/meal-plans/{planId}` | Session | — | `CreateMealPlanRequest` | `200 Envelope<MealPlan>` | `mealPlanItemRouter` | Omitted fields preserve existing values; `weekStart` is not updated by this route. |
| DELETE | `/api/meal-plans/{planId}` | Session | — | — | `200 OK` | `mealPlanItemRouter` | Destructive. |
| GET | `/api/meal-plans/{planId}/entries` | Session | — | — | `200 Envelope<DayPlanEntry[]>` | `dayPlanEntriesRouter` | Includes recipe and non-recipe entries. |
| POST | `/api/meal-plans/{planId}/entries` | Session | — | `CreateDayPlanEntryRequest` | `201 Envelope<DayPlanEntry>` | `dayPlanEntriesRouter` | Supply date, slot, positive servings and applicable source/link fields. |
| PUT | `/api/meal-plans/{planId}/entries/{entryId}` | Session | — | `CreateDayPlanEntryRequest` | `200 Envelope<DayPlanEntry>` | `dayPlanEntryItemRouter` | Omitted fields preserve existing values; verifies parent. |
| DELETE | `/api/meal-plans/{planId}/entries/{entryId}` | Session | — | — | `200 OK` | `dayPlanEntryItemRouter` | Verifies parent. |
| PUT | `/api/entries/{entryId}` | Session | — | `CreateDayPlanEntryRequest` | `200 Envelope<DayPlanEntry>` | `dayPlanEntryItemRouter` | Flat alias; resolves owner via actual plan. Prefer nested for explicit parent. |
| DELETE | `/api/entries/{entryId}` | Session | — | — | `200 OK` | `dayPlanEntryItemRouter` | Flat alias. |
| GET | `/api/meal-plans/{planId}/groups` | Session | — | — | `200 Envelope<MealGroup[]>` | `mealGroupsRouter` | Caller-owned plan groups. |
| POST | `/api/meal-plans/{planId}/groups` | Session | — | `{name:string, date:string, slot:string, position:int}` | `201 Envelope<MealGroup>` | `mealGroupsRouter` | No separate group update route. |
| DELETE | `/api/meal-plans/{planId}/groups` | Session | `id!` | — | `200 OK` | `mealGroupsRouter` | `id` is group ID, not plan ID. |
| GET | `/api/grocery` | Session | `weekStart!` | — | `200 Envelope<GroceryChecklist>` or `OK` | `groceryRouter` | No `data` if no checklist; this is not a generated grocery list. |
| PUT, POST | `/api/grocery` | Session | `weekStart` | `{weekStart:string, checkedItems:string}` | `200 Envelope<GroceryChecklist>` | `groceryRouter` | Upsert whole checked-items state per caller/week; query only if body omits week. |
| GET | `/api/pantry-staples` | Session | — | — | `200 Envelope<PantryStaple[]>` | `pantryStaplesRouter` | Lists global and caller staples. |
| POST | `/api/pantry-staples` | Session | — | `CreatePantryStapleRequest` | `201 Envelope<PantryStaple>` | `pantryStaplesRouter` | Add a personal staple by name. |
| DELETE | `/api/pantry-staples` | Session | — | `CreatePantryStapleRequest` | `200 OK` | `pantryStaplesRouter` | JSON body required even for DELETE; removes personal name only. |

## Books, chapter content and ordering

| Method | Path | Access | Query | Body | Result | Go handler | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/books` | Session | — | — | `200 Envelope<RecipeBook[]>` | `booksRouter` | Caller-owned books. |
| POST | `/api/books` | Session | — | `CreateBookRequest` | `201 Envelope<RecipeBook>` | `booksRouter` | Title required; descriptions/cover metadata are not rendered by Go. |
| GET | `/api/books/{bookId}` | Session | — | — | `200 Envelope<RecipeBook>` | `bookItemRouter` | Metadata only; fetch children separately. |
| PUT | `/api/books/{bookId}` | Session | — | `CreateBookRequest` | `200 Envelope<RecipeBook>` | `bookItemRouter` | Full metadata write. |
| DELETE | `/api/books/{bookId}` | Session | — | — | `200 OK` | `bookItemRouter` | Removes book structure rather than the recipe library. |
| GET | `/api/books/{bookId}/chapters/` | Session | — | — | `200 Envelope<Chapter[]>` | `chaptersRouter` | Trailing slash required by Go path split. |
| POST | `/api/books/{bookId}/chapters/` | Session | — | `CreateChapterRequest` | `201 Envelope<Chapter>` | `chaptersRouter` | Trailing slash required. |
| PUT | `/api/chapters/{chapterId}` | Session | — | `CreateChapterRequest` | `200 Envelope<Chapter>` | `chapterItemRouter` | Full metadata write. |
| PUT | `/api/books/{bookId}/chapters/{chapterId}` | Session | — | `CreateChapterRequest` | `200 Envelope<Chapter>` | `chapterItemRouter` | Nested equivalent checks expected book. |
| DELETE | `/api/chapters/{chapterId}` | Session | — | — | `200 OK` | `chapterItemRouter` | Removes chapter content/placements. |
| DELETE | `/api/books/{bookId}/chapters/{chapterId}` | Session | — | — | `200 OK` | `chapterItemRouter` | Nested equivalent checks expected book. |
| GET | `/api/chapters/{chapterId}/recipes` | Session | — | — | `200 Envelope<ChapterRecipe[]>` | `chapterRecipesRouter` | Joins, not hydrated recipes. |
| GET | `/api/books/{bookId}/chapters/{chapterId}/recipes` | Session | — | — | `200 Envelope<ChapterRecipe[]>` | `chapterRecipesRouter` | Nested equivalent checks expected book. |
| POST | `/api/chapters/{chapterId}/recipes` | Session | — | `{recipeId:string, position:int}` | `201 Envelope<ChapterRecipe>` | `chapterRecipesRouter` | Use caller-owned library recipe ID. |
| POST | `/api/books/{bookId}/chapters/{chapterId}/recipes` | Session | — | `{recipeId:string, position:int}` | `201 Envelope<ChapterRecipe>` | `chapterRecipesRouter` | Nested equivalent checks expected book. |
| DELETE | `/api/chapters/{chapterId}/recipes` | Session | `recipeId!` | — | `200 OK` | `chapterRecipesRouter` | Detach by recipe ID, not join ID. |
| DELETE | `/api/chapters/{chapterId}/recipes/{recipeId}` | Session | — | — | `200 OK` | `chapterRecipesRouter` | Path-ID alternative to query. |
| DELETE | `/api/books/{bookId}/chapters/{chapterId}/recipes` | Session | `recipeId!` | — | `200 OK` | `chapterRecipesRouter` | Nested equivalent checks expected book. |
| DELETE | `/api/books/{bookId}/chapters/{chapterId}/recipes/{recipeId}` | Session | — | — | `200 OK` | `chapterRecipesRouter` | Nested path-ID alternative. |
| GET | `/api/chapters/{chapterId}/pages` | Session | — | — | `200 Envelope<ChapterPage[]>` | `chapterPagesRouter` | Chapter pages only. |
| GET | `/api/books/{bookId}/chapters/{chapterId}/pages` | Session | — | — | `200 Envelope<ChapterPage[]>` | `chapterPagesRouter` | Nested equivalent checks expected book. |
| POST | `/api/chapters/{chapterId}/pages` | Session | — | `{title:string, content:string, position:int}` | `201 Envelope<ChapterPage>` | `chapterPagesRouter` | Creates a chapter page, not a book-level page. |
| POST | `/api/books/{bookId}/chapters/{chapterId}/pages` | Session | — | `{title:string, content:string, position:int}` | `201 Envelope<ChapterPage>` | `chapterPagesRouter` | Nested equivalent checks expected book. |
| PUT | `/api/pages/{pageId}` | Session | — | `{title:string, content:string, position:int}` | `200 Envelope<ChapterPage>` | `chapterPageItemRouter` | Full chapter page write. |
| PUT | `/api/chapters/{chapterId}/pages/{pageId}` | Session | — | `{title:string, content:string, position:int}` | `200 Envelope<ChapterPage>` | `chapterPageItemRouter` | Nested equivalent checks expected chapter. |
| PUT | `/api/books/{bookId}/chapters/{chapterId}/pages/{pageId}` | Session | — | `{title:string, content:string, position:int}` | `200 Envelope<ChapterPage>` | `chapterPageItemRouter` | Fully nested equivalent. |
| DELETE | `/api/pages/{pageId}` | Session | — | — | `200 OK` | `chapterPageItemRouter` | Deletes chapter page. |
| DELETE | `/api/chapters/{chapterId}/pages/{pageId}` | Session | — | — | `200 OK` | `chapterPageItemRouter` | Nested equivalent checks expected chapter. |
| DELETE | `/api/books/{bookId}/chapters/{chapterId}/pages/{pageId}` | Session | — | — | `200 OK` | `chapterPageItemRouter` | Fully nested equivalent. |
| GET | `/api/books/{bookId}/pages` | Session | — | — | `200 Envelope<BookPage[]>` | `bookPagesRouter` | Standalone book pages, not chapter pages. |
| POST | `/api/books/{bookId}/pages` | Session | — | `{title:string, content:string, position:int}` | `201 Envelope<BookPage>` | `bookPagesRouter` | Create standalone page. |
| PUT | `/api/book-pages/{pageId}` | Session | — | `{title:string, content:string, position:int}` | `200 Envelope<BookPage>` | `bookPageRoutes` | Full standalone page write. |
| DELETE | `/api/book-pages/{pageId}` | Session | — | — | `200 OK` | `bookPageRoutes` | Deletes standalone page. |
| PUT | `/api/books/{bookId}/items/reorder` | Session | — | `{items:BookLevelItem[]}` | `200 OK` | `bookItemsReorderHandler` | Full mixed chapter/book-page order. |
| PUT | `/api/chapters/{chapterId}/items/reorder` | Session | — | `{items:ChapterItem[]}` | `200 OK` | `chapterItemsReorderHandler` | Full mixed recipe/page order. |
| POST | `/api/chapter-recipes/{chapterRecipeId}/move` | Session | — | `{targetChapterId:string, position:int}` | `200 OK` | `moveChapterRecipeHandler` | Source is chapter-recipe **join** ID, not recipe ID. |
| POST | `/api/pages/{pageId}/move` | Session | — | `{targetChapterId:string, position:int}` | `200 OK` | `movePageBetweenChaptersHandler` | Move chapter page to owned target chapter. |
| POST | `/api/pages/{pageId}/to-book` | Session | — | `{bookId:string, position:int}` | `200 Envelope<BookPage>` | `convertPageToBookHandler` | Chapter page becomes standalone. Use the returned ID. |
| POST | `/api/pages/{pageId}/to-chapter` | Session | — | `{chapterId:string, position:int}` | `200 Envelope<ChapterPage>` | `convertPageToChapterHandler` | Here source is a **book page** ID. Use the returned ID. |

## Recipe transfer and quarantine

| Method | Path | Access | Query | Body | Result | Go handler | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/recipe-bundles/candidates` | Session | — | — | `200 Envelope<ExportCandidate[]>` | `recipeBundleCandidatesHandler` | Authorized recipe, book, profile and meal-plan selections. |
| POST | `/api/recipe-bundles/export` | Session | — | `recipeBundleExportRequest` | `200 Envelope<RecipeBundle>` | `recipeBundleExportHandler` | Selected export; private unauthorized selections/dependencies: 403. |
| POST | `/api/recipe-bundles/owner-backup` | Session | — | — | `200 Envelope<RecipeBundle>` | `recipeBundleOwnerBackupHandler` | Owner recipe/book snapshot, including eligible pending import context; not full account backup. |
| POST | `/api/recipe-bundles/import` | Session | — | `RecipeBundle` or `{bundle:RecipeBundle, bookDecisions:BookImportDecision[]}` | `200 Envelope<RecipeBundleImportSummary>` | `recipeBundleImportHandler` | Summary can indicate decisions or quarantine, not publication. Stale/identity conflicts: 409. |
| GET | `/api/recipe-imports` | Session | — | — | `200 Envelope<QuarantinedRecipe[]>` | `recipeImportsRouter` | Staged recipe and decision-only records, not main-library objects. |
| POST | `/api/recipe-imports/{batchId}/decision` | Session | — | `{action:string}` | `200 Envelope<RecipeBundleImportSummary>` | `recipeImportsRouter` | `keep` or `cancel`; accepted batches cannot be cancelled (409). |
| PUT | `/api/recipe-imports/{stagedRecipeId}/ingredients/{ingredientId}` | Session | — | `CreateIngredientReq` | `200 Envelope<RecipeBundleImportSummary>` | `recipeImportsRouter` | Owner-only repair; reserved `new` supports adding the first ingredient. |

## Sharing and discovery

| Method | Path | Access | Query | Body | Result | Go handler | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/share` | Session | — | — | `200 SharedRecipe[]` | `listShares` | Bare array of own shares. |
| POST | `/api/share` | Session | — | `ShareRecipeRequest` | `201 SharedRecipe` | `createShare` | Owned canonical `recipeId`, `title`, `recipeData` required. Defaults to private. |
| GET | `/api/share/{shareToken}` | Optional | — | — | `200 SharedRecipe` | `getShareByToken` | Token (not row ID); visibility and canonical owner verified. |
| PUT | `/api/share/{shareId}` | Session | — | `{visibility:string}` | `200 OK` | `updateShare` | Share row ID (not token); explicit private/users/public. |
| DELETE | `/api/share/{shareId}` | Session | — | — | `200 OK` | `deleteShare` | Revokes to private; does not delete share row or source recipe. |
| GET | `/api/community` | Optional | `q, category, sort, page/perPage` | — | `200 SharedRecipe[]` | `communitySearch` | Public (plus users-tier with valid Bearer); no total; results omit actual recipe payload (empty `recipeData`). |
| GET | `/api/community/categories` | Public | — | — | `200 CommunityCategory[]` | `communityCategories` | Discovery categories; separate from admin taxonomy. |

## Settings, location and provider secrets

| Method | Path | Access | Query | Body | Result | Go handler | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/settings` | Session | — | — | `200 Envelope<UserSettings>` or `Envelope<{settings:{}}>` | `settingsRouter` | No row: empty object field instead of usual JSON string. |
| PUT | `/api/settings` | Session | — | `UpdateSettingsRequest` | `200 Envelope<UserSettings>` | `settingsRouter` | JSON string containing a top-level object; server merges keys atomically, not a deep merge. |
| GET | `/api/settings/location` | Session | — | — | `200 Envelope<UserLocation>` or `OK` | `locationRouter` | No `data` if unset. |
| PUT | `/api/settings/location` | Session | — | `UpdateLocationRequest` | `200 Envelope<UserLocation>` | `locationRouter` | Country and region required. |
| GET | `/api/settings/seasonal-foods` | Public | `country!, region!, month!` | — | `200 Envelope<string[]>` | `seasonalFoodsRouter` | Integer month 1–12; no matching row returns an empty array. |
| GET | `/api/secrets` | Session | — | — | `200 Envelope<UserSecret[]>` | `secretsRouter` | Caller metadata only, no secret values. |
| POST | `/api/secrets` | Session | — | `CreateSecretRequest` | `201 Envelope<UserSecret>` | `secretsRouter` | Nonempty `keyName` and `value`; encrypted server-side, upsert by key name. |
| GET | `/api/secrets/{secretId}` | Session | — | — | `200 Envelope<{id:string, keyName:string, value:string}>` | `secretItemRouter` | Decrypted value; do not log or cache. |
| DELETE | `/api/secrets/{secretId}` | Session | — | — | `200 OK` | `secretItemRouter` | Caller-scoped; 200 does not prove the row previously existed. |

## Templates, branding and dietary rules

| Method | Path | Access | Query | Body | Result | Go handler | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/templates` | Session | `type` | — | `200 Envelope<Template[]>` | `templatesRouter` | Own plus global defaults. |
| POST | `/api/templates` | Session | — | `CreateTemplateRequest` | `201 Envelope<Template>` | `templatesRouter` | Name/type required; only admin may publish `isDefault:true`. |
| GET | `/api/templates/{templateId}` | Session | — | — | `200 Envelope<Template>` | `templateItemRouter` | Own or global default. |
| PUT | `/api/templates/{templateId}` | Session | — | `UpdateTemplateRequest` | `200 Envelope<Template>` | `templateItemRouter` | Partial; default mutation/publication requires admin. |
| DELETE | `/api/templates/{templateId}` | Session | — | — | `200 OK` | `templateItemRouter` | Default deletion requires admin. |
| GET | `/api/brand-kits` | Session | — | — | `200 Envelope<BrandKit[]>` | `brandKitsRouter` | Caller-owned. |
| POST | `/api/brand-kits` | Session | — | `CreateBrandKitRequest` | `201 Envelope<BrandKit>` | `brandKitsRouter` | Name required; stored metadata only. |
| GET | `/api/brand-kits/{brandKitId}` | Session | — | — | `200 Envelope<BrandKit>` | `brandKitItemRouter` | Caller-owned. |
| PUT | `/api/brand-kits/{brandKitId}` | Session | — | `UpdateBrandKitRequest` | `200 Envelope<BrandKit>` | `brandKitItemRouter` | Partial; null/omitted logo or tagline preserves it. Missing/foreign update currently surfaces as 500. |
| DELETE | `/api/brand-kits/{brandKitId}` | Session | — | — | `200 OK` | `brandKitItemRouter` | Caller-owned. |
| GET | `/api/dietary-profiles` | Session | — | — | `200 Envelope<DietaryProfile[]>` | `dietaryProfilesRouter` | Caller-owned criteria, not nutrition/person profiles. |
| POST | `/api/dietary-profiles` | Session | — | `CreateDietaryProfileRequest` | `201 Envelope<DietaryProfile>` | `dietaryProfilesRouter` | Name required; string-encoded arrays default to `[]`. |
| GET | `/api/dietary-profiles/{dietaryProfileId}` | Session | — | — | `200 Envelope<DietaryProfile>` | `dietaryProfileItemRouter` | Caller-owned. |
| PUT | `/api/dietary-profiles/{dietaryProfileId}` | Session | — | `UpdateDietaryProfileRequest` | `200 Envelope<DietaryProfile>` | `dietaryProfileItemRouter` | Partial; validate changed enum arrays and thresholds. |
| DELETE | `/api/dietary-profiles/{dietaryProfileId}` | Session | — | — | `200 OK` | `dietaryProfileItemRouter` | Caller-owned; does not silently recreate starter. |
| GET | `/api/dietary-profiles/{dietaryProfileId}/recipe-assessments` | Session | — | — | `200 Envelope<RecipeAssessment[]>` | `recipeAssessmentsRouter` | Uses stored recipe nutrition; does not certify allergen or dietary safety. |
| POST | `/api/dietary-profiles/diabetes-aware-starter` | Session | — | — | `200 Envelope<DietaryProfile>` | `restoreDiabetesAwareProfileHandler` | Reuses eligible profile or creates inactive starter; explicit user action. |
| GET | `/api/dietary-profiles/{dietaryProfileId}/allergen-rules` | Session | — | — | `200 Envelope<AllergenRule[]>` | `allergenRulesRouter` | Lists stored rules, not evaluation results. |
| POST | `/api/dietary-profiles/{dietaryProfileId}/allergen-rules` | Session | — | `CreateAllergenRuleRequest` | `201 Envelope<AllergenRule>` | `allergenRulesRouter` | Allergen required; parent must be owned. |
| PUT | `/api/dietary-profiles/{dietaryProfileId}/allergen-rules/{ruleId}` | Session | — | `UpdateAllergenRuleRequest` | `200 Envelope<AllergenRule>` | `allergenRuleItemRouter` | Partial; parent and owner checked. |
| DELETE | `/api/dietary-profiles/{dietaryProfileId}/allergen-rules/{ruleId}` | Session | — | — | `200 OK` | `allergenRuleItemRouter` | Parent and owner checked. |
| PUT | `/api/allergen-rules/{ruleId}` | Session | — | `UpdateAllergenRuleRequest` | `200 Envelope<AllergenRule>` | `allergenRuleItemRouter` | Flat alias; checks actual owning profile. |
| DELETE | `/api/allergen-rules/{ruleId}` | Session | — | — | `200 OK` | `allergenRuleItemRouter` | Flat alias. |

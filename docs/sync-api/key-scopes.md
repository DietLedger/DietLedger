# Exact personal-key scopes

Generated from the approved scoped personal-key spec. Use with [personal keys](personal-keys.md) and [wire operations](operations.md). No unlisted method, path or administrator operation is granted.

| Scope | Methods | Exact paths |
| --- | --- | --- |
| Valid personal key | GET | `/api/auth/key` |
| `profiles:read` | GET | `/api/profiles`, `/api/profiles/{profileId}` |
| `profiles:write` | POST | `/api/profiles` |
| `profiles:write` | PUT, DELETE | `/api/profiles/{profileId}` |
| `diary:read` | GET | `/api/profiles/{profileId}/log` |
| `diary:write` | POST | `/api/profiles/{profileId}/log` |
| `diary:write` | PUT, DELETE | `/api/profiles/{profileId}/log/{entryId}` |
| `weight:read` | GET | `/api/profiles/{profileId}/weight` |
| `weight:write` | POST | `/api/profiles/{profileId}/weight` |
| `weight:write` | PUT, DELETE | `/api/profiles/{profileId}/weight/{entryId}` |
| `catalog:read` | GET | `/api/foods/search`, `/api/foods`, `/api/foods/{fdcId}`, `/api/foods/upc/{gtinUpc}`, `/api/foods/stats`, `/api/settings/seasonal-foods` |
| `catalog:live` plus `catalog:read` | GET | `/api/foods/search`, `/api/foods` (optional live fallback only) |
| `custom-foods:read` | GET | `/api/custom-foods`, `/api/food-storage-defaults` |
| `custom-foods:write` | POST | `/api/custom-foods` |
| `custom-foods:write` | PUT, DELETE | `/api/custom-foods/{foodId}` |
| `custom-foods:write` | PUT | `/api/food-storage-defaults/{sourceType}/{sourceKey}` |
| `meal-plans:read` | GET | `/api/meal-plans`, `/api/meal-plans/week/{weekStart}`, `/api/meal-plans/{planId}`, `/api/meal-plans/{planId}/entries`, `/api/meal-plans/{planId}/groups`, `/api/grocery`, `/api/pantry-staples` |
| `meal-plans:write` | POST | `/api/meal-plans`, `/api/meal-plans/{planId}/entries` |
| `meal-plans:write` | PUT, DELETE | `/api/meal-plans/{planId}`, `/api/meal-plans/{planId}/entries/{entryId}`, `/api/entries/{entryId}` |
| `meal-plans:write` | POST, DELETE | `/api/meal-plans/{planId}/groups`, `/api/pantry-staples` |
| `meal-plans:write` | PUT, POST | `/api/grocery` |
| `recipes:read` | GET | `/api/recipes`, `/api/recipes/{recipeId}`, `/api/recipes/{recipeId}/ingredients`, `/api/recipes/{recipeId}/categories`, `/api/recipes/completions`, `/api/categories`, `/api/categories/{categoryId}/descendants`, `/api/categories/{categoryId}/recipes` |
| `recipes:write` | POST | `/api/recipes`, `/api/recipes/{recipeId}/ingredients` |
| `recipes:write` | PUT, DELETE | `/api/recipes/{recipeId}`, `/api/recipes/{recipeId}/ingredients/{ingredientId}` |
| `recipes:write` | POST, DELETE | `/api/recipes/{recipeId}/categories` |
| `recipes:write` | PUT, POST, DELETE | `/api/recipes/completions/{recipeId}` |
| `books:read` | GET | `/api/books`, `/api/books/{bookId}`, `/api/books/{bookId}/chapters/`, `/api/chapters/{chapterId}/recipes`, `/api/books/{bookId}/chapters/{chapterId}/recipes`, `/api/chapters/{chapterId}/pages`, `/api/books/{bookId}/chapters/{chapterId}/pages`, `/api/books/{bookId}/pages` |
| `books:write` | POST | `/api/books`, `/api/books/{bookId}/chapters/`, `/api/chapters/{chapterId}/recipes`, `/api/books/{bookId}/chapters/{chapterId}/recipes`, `/api/chapters/{chapterId}/pages`, `/api/books/{bookId}/chapters/{chapterId}/pages`, `/api/books/{bookId}/pages` |
| `books:write` | PUT, DELETE | `/api/books/{bookId}`, `/api/chapters/{chapterId}`, `/api/books/{bookId}/chapters/{chapterId}`, `/api/pages/{pageId}`, `/api/chapters/{chapterId}/pages/{pageId}`, `/api/books/{bookId}/chapters/{chapterId}/pages/{pageId}`, `/api/book-pages/{pageId}` |
| `books:write` | DELETE | `/api/chapters/{chapterId}/recipes`, `/api/chapters/{chapterId}/recipes/{recipeId}`, `/api/books/{bookId}/chapters/{chapterId}/recipes`, `/api/books/{bookId}/chapters/{chapterId}/recipes/{recipeId}` |
| `books:write` | PUT | `/api/books/{bookId}/items/reorder`, `/api/chapters/{chapterId}/items/reorder` |
| `books:write` | POST | `/api/chapter-recipes/{chapterRecipeId}/move`, `/api/pages/{pageId}/move`, `/api/pages/{pageId}/to-book`, `/api/pages/{pageId}/to-chapter` |
| `sharing:read` | GET | `/api/share`, `/api/share/{shareToken}`, `/api/community`, `/api/community/categories`, `/api/custom-foods/community` |
| `sharing:publish` | POST | `/api/share`, `/api/custom-foods/{foodId}/share` (latter requires the key-path correction below) |
| `sharing:publish` | PUT, DELETE | `/api/share/{shareId}` |
| `transfer:export` | GET | `/api/recipe-bundles/candidates` |
| `transfer:export` | POST | `/api/recipe-bundles/export`, `/api/recipe-bundles/owner-backup` |
| `transfer:import` | POST | `/api/recipe-bundles/import`, `/api/recipe-imports/{batchId}/decision` |
| `transfer:import` | GET | `/api/recipe-imports` |
| `transfer:import` | PUT | `/api/recipe-imports/{stagedRecipeId}/ingredients/{ingredientId}` |
| `preferences:read` | GET | `/api/settings`, `/api/settings/location` |
| `preferences:write` | PUT | `/api/settings`, `/api/settings/location` |
| `design:read` | GET | `/api/templates`, `/api/templates/{templateId}`, `/api/brand-kits`, `/api/brand-kits/{brandKitId}` |
| `design:write` | POST | `/api/templates`, `/api/brand-kits` |
| `design:write` | PUT, DELETE | `/api/templates/{templateId}`, `/api/brand-kits/{brandKitId}` |
| `dietary:read` | GET | `/api/dietary-profiles`, `/api/dietary-profiles/{dietaryProfileId}`, `/api/dietary-profiles/{dietaryProfileId}/recipe-assessments`, `/api/dietary-profiles/{dietaryProfileId}/allergen-rules` |
| `dietary:write` | POST | `/api/dietary-profiles`, `/api/dietary-profiles/diabetes-aware-starter`, `/api/dietary-profiles/{dietaryProfileId}/allergen-rules` |
| `dietary:write` | PUT, DELETE | `/api/dietary-profiles/{dietaryProfileId}`, `/api/dietary-profiles/{dietaryProfileId}/allergen-rules/{ruleId}`, `/api/allergen-rules/{ruleId}` |

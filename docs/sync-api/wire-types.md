# Go wire type reference

Generated from the pinned Go DTO declarations by `scripts/build-sync-api-kit.py`. Use with [HTTP operations](operations.md) and [workflow rules](workflows.md). Types alone do not imply requiredness, validation, or update semantics.

`*T` is a nullable Go pointer; `[]T` is an array that can be null when nil. `omitempty` may omit a zero/empty value during encoding; it does not specify whether a caller must send a field. `time.Time` encodes an RFC 3339 string, `json.RawMessage` is a raw JSON value, and `interface{}` holds route-specific JSON. `string` fields with embedded JSON stay strings on the wire. Hidden (`json:"-"`) and Go-internal fields are not listed. Inline request/response shapes are in the operation catalog.

## `APIResponse`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `ok` | `bool` | no |
| `data` | `interface{}` | yes |
| `error` | `string` | yes |

## `AllergenRule`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `userId` | `string` | no |
| `profileId` | `string` | no |
| `allergen` | `string` | no |
| `severity` | `string` | no |
| `customKeywords` | `string` | no |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `ApiKey`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `userId` | `string` | no |
| `name` | `string` | no |
| `keyPrefix` | `string` | no |
| `permissions` | `string` | no |
| `lastUsedAt` | `*time.Time` | yes |
| `createdAt` | `time.Time` | no |

## `AuthResponse`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `accessToken` | `string` | no |
| `csrfToken` | `string` | no |
| `expiresIn` | `int64` | no |
| `user` | `User` | no |

## `BookImportCandidate`

Source: `sync-server/import_book_decisions.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `targetBookId` | `string` | no |
| `title` | `string` | no |
| `targetFingerprint` | `string` | no |

## `BookImportConflict`

Source: `sync-server/import_book_decisions.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `bundleBookId` | `string` | no |
| `title` | `string` | no |
| `candidates` | `[]BookImportCandidate` | no |

## `BookImportDecision`

Source: `sync-server/import_book_decisions.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `bundleBookId` | `string` | no |
| `targetBookId` | `string` | no |
| `action` | `string` | no |
| `targetFingerprint` | `string` | no |

## `BookLevelItem`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `type` | `string` | no |

## `BookPage`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `bookId` | `string` | no |
| `title` | `string` | no |
| `content` | `string` | no |
| `position` | `int` | no |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `BrandKit`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `userId` | `string` | no |
| `name` | `string` | no |
| `logoDataUrl` | `*string` | yes |
| `primaryColor` | `string` | no |
| `secondaryColor` | `string` | no |
| `fontFamily` | `string` | no |
| `tagline` | `*string` | yes |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `BundleBook`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `bundleBookId` | `string` | no |
| `sourceBookId` | `string` | yes |
| `title` | `string` | no |
| `description` | `string` | no |
| `coverColor` | `string` | no |

## `BundleBookPage`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `bundleBookPageId` | `string` | no |
| `sourceBookPageId` | `string` | yes |
| `bundleBookId` | `string` | no |
| `title` | `string` | no |
| `content` | `string` | no |
| `position` | `int` | no |

## `BundleCategory`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `bundleCategoryId` | `string` | no |
| `sourceCategoryId` | `string` | yes |
| `name` | `string` | no |
| `parentBundleCategoryId` | `*string` | yes |

## `BundleChapter`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `bundleChapterId` | `string` | no |
| `sourceChapterId` | `string` | yes |
| `bundleBookId` | `string` | no |
| `title` | `string` | no |
| `position` | `int` | no |
| `bundlePageTemplateId` | `*string` | yes |
| `bundleRecipeTemplateId` | `*string` | yes |

## `BundleChapterPage`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `bundleChapterPageId` | `string` | no |
| `sourceChapterPageId` | `string` | yes |
| `bundleChapterId` | `string` | no |
| `title` | `string` | no |
| `content` | `string` | no |
| `position` | `int` | no |

## `BundleChapterRecipe`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `bundleChapterId` | `string` | no |
| `bundleRecipeId` | `string` | no |
| `position` | `int` | no |

## `BundleCustomFood`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `portableId` | `string` | yes |
| `bundleCustomFoodId` | `string` | no |
| `sourceCustomFoodId` | `string` | yes |
| `name` | `string` | no |
| `nutrients` | `BundleNutrients` | no |

## `BundleFoodItem`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `portions` | `[]FoodPortion` | yes |
| `sourceFoodItemId` | `string` | yes |
| `fdcId` | `int` | no |
| `description` | `string` | no |
| `dataType` | `string` | no |
| `brandOwner` | `*string` | yes |
| `gtinUpc` | `*string` | yes |
| `servingSize` | `float64` | no |
| `servingSizeUnit` | `string` | no |
| `source` | `string` | no |
| `nutrients` | `BundleNutrients` | no |

## `BundleIngredient`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `missingNutrients` | `[]string` | yes |
| `bundleIngredientId` | `string` | no |
| `position` | `*int` | yes |
| `sourceIngredientId` | `string` | yes |
| `name` | `string` | no |
| `amount` | `float64` | no |
| `unit` | `string` | no |
| `description` | `string` | yes |
| `bundleGroupId` | `*string` | yes |
| `prepInstructions` | `[]string` | yes |
| `storageLocation` | `string` | yes |
| `source` | `BundleIngredientSourceRef` | no |
| `nutrients` | `BundleNutrients` | no |
| `zeroNutritionOverride` | `bool` | yes |
| `suppliedNutrition` | `*UnconfirmedIngredientNutrition` | yes |

## `BundleIngredientGroup`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `bundleGroupId` | `string` | no |
| `title` | `string` | no |

## `BundleIngredientSourceRef`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `type` | `string` | no |
| `fdcId` | `int` | yes |
| `bundleCustomFoodId` | `string` | yes |
| `bundleRecipeId` | `string` | yes |

## `BundleNutrients`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `calories` | `float64` | no |
| `totalFat` | `float64` | no |
| `saturatedFat` | `float64` | no |
| `transFat` | `float64` | no |
| `cholesterol` | `float64` | no |
| `sodium` | `float64` | no |
| `totalCarbs` | `float64` | no |
| `dietaryFiber` | `float64` | no |
| `totalSugars` | `float64` | no |
| `addedSugars` | `float64` | no |
| `protein` | `float64` | no |
| `vitaminD` | `float64` | no |
| `calcium` | `float64` | no |
| `iron` | `float64` | no |
| `potassium` | `float64` | no |

## `BundleRecipe`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `description` | `*string` | yes |
| `customNutrition` | `*CustomRecipeNutrition` | yes |
| `portableId` | `string` | yes |
| `bundleRecipeId` | `string` | no |
| `sourceRecipeId` | `string` | yes |
| `name` | `string` | no |
| `servings` | `int` | no |
| `servingName` | `string` | no |
| `prepTime` | `*string` | yes |
| `cookTime` | `*string` | yes |
| `instructions` | `*string` | yes |
| `leftoverStorage` | `*string` | yes |
| `ingredientGroups` | `[]BundleIngredientGroup` | no |
| `ingredients` | `[]BundleIngredient` | no |

## `BundleRecipeCategory`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `bundleRecipeId` | `string` | no |
| `bundleCategoryId` | `string` | no |

## `BundleTemplate`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `bundleTemplateId` | `string` | no |
| `sourceTemplateId` | `string` | yes |
| `name` | `string` | no |
| `type` | `string` | no |
| `layout` | `json.RawMessage` | no |

## `Category`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `name` | `string` | no |
| `parentId` | `*string` | yes |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `Chapter`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `bookId` | `string` | no |
| `title` | `string` | no |
| `position` | `int` | no |
| `pageTemplateId` | `*string` | yes |
| `recipeTemplateId` | `*string` | yes |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `ChapterItem`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `type` | `string` | no |
| `recipeId` | `string` | yes |
| `pageId` | `string` | yes |

## `ChapterPage`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `chapterId` | `string` | no |
| `title` | `string` | no |
| `content` | `string` | no |
| `position` | `int` | no |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `ChapterRecipe`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `chapterId` | `string` | no |
| `recipeId` | `string` | no |
| `position` | `int` | no |

## `CommunityCategory`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `name` | `string` | no |
| `slug` | `string` | no |

## `CreateAllergenRuleRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `allergen` | `string` | no |
| `severity` | `string` | no |
| `customKeywords` | `string` | no |

## `CreateBookRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `title` | `string` | no |
| `description` | `string` | no |
| `coverColor` | `string` | no |

## `CreateBrandKitRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `name` | `string` | no |
| `logoDataUrl` | `*string` | yes |
| `primaryColor` | `string` | no |
| `secondaryColor` | `string` | no |
| `fontFamily` | `string` | no |
| `tagline` | `*string` | yes |

## `CreateCategoryRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `name` | `string` | no |
| `parentId` | `*string` | yes |

## `CreateChapterRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `title` | `string` | no |
| `position` | `int` | no |
| `pageTemplateId` | `*string` | yes |
| `recipeTemplateId` | `*string` | yes |

## `CreateCustomFoodRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `portableId` | `*string` | yes |
| `name` | `string` | no |
| `calories` | `float64` | no |
| `totalFat` | `float64` | no |
| `saturatedFat` | `float64` | no |
| `transFat` | `float64` | no |
| `cholesterol` | `float64` | no |
| `sodium` | `float64` | no |
| `totalCarbs` | `float64` | no |
| `dietaryFiber` | `float64` | no |
| `totalSugars` | `float64` | no |
| `addedSugars` | `float64` | no |
| `protein` | `float64` | no |
| `vitaminD` | `float64` | no |
| `calcium` | `float64` | no |
| `iron` | `float64` | no |
| `potassium` | `float64` | no |

## `CreateDayPlanEntryRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `date` | `string` | no |
| `slot` | `string` | no |
| `recipeId` | `*string` | yes |
| `position` | `int` | no |
| `groupId` | `*string` | yes |
| `servings` | `float64` | no |
| `isLeftover` | `bool` | no |
| `sourceType` | `string` | no |
| `foodName` | `*string` | yes |
| `calories` | `float64` | no |
| `totalFat` | `float64` | no |
| `saturatedFat` | `float64` | no |
| `transFat` | `float64` | no |
| `cholesterol` | `float64` | no |
| `sodium` | `float64` | no |
| `totalCarbs` | `float64` | no |
| `dietaryFiber` | `float64` | no |
| `totalSugars` | `float64` | no |
| `addedSugars` | `float64` | no |
| `protein` | `float64` | no |
| `vitaminD` | `float64` | no |
| `calcium` | `float64` | no |
| `iron` | `float64` | no |
| `potassium` | `float64` | no |

## `CreateDietaryProfileRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `name` | `string` | no |
| `allergens` | `string` | no |
| `dietaryTags` | `string` | no |
| `nutrientThresholds` | `string` | no |
| `isActive` | `bool` | no |

## `CreateFoodLogRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `profileId` | `string` | no |
| `date` | `string` | no |
| `time` | `*string` | yes |
| `mealSlot` | `string` | no |
| `sourceType` | `string` | no |
| `sourceId` | `*string` | yes |
| `name` | `string` | no |
| `servings` | `float64` | no |
| `servingAmount` | `*float64` | yes |
| `servingUnit` | `*string` | yes |
| `calories` | `float64` | no |
| `totalFat` | `float64` | no |
| `saturatedFat` | `float64` | no |
| `transFat` | `float64` | no |
| `cholesterol` | `float64` | no |
| `sodium` | `float64` | no |
| `totalCarbs` | `float64` | no |
| `dietaryFiber` | `float64` | no |
| `totalSugars` | `float64` | no |
| `addedSugars` | `float64` | no |
| `protein` | `float64` | no |
| `vitaminD` | `float64` | no |
| `calcium` | `float64` | no |
| `iron` | `float64` | no |
| `potassium` | `float64` | no |

## `CreateIngredientReq`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `missingNutrients` | `[]string` | yes |
| `fdcId` | `int` | no |
| `name` | `string` | no |
| `amount` | `float64` | no |
| `unit` | `string` | no |
| `description` | `string` | no |
| `calories` | `float64` | no |
| `totalFat` | `float64` | no |
| `saturatedFat` | `float64` | no |
| `transFat` | `float64` | no |
| `cholesterol` | `float64` | no |
| `sodium` | `float64` | no |
| `totalCarbs` | `float64` | no |
| `dietaryFiber` | `float64` | no |
| `totalSugars` | `float64` | no |
| `addedSugars` | `float64` | no |
| `protein` | `float64` | no |
| `vitaminD` | `float64` | no |
| `calcium` | `float64` | no |
| `iron` | `float64` | no |
| `potassium` | `float64` | no |
| `groupId` | `*string` | no |
| `linkedRecipeId` | `*string` | no |
| `sourceType` | `string` | no |
| `sourceKey` | `*string` | yes |
| `prepInstructions` | `[]string` | no |
| `storageLocation` | `string` | no |
| `position` | `*int` | yes |
| `zeroNutritionOverride` | `*bool` | yes |
| `unresolvedSource` | `*BundleIngredientSourceRef` | yes |
| `unconfirmedNutrition` | `*UnconfirmedIngredientNutrition` | yes |

## `CreateMealPlanRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `name` | `string` | no |
| `weekStart` | `string` | no |
| `slotTimes` | `json.RawMessage` | yes |

## `CreatePantryStapleRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `name` | `string` | no |

## `CreateProfileRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `name` | `string` | no |
| `sex` | `string` | no |
| `birthDate` | `*string` | yes |
| `heightCm` | `*float64` | yes |
| `activityLevel` | `string` | no |
| `goalWeightKg` | `*float64` | yes |
| `goalDate` | `*string` | yes |
| `bmrEquation` | `*string` | yes |
| `manualBmrValue` | `*float64` | yes |
| `calorieTarget` | `*float64` | yes |
| `proteinGoalG` | `*float64` | yes |
| `carbsGoalG` | `*float64` | yes |
| `fatGoalG` | `*float64` | yes |
| `fiberGoalG` | `*float64` | yes |
| `sodiumMaxMg` | `*float64` | yes |
| `sugarMaxG` | `*float64` | yes |
| `vitaminDGoalUg` | `*float64` | yes |
| `calciumGoalMg` | `*float64` | yes |
| `ironGoalMg` | `*float64` | yes |
| `potassiumGoalMg` | `*float64` | yes |

## `CreateRecipeRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `description` | `*string` | yes |
| `customNutrition` | `*CustomRecipeNutrition` | yes |
| `requestKey` | `string` | yes |
| `ingredientGroups` | `string` | yes |
| `name` | `string` | no |
| `servings` | `int` | no |
| `servingName` | `string` | no |
| `prepTime` | `*string` | yes |
| `cookTime` | `*string` | yes |
| `instructions` | `*string` | yes |
| `leftoverStorage` | `*string` | yes |
| `ingredients` | `[]CreateIngredientReq` | no |

## `CreateSecretRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `keyName` | `string` | no |
| `value` | `string` | no |

## `CreateTemplateRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `name` | `string` | no |
| `type` | `string` | no |
| `isDefault` | `bool` | no |
| `layout` | `string` | no |

## `CreateWeightEntryRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `profileId` | `string` | no |
| `date` | `string` | no |
| `time` | `*string` | yes |
| `weightKg` | `float64` | no |
| `notes` | `*string` | yes |
| `bloodSugar` | `*float64` | yes |
| `bloodPressureSystolic` | `*float64` | yes |
| `bloodPressureDiastolic` | `*float64` | yes |
| `measurementContext` | `*string` | yes |

## `CustomFood`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `portableId` | `string` | no |
| `id` | `string` | no |
| `userId` | `string` | no |
| `name` | `string` | no |
| `calories` | `float64` | no |
| `totalFat` | `float64` | no |
| `saturatedFat` | `float64` | no |
| `transFat` | `float64` | no |
| `cholesterol` | `float64` | no |
| `sodium` | `float64` | no |
| `totalCarbs` | `float64` | no |
| `dietaryFiber` | `float64` | no |
| `totalSugars` | `float64` | no |
| `addedSugars` | `float64` | no |
| `protein` | `float64` | no |
| `vitaminD` | `float64` | no |
| `calcium` | `float64` | no |
| `iron` | `float64` | no |
| `potassium` | `float64` | no |
| `sharedWithCommunity` | `bool` | no |
| `createdAt` | `time.Time` | no |

## `CustomRecipeNutrition`

Source: `sync-server/custom_recipe_nutrition.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `basis` | `string` | no |
| `nutrients` | `BundleNutrients` | no |
| `source` | `string` | no |
| `sourceLabel` | `string` | yes |
| `missingNutrients` | `[]string` | yes |

## `DayPlanEntry`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `mealPlanId` | `string` | no |
| `date` | `string` | no |
| `slot` | `string` | no |
| `recipeId` | `*string` | yes |
| `position` | `int` | no |
| `groupId` | `*string` | yes |
| `servings` | `float64` | no |
| `isLeftover` | `bool` | no |
| `sourceType` | `string` | no |
| `foodName` | `*string` | yes |
| `calories` | `float64` | no |
| `totalFat` | `float64` | no |
| `saturatedFat` | `float64` | no |
| `transFat` | `float64` | no |
| `cholesterol` | `float64` | no |
| `sodium` | `float64` | no |
| `totalCarbs` | `float64` | no |
| `dietaryFiber` | `float64` | no |
| `totalSugars` | `float64` | no |
| `addedSugars` | `float64` | no |
| `protein` | `float64` | no |
| `vitaminD` | `float64` | no |
| `calcium` | `float64` | no |
| `iron` | `float64` | no |
| `potassium` | `float64` | no |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `DietaryProfile`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `userId` | `string` | no |
| `name` | `string` | no |
| `allergens` | `string` | no |
| `dietaryTags` | `string` | no |
| `nutrientThresholds` | `string` | no |
| `isActive` | `bool` | no |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `ExportCandidate`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `type` | `string` | no |
| `name` | `string` | no |
| `description` | `string` | no |
| `searchText` | `string` | no |
| `ownerUserId` | `string` | no |
| `access` | `string` | no |

## `FoodItem`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `int` | no |
| `fdcId` | `int` | no |
| `description` | `string` | no |
| `dataType` | `string` | no |
| `brandOwner` | `*string` | yes |
| `gtinUpc` | `*string` | yes |
| `servingSize` | `float64` | no |
| `servingSizeUnit` | `string` | no |
| `portions` | `[]FoodPortion` | no |
| `calories` | `float64` | no |
| `totalFat` | `float64` | no |
| `saturatedFat` | `float64` | no |
| `transFat` | `float64` | no |
| `cholesterol` | `float64` | no |
| `sodium` | `float64` | no |
| `totalCarbs` | `float64` | no |
| `dietaryFiber` | `float64` | no |
| `totalSugars` | `float64` | no |
| `addedSugars` | `float64` | no |
| `protein` | `float64` | no |
| `vitaminD` | `float64` | no |
| `calcium` | `float64` | no |
| `iron` | `float64` | no |
| `potassium` | `float64` | no |
| `source` | `string` | no |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `FoodLogEntry`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `userId` | `string` | no |
| `profileId` | `string` | no |
| `date` | `string` | no |
| `time` | `*string` | yes |
| `mealSlot` | `string` | no |
| `sourceType` | `string` | no |
| `sourceId` | `*string` | yes |
| `name` | `string` | no |
| `servings` | `float64` | no |
| `servingAmount` | `*float64` | yes |
| `servingUnit` | `*string` | yes |
| `calories` | `float64` | no |
| `totalFat` | `float64` | no |
| `saturatedFat` | `float64` | no |
| `transFat` | `float64` | no |
| `cholesterol` | `float64` | no |
| `sodium` | `float64` | no |
| `totalCarbs` | `float64` | no |
| `dietaryFiber` | `float64` | no |
| `totalSugars` | `float64` | no |
| `addedSugars` | `float64` | no |
| `protein` | `float64` | no |
| `vitaminD` | `float64` | no |
| `calcium` | `float64` | no |
| `iron` | `float64` | no |
| `potassium` | `float64` | no |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `FoodPortion`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `amount` | `float64` | no |
| `measureUnit` | `string` | no |
| `modifier` | `string` | no |
| `portionDescription` | `string` | no |
| `gramWeight` | `float64` | no |

## `FoodSearchResult`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `foods` | `[]FoodItem` | no |
| `total` | `int` | no |
| `page` | `int` | no |
| `perPage` | `int` | no |
| `totalPages` | `int` | no |
| `source` | `string` | no |

## `FoodSourceCount`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `source` | `string` | no |
| `count` | `int` | no |

## `FoodStats`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `totalFoods` | `int` | no |
| `byDataType` | `[]FoodTypeCount` | no |
| `bySource` | `[]FoodSourceCount` | no |

## `FoodStorageDefault`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `sourceType` | `string` | no |
| `sourceKey` | `string` | no |
| `location` | `string` | no |

## `FoodTypeCount`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `dataType` | `string` | no |
| `count` | `int` | no |

## `GroceryChecklist`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `userId` | `string` | no |
| `weekStart` | `string` | no |
| `checkedItems` | `string` | no |
| `updatedAt` | `time.Time` | no |

## `ImportIngredientBlocker`

Source: `sync-server/import_quarantine.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `ingredientId` | `string` | no |
| `reason` | `string` | no |

## `Ingredient`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `missingNutrients` | `[]string` | yes |
| `id` | `string` | no |
| `recipeId` | `string` | no |
| `fdcId` | `int` | no |
| `name` | `string` | no |
| `amount` | `float64` | no |
| `unit` | `string` | no |
| `description` | `string` | no |
| `calories` | `float64` | no |
| `totalFat` | `float64` | no |
| `saturatedFat` | `float64` | no |
| `transFat` | `float64` | no |
| `cholesterol` | `float64` | no |
| `sodium` | `float64` | no |
| `totalCarbs` | `float64` | no |
| `dietaryFiber` | `float64` | no |
| `totalSugars` | `float64` | no |
| `addedSugars` | `float64` | no |
| `protein` | `float64` | no |
| `vitaminD` | `float64` | no |
| `calcium` | `float64` | no |
| `iron` | `float64` | no |
| `potassium` | `float64` | no |
| `groupId` | `*string` | no |
| `linkedRecipeId` | `*string` | no |
| `sourceType` | `string` | no |
| `sourceKey` | `*string` | yes |
| `prepInstructions` | `[]string` | no |
| `storageLocation` | `string` | no |
| `position` | `int` | no |
| `zeroNutritionOverride` | `bool` | no |
| `unresolvedSource` | `*BundleIngredientSourceRef` | yes |
| `unconfirmedNutrition` | `*UnconfirmedIngredientNutrition` | yes |

## `IngredientGroupJSON`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `title` | `string` | no |

## `InstanceState`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `onboardingComplete` | `bool` | no |
| `onboardingCompletedAt` | `*time.Time` | yes |
| `registrationEnabled` | `bool` | no |
| `hasUsers` | `bool` | no |
| `onboardingVersion` | `int` | no |
| `updatedAt` | `time.Time` | no |

## `LoginRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `email` | `string` | no |
| `password` | `string` | no |

## `MealGroup`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `mealPlanId` | `string` | no |
| `date` | `string` | no |
| `slot` | `string` | no |
| `name` | `string` | no |
| `position` | `int` | no |

## `MealPlan`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `userId` | `string` | no |
| `name` | `string` | no |
| `weekStart` | `string` | no |
| `slotTimes` | `json.RawMessage` | yes |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `PantryStaple`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `userId` | `string` | no |
| `name` | `string` | no |
| `isGlobal` | `bool` | no |

## `PendingRecipeImports`

Source: `sync-server/import_quarantine.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `version` | `int` | no |
| `batches` | `[]recipeImportBatch` | no |
| `recipes` | `[]stagedImportRecipe` | no |

## `PersonProfile`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `userId` | `string` | no |
| `name` | `string` | no |
| `sex` | `string` | no |
| `birthDate` | `*string` | yes |
| `heightCm` | `*float64` | yes |
| `activityLevel` | `string` | no |
| `goalWeightKg` | `*float64` | yes |
| `goalDate` | `*string` | yes |
| `bmrEquation` | `*string` | yes |
| `manualBmrValue` | `*float64` | yes |
| `calorieTarget` | `*float64` | yes |
| `proteinGoalG` | `*float64` | yes |
| `carbsGoalG` | `*float64` | yes |
| `fatGoalG` | `*float64` | yes |
| `fiberGoalG` | `*float64` | yes |
| `sodiumMaxMg` | `*float64` | yes |
| `sugarMaxG` | `*float64` | yes |
| `vitaminDGoalUg` | `*float64` | yes |
| `calciumGoalMg` | `*float64` | yes |
| `ironGoalMg` | `*float64` | yes |
| `potassiumGoalMg` | `*float64` | yes |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `QuarantinedRecipe`

Source: `sync-server/import_quarantine.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `batchId` | `string` | no |
| `requiresDecision` | `bool` | no |
| `recipe` | `Recipe` | no |
| `unresolvedIngredients` | `[]ImportIngredientBlocker` | no |
| `bookTitles` | `[]string` | no |

## `Recipe`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `description` | `*string` | yes |
| `customNutrition` | `*CustomRecipeNutrition` | yes |
| `portableId` | `string` | no |
| `id` | `string` | no |
| `userId` | `string` | no |
| `name` | `string` | no |
| `servings` | `int` | no |
| `servingName` | `string` | no |
| `prepTime` | `*string` | yes |
| `cookTime` | `*string` | yes |
| `instructions` | `*string` | yes |
| `leftoverStorage` | `*string` | yes |
| `ingredientGroups` | `string` | yes |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |
| `ingredients` | `[]Ingredient` | yes |

## `RecipeAssessment`

Source: `sync-server/dietary_assessment.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `recipeId` | `string` | no |
| `status` | `AssessmentStatus` | no |
| `reasons` | `[]string` | no |

## `RecipeBook`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `userId` | `string` | no |
| `title` | `string` | no |
| `description` | `string` | no |
| `coverColor` | `string` | no |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `RecipeBundle`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `format` | `string` | no |
| `version` | `int` | no |
| `exportedAt` | `string` | no |
| `source` | `RecipeBundleSource` | no |
| `recipes` | `[]BundleRecipe` | no |
| `books` | `[]BundleBook` | no |
| `chapters` | `[]BundleChapter` | no |
| `chapterRecipes` | `[]BundleChapterRecipe` | no |
| `chapterPages` | `[]BundleChapterPage` | no |
| `bookPages` | `[]BundleBookPage` | no |
| `categories` | `[]BundleCategory` | no |
| `recipeCategories` | `[]BundleRecipeCategory` | no |
| `templates` | `[]BundleTemplate` | no |
| `foodItems` | `[]BundleFoodItem` | no |
| `customFoods` | `[]BundleCustomFood` | no |
| `nutritionProfiles` | `[]PersonProfile` | yes |
| `foodLogEntries` | `[]FoodLogEntry` | yes |
| `weightEntries` | `[]WeightEntry` | yes |
| `mealPlans` | `[]MealPlan` | yes |
| `dayPlanEntries` | `[]DayPlanEntry` | yes |
| `mealGroups` | `[]MealGroup` | yes |
| `pendingImports` | `*PendingRecipeImports` | yes |

## `RecipeBundleConflict`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `objectType` | `string` | no |
| `objectKey` | `string` | no |
| `name` | `string` | no |
| `reason` | `string` | no |

## `RecipeBundleImportSummary`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `created` | `map[string]int` | no |
| `updated` | `map[string]int` | no |
| `reused` | `map[string]int` | no |
| `skipped` | `map[string]int` | no |
| `conflicts` | `[]RecipeBundleConflict` | no |
| `pendingImportId` | `string` | yes |
| `requiresDecision` | `bool` | no |
| `requiresBookDecision` | `bool` | no |
| `bookConflicts` | `[]BookImportConflict` | yes |
| `quarantined` | `int` | no |
| `promotedRecipeIds` | `[]string` | no |

## `RecipeBundleSource`

Source: `sync-server/import_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `app` | `string` | no |
| `version` | `string` | no |

## `RecipeCategory`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `recipeId` | `string` | no |
| `categoryId` | `string` | no |

## `RecipeCompletion`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `userId` | `string` | no |
| `recipeId` | `string` | no |
| `completedDate` | `string` | no |
| `completedAt` | `time.Time` | no |
| `completedBy` | `*string` | yes |

## `RegisterRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `setupClaim` | `string` | no |
| `email` | `string` | no |
| `password` | `string` | no |
| `displayName` | `string` | no |

## `SeedJob`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `int` | no |
| `dataType` | `string` | no |
| `releaseDate` | `string` | no |
| `fileName` | `string` | no |
| `recordCount` | `int` | no |
| `status` | `string` | no |
| `progress` | `float64` | no |
| `error` | `*string` | yes |
| `checkpoint` | `*string` | yes |
| `startedAt` | `*time.Time` | yes |
| `completedAt` | `*time.Time` | yes |
| `createdAt` | `time.Time` | no |

## `ShareRecipeRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `recipeId` | `string` | no |
| `title` | `string` | no |
| `description` | `string` | yes |
| `category` | `string` | yes |
| `tags` | `string` | yes |
| `recipeData` | `string` | no |
| `visibility` | `string` | no |

## `SharedRecipe`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `userId` | `string` | no |
| `recipeId` | `string` | no |
| `shareToken` | `string` | no |
| `visibility` | `string` | no |
| `title` | `string` | no |
| `description` | `string` | yes |
| `category` | `string` | yes |
| `tags` | `string` | no |
| `recipeData` | `string` | no |
| `viewCount` | `int` | no |
| `importCount` | `int` | no |
| `averageRating` | `float64` | no |
| `ratingCount` | `int` | no |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `Template`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `userId` | `*string` | yes |
| `name` | `string` | no |
| `type` | `string` | no |
| `isDefault` | `bool` | no |
| `layout` | `string` | no |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `UnconfirmedIngredientNutrition`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `basis` | `string` | no |
| `unit` | `string` | yes |
| `servingGramWeight` | `*float64` | yes |
| `provenance` | `string` | yes |
| `nutrients` | `BundleNutrients` | no |

## `UpdateAllergenRuleRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `allergen` | `*string` | yes |
| `severity` | `*string` | yes |
| `customKeywords` | `*string` | yes |

## `UpdateBrandKitRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `name` | `*string` | yes |
| `logoDataUrl` | `*string` | no |
| `primaryColor` | `*string` | yes |
| `secondaryColor` | `*string` | yes |
| `fontFamily` | `*string` | yes |
| `tagline` | `*string` | no |

## `UpdateDietaryProfileRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `name` | `*string` | yes |
| `allergens` | `*string` | yes |
| `dietaryTags` | `*string` | yes |
| `nutrientThresholds` | `*string` | yes |
| `isActive` | `*bool` | yes |

## `UpdateLocationRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `country` | `string` | no |
| `region` | `string` | no |

## `UpdateRecipeRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `description` | `*string` | yes |
| `customNutrition` | `*CustomRecipeNutrition` | yes |
| `portableId` | `*string` | yes |
| `name` | `*string` | yes |
| `servings` | `*int` | yes |
| `servingName` | `*string` | yes |
| `prepTime` | `*string` | no |
| `cookTime` | `*string` | no |
| `instructions` | `*string` | no |
| `leftoverStorage` | `*string` | no |
| `ingredients` | `*[]CreateIngredientReq` | yes |
| `ingredientGroups` | `*string` | yes |

## `UpdateRegistrationRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `registrationEnabled` | `bool` | no |

## `UpdateSettingsRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `settings` | `string` | no |

## `UpdateTemplateRequest`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `name` | `*string` | yes |
| `layout` | `*string` | yes |
| `isDefault` | `*bool` | yes |

## `User`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `email` | `string` | no |
| `displayName` | `string` | no |
| `isAdmin` | `bool` | no |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `UserListEntry`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `email` | `string` | no |
| `displayName` | `string` | no |
| `isAdmin` | `bool` | no |

## `UserLocation`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `userId` | `string` | no |
| `country` | `string` | no |
| `region` | `string` | no |
| `updatedAt` | `time.Time` | no |

## `UserSecret`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `userId` | `string` | no |
| `keyName` | `string` | no |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `UserSettings`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `userId` | `string` | no |
| `settings` | `string` | no |
| `updatedAt` | `time.Time` | no |

## `WeightEntry`

Source: `sync-server/models.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `userId` | `string` | no |
| `profileId` | `string` | no |
| `date` | `string` | no |
| `time` | `*string` | yes |
| `weightKg` | `float64` | no |
| `notes` | `*string` | yes |
| `bloodSugar` | `*float64` | yes |
| `bloodPressureSystolic` | `*float64` | yes |
| `bloodPressureDiastolic` | `*float64` | yes |
| `measurementContext` | `*string` | yes |
| `createdAt` | `time.Time` | no |
| `updatedAt` | `time.Time` | no |

## `createPersonalKeyRequest`

Source: `sync-server/personal_key_management.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `name` | `string` | no |
| `scopes` | `[]string` | no |
| `password` | `string` | no |

## `datasetStatus`

Source: `sync-server/handlers_food.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `key` | `string` | no |
| `name` | `string` | no |
| `releaseDate` | `string` | no |
| `lastImported` | `*string` | no |
| `recordCount` | `int` | no |
| `status` | `string` | no |
| `format` | `string` | no |

## `importBookState`

Source: `sync-server/import_book_decisions.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `version` | `int` | yes |
| `decisions` | `[]BookImportDecision` | yes |
| `invalidated` | `bool` | yes |
| `supersededBooks` | `[]string` | yes |

## `importPlacements`

Source: `sync-server/import_quarantine.go`.

`map[string]map[string]string`

## `issuedPersonalKey`

Source: `sync-server/personal_key_management.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `name` | `string` | no |
| `scopes` | `[]string` | no |
| `createdAt` | `time.Time` | no |
| `expiresAt` | `time.Time` | no |
| `key` | `string` | no |

## `nutrientThreshold`

Source: `sync-server/dietary_assessment.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `nutrient` | `string` | no |
| `dailyMax` | `*float64` | yes |
| `perMealMax` | `*float64` | yes |
| `per1000KcalMin` | `*float64` | yes |
| `alertLevel` | `string` | no |

## `personalKeyAccount`

Source: `sync-server/personal_key_auth.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `displayName` | `string` | no |

## `personalKeyDiscovery`

Source: `sync-server/personal_key_auth.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `contractVersion` | `int` | no |
| `account` | `personalKeyAccount` | no |
| `key` | `personalKeyInfo` | no |

## `personalKeyInfo`

Source: `sync-server/personal_key_auth.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `scopes` | `[]string` | no |
| `expiresAt` | `time.Time` | no |

## `personalKeyMetadata`

Source: `sync-server/personal_key_management.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `name` | `string` | no |
| `scopes` | `[]string` | no |
| `createdAt` | `time.Time` | no |
| `expiresAt` | `time.Time` | no |

## `recipeBundleExportRequest`

Source: `sync-server/handlers_recipe_bundle.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `recipeIds` | `[]string` | no |
| `bookIds` | `[]string` | no |
| `profileIds` | `[]string` | no |
| `mealPlanIds` | `[]string` | no |

## `recipeImportBatch`

Source: `sync-server/import_quarantine.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `accepted` | `bool` | no |
| `materialized` | `bool` | no |
| `bundle` | `RecipeBundle` | no |
| `placements` | `importPlacements` | no |
| `bookState` | `importBookState` | yes |
| `createdAt` | `time.Time` | no |

## `resetRequest`

Source: `sync-server/handlers_instance.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `password` | `string` | no |

## `stagedImportRecipe`

Source: `sync-server/import_quarantine.go`.

| JSON field | Go type | Omit empty on encode |
| --- | --- | --- |
| `id` | `string` | no |
| `batchId` | `string` | no |
| `recipe` | `BundleRecipe` | no |
| `createdAt` | `time.Time` | no |

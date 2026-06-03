# Spec: AI API Key Management & Read/Write Endpoints

## Objective

Add API key generation with configurable per-feature permissions so AI assistants (Claude, ChatGPT, etc.) can read and selectively write data in DietLedger. Keys are issued by the user and carry fine-grained `read`/`write` flags per feature area.

**User stories:**
- As a user, I can generate an API key with specific permissions (e.g., read nutrition, write recipes, write meal plans).
- As an AI assistant, I can authenticate via `Authorization: Bearer dlai_...` and access only the features my key permits.
- As a user, I can see when each key was last used, and revoke keys I no longer need.

## Permission Model

Each API key has a set of feature-level permissions. Each permission is `read`, `write`, or absent (no access).

| Feature | Scope | AI default |
|---------|-------|------------|
| `recipes` | CRUD recipes + ingredients | read + write (create) |
| `books` | CRUD books + chapters | read + write |
| `mealPlans` | CRUD meal plans + day entries + groups | read + write |
| `nutrition` | Profiles, food log, weight (per-person) | read only |
| `foods` | Search food DB, UPC lookup | read only |
| `categories` | List categories | read only |

**Kitchen helper** is excluded — it's a client-side view over recipes + meal plans, not a separate data domain.

## Data Model Changes

### New Prisma Model: `ApiKey`

```prisma
model ApiKey {
  id           String   @id @default(cuid())
  name         String                    // label like "Claude Desktop"
  keyHash      String                    // SHA-256 hash of the raw key
  keyPrefix    String                    // first 8 chars for identification (dlai_abc1)
  permissions  String                    // JSON: { "recipes": ["read","write"], "nutrition": ["read"], ... }
  lastUsedAt   DateTime?
  createdAt    DateTime @default(now())
}
```

### New Prisma Models: Meal Plans (server-side)

Meal plans currently only exist in client-side IndexedDB. Adding server models so AI can read/write them:

```prisma
model MealPlan {
  id         String          @id @default(cuid())
  name       String
  weekStart  String
  entries    DayPlanEntry[]
  groups     MealGroup[]
  createdAt  DateTime        @default(now())
  updatedAt  DateTime        @updatedAt

  @@unique([weekStart])
}

model DayPlanEntry {
  id           String    @id @default(cuid())
  mealPlanId   String
  date         String
  slot         String
  recipeId     String?
  position     Int       @default(0)
  groupId      String?
  servings     Float     @default(1)
  isLeftover   Boolean   @default(false)
  sourceType   String    @default("recipe")
  foodName     String?
  calories     Float     @default(0)
  totalFat     Float     @default(0)
  saturatedFat Float     @default(0)
  transFat     Float     @default(0)
  cholesterol  Float     @default(0)
  sodium       Float     @default(0)
  totalCarbs   Float     @default(0)
  dietaryFiber Float     @default(0)
  totalSugars  Float     @default(0)
  addedSugars  Float     @default(0)
  protein      Float     @default(0)
  vitaminD     Float     @default(0)
  calcium      Float     @default(0)
  iron         Float     @default(0)
  potassium    Float     @default(0)
  mealPlan     MealPlan  @relation(fields: [mealPlanId], references: [id], onDelete: Cascade)

  @@index([mealPlanId])
  @@index([date])
}

model MealGroup {
  id           String    @id @default(cuid())
  mealPlanId   String
  date         String
  slot         String
  name         String
  position     Int       @default(0)
  mealPlan     MealPlan  @relation(fields: [mealPlanId], references: [id], onDelete: Cascade)

  @@index([mealPlanId])
}
```

### New Prisma Model: Custom Foods (server-side)

```prisma
model CustomFood {
  id            String   @id @default(cuid())
  name          String
  calories      Float    @default(0)
  totalFat      Float    @default(0)
  saturatedFat  Float    @default(0)
  transFat      Float    @default(0)
  cholesterol   Float    @default(0)
  sodium        Float    @default(0)
  totalCarbs    Float    @default(0)
  dietaryFiber  Float    @default(0)
  totalSugars   Float    @default(0)
  addedSugars   Float    @default(0)
  protein       Float    @default(0)
  vitaminD      Float    @default(0)
  calcium       Float    @default(0)
  iron          Float    @default(0)
  potassium     Float    @default(0)
  createdAt     DateTime @default(now())
}
```

## API Endpoints

### Key Management (no auth — admin-only by convention, local app)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/keys` | List all keys (name, prefix, permissions, lastUsed, created) |
| POST | `/api/keys` | Create a new key — body: `{ name, permissions }`. Returns the raw key **once**. |
| DELETE | `/api/keys/[id]` | Revoke a key |

### AI Data Endpoints (require `Bearer dlai_...` header)

All under `/api/ai/`. Each validates the key and checks the specific feature+action permission.

| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| GET | `/api/ai/recipes` | recipes:read | List all recipes with ingredients |
| GET | `/api/ai/recipes/[id]` | recipes:read | Get single recipe with ingredients |
| POST | `/api/ai/recipes` | recipes:write | Create a recipe with ingredients |
| PUT | `/api/ai/recipes/[id]` | recipes:write | Update a recipe |
| GET | `/api/ai/books` | books:read | List all books with chapters |
| GET | `/api/ai/books/[id]` | books:read | Get book with chapters + pages |
| POST | `/api/ai/books` | books:write | Create a book |
| PUT | `/api/ai/books/[id]` | books:write | Update a book |
| GET | `/api/ai/meal-plans` | mealPlans:read | List meal plans |
| GET | `/api/ai/meal-plans/[id]` | mealPlans:read | Get plan with entries + groups |
| GET | `/api/ai/meal-plans/week/[date]` | mealPlans:read | Get plan for a specific week |
| POST | `/api/ai/meal-plans` | mealPlans:write | Create a meal plan |
| PUT | `/api/ai/meal-plans/[id]` | mealPlans:write | Update a meal plan (entries, groups) |
| POST | `/api/ai/meal-plans/[id]/entries` | mealPlans:write | Add/replace day plan entries |
| GET | `/api/ai/nutrition/profiles` | nutrition:read | List person profiles |
| GET | `/api/ai/nutrition/profiles/[id]` | nutrition:read | Get profile details |
| GET | `/api/ai/nutrition/log` | nutrition:read | Get food log (`?profileId=&date=` or `?startDate=&endDate=`) |
| GET | `/api/ai/nutrition/weight` | nutrition:read | Get weight entries (`?profileId=`) |
| GET | `/api/ai/foods/search` | foods:read | Search food database (`?q=`) |
| GET | `/api/ai/foods/upc` | foods:read | UPC lookup (`?code=`) |
| GET | `/api/ai/categories` | categories:read | List all categories |

## Auth Middleware

A helper function `validateApiKey(request, feature, action)` that:
1. Extracts `Authorization: Bearer dlai_...` header
2. Hashes the key with SHA-256
3. Looks up the hash in the `ApiKey` table
4. Parses the `permissions` JSON and checks `feature` has `action`
5. Updates `lastUsedAt` on the key
6. Returns the key record or throws 401/403

This runs at the top of every `/api/ai/*` route handler.

## UI: API Key Management

A new section on the Settings page (`/settings`) with:
- A "Generate API Key" button that opens a dialog
- Dialog has: key name input + checkboxes for each feature's read/write permissions
- On creation, shows the raw key **once** with a copy button
- Lists existing keys in a table: name, prefix, permissions badges, last used, created, delete button

## Implementation Order

1. Prisma schema additions (ApiKey, MealPlan, DayPlanEntry, MealGroup, CustomFood models)
2. `src/lib/ai-auth.ts` — key validation helper
3. `src/app/api/keys/route.ts` — key management endpoints
4. `src/app/api/keys/[id]/route.ts` — delete key
5. AI data routes (recipes, books, meal-plans, nutrition, foods, categories)
6. `ensureSchema()` updates in `src/lib/db.ts`
7. Settings page UI for key management

## Boundaries

- **Always:** Run `npx tsc --noEmit` after changes
- **Always:** Reuse existing Prisma query patterns from current API routes
- **Ask first:** Adding new npm dependencies
- **Never:** Modify existing `/api/` routes (only add new `/api/ai/` routes)
- **Never:** Change client-side code (this is server-side only, except the settings UI)

## Open Questions

- Should meal plan sync from IndexedDB to server be part of this scope, or a separate follow-up?
  - Recommendation: **Separate follow-up.** AI writes to server DB; client sync can be wired later.
- Rate limiting on AI endpoints?
  - Recommendation: **Out of scope** for now. Add later if needed.

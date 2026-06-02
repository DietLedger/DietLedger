# Implementation Plan: AI API Keys & Server-Primary Data

## Overview
Add API key management with configurable per-feature permissions, AI-facing API endpoints, and migrate all user data to server-primary storage with client mirroring.

## Architecture Decisions
- All new Prisma models use `@id @default(cuid())` to match client-side UUID pattern
- Permissions stored as JSON string on ApiKey for flexibility
- AI endpoints under `/api/ai/*` — existing open routes untouched
- Server-side CRUD for new models also under `/api/ai/*` (shared by sync later)
- Auth helper in `src/lib/ai-auth.ts` — single function used by all AI routes
- Field gaps in existing Prisma models (PersonProfile, FoodLogEntry, WeightEntry, Recipe, Chapter) fixed with additive columns only

## Task List

### Phase 1: Database Foundation

- [ ] **T1: Update Prisma schema** — Add ApiKey model + fix field gaps on Recipe, Chapter, PersonProfile, FoodLogEntry, WeightEntry. Add MealPlan, DayPlanEntry, MealGroup, CustomFood, GroceryChecklist, BookPage models.
- [ ] **T2: Update ensureSchema()** — Add raw SQL CREATE TABLE statements for all new models in `src/lib/db.ts`
- [ ] **T3: Generate Prisma client** — Run `npx prisma generate` and verify types compile

### Phase 2: API Key Auth System

- [ ] **T4: Create ai-auth.ts** — `validateApiKey(request, feature, action)` helper that extracts Bearer token, hashes with SHA-256, looks up in DB, checks permissions, updates lastUsedAt
- [ ] **T5: Key management endpoints** — `POST/GET /api/keys` and `DELETE /api/keys/[id]`

### Phase 3: AI Data Endpoints

- [ ] **T6: AI recipes endpoints** — GET list, GET by id, POST create (recipes:read, recipes:write)
- [ ] **T7: AI books endpoints** — GET list, GET by id, POST create (books:read, books:write)
- [ ] **T8: AI meal plan endpoints** — GET list, GET by id/week, POST create, PUT update, POST entries (mealPlans:read, mealPlans:write)
- [ ] **T9: AI nutrition endpoints** — GET profiles, GET log, GET weight (nutrition:read)
- [ ] **T10: AI food search + categories + custom foods** — GET search, GET upc, GET categories, GET/POST custom foods

### Phase 4: Settings UI

- [ ] **T11: API key management UI** — New section on Settings page with generate dialog + key list table

### Phase 5: Sync Improvements

- [ ] **T12: Fix nutrition sync field gaps** — Update `/api/nutrition/sync` and related endpoints to handle new PersonProfile, FoodLogEntry, WeightEntry fields
- [ ] **T13: Add meal plan + custom food sync endpoints** — Server-side CRUD that client can sync to

## Checkpoints
- After T3: `npx tsc --noEmit` passes, `npx prisma generate` succeeds
- After T5: Can create/list/delete API keys via curl
- After T10: Full AI API working with key auth
- After T11: UI complete for key management

# Implementation Plan: Recipe Books, Chapters & Hierarchical Categories

## Overview

Add organizational structure to recipes: Recipe Books (containing ordered Chapters of Recipes) and hierarchical Categories. Data stored in both IndexedDB (client-side, primary) and Prisma/SQLite (server-side).

## Architecture Decisions

- **IndexedDB is primary client store** — Zustand store reads/writes IndexedDB directly (matches existing recipe pattern)
- **Prisma models mirror the data** — API routes provide server-side CRUD for future server-first mode
- **Separate Zustand store** — New `book-store.ts` keeps concerns separate from existing `recipe-store.ts`
- **Shared types in `types.ts`** — Single source of truth for entity interfaces

## Task List

### Phase 1: Foundation (Types, Schema, Storage)

- [ ] **Task 1: Shared TypeScript types + Prisma schema update**
  - Create `src/lib/types.ts` with RecipeBook, Chapter, ChapterRecipe, Category, RecipeCategory interfaces
  - Update `prisma/schema.prisma` with new models + relations on existing Recipe model
  - Run `prisma db push` to apply
  - Acceptance: Prisma schema compiles, db push succeeds, types file exports all interfaces
  - Verify: `bunx prisma generate && bunx prisma db push`
  - Files: `src/lib/types.ts`, `prisma/schema.prisma`
  - Scope: S

- [ ] **Task 2: IndexedDB schema upgrade + book/chapter storage CRUD**
  - Bump `DB_VERSION` to 2 in `storage.ts`
  - Add object stores: `books`, `chapters`, `chapterRecipes` with proper indexes
  - Add CRUD functions: getAllBooks, getBook, createBook, updateBook, deleteBook
  - Add CRUD functions: getChaptersByBook, createChapter, updateChapter, deleteChapter
  - Add functions: addRecipeToChapter, removeRecipeFromChapter, reorderChapterRecipes
  - Acceptance: All storage functions compile, IndexedDB upgrade creates new stores
  - Verify: `bun run build`
  - Files: `src/lib/storage.ts`
  - Scope: M

- [ ] **Task 3: IndexedDB category storage CRUD**
  - Add object stores: `categories`, `recipeCategories` with indexes
  - Add CRUD functions: getAllCategories, getCategory, createCategory, updateCategory, deleteCategory
  - Add functions: getCategoriesByParent, getCategoryTree (recursive)
  - Add functions: addCategoryToRecipe, removeCategoryFromRecipe, getRecipeCategories, getRecipesByCategory
  - Acceptance: All category storage functions compile
  - Verify: `bun run build`
  - Files: `src/lib/storage.ts`
  - Scope: M

### Checkpoint 1: Foundation
- [ ] `bun run build` succeeds with no errors
- [ ] Prisma schema is valid
- [ ] All storage functions typecheck

### Phase 2: API Routes (Server-side CRUD)

- [ ] **Task 4: API routes for books**
  - `GET /api/books` — list all books with chapter counts
  - `POST /api/books` — create a book
  - `GET /api/books/[id]` — get book with chapters and recipe summaries
  - `PUT /api/books/[id]` — update book title/description
  - `DELETE /api/books/[id]` — delete book + cascade chapters
  - Acceptance: All 5 endpoints work with Prisma
  - Verify: `bun run build`
  - Files: `src/app/api/books/route.ts`, `src/app/api/books/[id]/route.ts`
  - Scope: S

- [ ] **Task 5: API routes for chapters + chapter-recipe management**
  - `POST /api/books/[id]/chapters` — create chapter in book
  - `PUT /api/books/[id]/chapters/[chapterId]` — update chapter
  - `DELETE /api/books/[id]/chapters/[chapterId]` — delete chapter
  - `POST /api/books/[id]/chapters/[chapterId]/recipes` — add recipe to chapter
  - `DELETE /api/books/[id]/chapters/[chapterId]/recipes?recipeId=X` — remove recipe from chapter
  - Acceptance: All endpoints work with Prisma, position ordering handled
  - Verify: `bun run build`
  - Files: `src/app/api/books/[id]/chapters/route.ts`, `src/app/api/books/[id]/chapters/[chapterId]/route.ts`, `src/app/api/books/[id]/chapters/[chapterId]/recipes/route.ts`
  - Scope: M

- [ ] **Task 6: API routes for categories**
  - `GET /api/categories` — list all categories (optionally as tree)
  - `POST /api/categories` — create category (with optional parentId)
  - `GET /api/categories/[id]` — get category with children
  - `PUT /api/categories/[id]` — update category name/parent
  - `DELETE /api/categories/[id]` — delete category (cascade children)
  - Acceptance: All endpoints work, hierarchy is maintained
  - Verify: `bun run build`
  - Files: `src/app/api/categories/route.ts`, `src/app/api/categories/[id]/route.ts`
  - Scope: S

### Checkpoint 2: API Routes
- [ ] `bun run build` succeeds
- [ ] All API routes compile and handle basic CRUD

### Phase 3: State Management

- [ ] **Task 7: Zustand book store (books + chapters + categories)**
  - Create `src/lib/book-store.ts` with Zustand store
  - State: books, activeBook, categories, isLoading, error
  - Actions for books: fetchBooks, createBook, updateBook, deleteBook
  - Actions for chapters: addChapter, updateChapter, deleteChapter, reorderChapters
  - Actions for chapter-recipes: addRecipeToChapter, removeRecipeFromChapter, reorderChapterRecipes
  - Actions for categories: fetchCategories, createCategory, updateCategory, deleteCategory
  - Actions for recipe-categories: assignCategory, unassignCategory, getRecipeCategories
  - Acceptance: Store compiles, all actions wired to IndexedDB storage functions
  - Verify: `bun run build`
  - Files: `src/lib/book-store.ts`
  - Scope: M

### Checkpoint 3: State Management
- [ ] `bun run build` succeeds
- [ ] Store exports all needed actions

### Phase 4: UI — Books

- [ ] **Task 8: Books list page (`/books`)**
  - Grid/list of all books with title, description, chapter count
  - "Create Book" dialog (title + description)
  - Click card → navigate to `/books/[id]`
  - Delete book with confirmation dialog
  - Empty state when no books exist
  - Acceptance: User can view, create, and delete books
  - Verify: `bun run build` + manual check at /books
  - Files: `src/app/books/page.tsx`
  - Scope: M

- [ ] **Task 9: Book detail page (`/books/[id]`)**
  - Book header with title and description
  - List of chapters, each showing its recipes (by name)
  - Click recipe → navigate to main recipe editor with recipe selected
  - Click chapter → expand/collapse to show recipes
  - "Add Chapter" button
  - "Edit Book" button → navigate to `/books/[id]/edit`
  - Acceptance: User can view book structure, chapters, and recipes within
  - Verify: `bun run build` + manual check
  - Files: `src/app/books/[id]/page.tsx`
  - Scope: M

- [ ] **Task 10: Book edit page (`/books/[id]/edit`)**
  - Edit book title and description inline
  - Chapter management: add, rename, reorder (drag-and-drop), delete chapters
  - Recipe management within chapters: add (search/select from existing recipes), remove, reorder
  - "Add Recipe" dialog showing all existing recipes with search
  - Acceptance: Full CRUD for chapters and recipe assignments within a book
  - Verify: `bun run build` + manual check
  - Files: `src/app/books/[id]/edit/page.tsx`
  - Scope: L (but contained to single page)

### Phase 5: UI — Categories

- [ ] **Task 11: Category tree component + categories page**
  - Recursive tree component rendering categories with expand/collapse
  - `/categories` page with: tree view, "Create Category" dialog, inline rename, delete with confirmation
  - Creating a category accepts optional parent (select from existing)
  - Acceptance: User can create, rename, delete, and nest categories
  - Verify: `bun run build` + manual check at /categories
  - Files: `src/app/categories/page.tsx`, `src/components/category-tree.tsx`
  - Scope: M

- [ ] **Task 12: Category badges in recipe editor + category assignment dialog**
  - Add category badges to the recipe card in the main recipe editor (`page.tsx`)
  - "Manage Categories" dialog on each recipe: checkbox tree of categories, save assignments
  - Clicking a category badge filters recipes by that category
  - Acceptance: Recipes show their categories, user can assign/unassign categories
  - Verify: `bun run build` + manual check
  - Files: `src/app/page.tsx`
  - Scope: M

### Phase 6: Navigation & Polish

- [ ] **Task 13: Navigation links**
  - Add "Books" and "Categories" links to the main page header/navigation
  - Add back navigation from book/category pages to main page
  - Acceptance: All pages are navigable from each other
  - Verify: `bun run build` + manual navigation test
  - Files: `src/app/page.tsx`, `src/app/books/page.tsx`, `src/app/books/[id]/page.tsx`, `src/app/categories/page.tsx`
  - Scope: S

### Checkpoint 4: Complete
- [ ] All acceptance criteria from spec met
- [ ] `bun run build` succeeds
- [ ] Full flow works: create book → add chapters → add recipes → create categories → assign categories

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| IndexedDB version upgrade clears existing data | High | Handle upgrade gracefully, don't delete existing 'recipes' store |
| Drag-and-drop reordering complexity | Medium | Use existing @dnd-kit pattern from recipe editor |
| Recursive category tree performance | Low | Categories are user-created (small dataset), no optimization needed |
| Prisma SQLite cascade deletes | Medium | Test delete behavior, SQLite supports cascade since 3.x |

## Open Questions

_None._

# Spec: Recipe Books, Chapters & Hierarchical Categories

## Objective

Add organizational structure to recipes through **Recipe Books** (containing **Chapters**) and **Hierarchical Categories**. Users can create books with titled chapters, place recipes into chapters (ordered), and assign recipes to hierarchical categories. A recipe can belong to multiple books (via different chapters) and multiple categories.

**User Stories:**
- As a user, I want to create a Recipe Book (e.g., "Holiday Baking") with a title and description
- As a user, I want to add Chapters to a book (e.g., "Cookies", "Cakes") with titles and descriptions
- As a user, I want to place recipes into chapters in a specific order
- As a user, I want the same recipe to appear in multiple books (via different chapters)
- As a user, I want to create hierarchical categories (e.g., "Dessert" → "Cakes" → "Cheesecakes") and tag recipes with them
- As a user, I want a recipe to have multiple categories
- As a user, I want deleting a book/chapter to NOT delete the recipes inside

## Tech Stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS v4 + shadcn/ui (new-york style)
- Zustand v5 (state management)
- IndexedDB via `idb` v8 (client-side storage)
- Prisma v6 + SQLite (server-side storage)
- @dnd-kit (drag-and-drop reordering)

## Commands

```
Dev:     bun run dev
Build:   bun run build
Lint:    bun run lint
DB Push: bunx prisma db push
DB Gen:  bunx prisma generate
```

## Project Structure

```
prisma/
  schema.prisma              → Add RecipeBook, Chapter, Category, join tables
  migrations/                → Prisma auto-generated

src/
  app/
    page.tsx                 → Existing recipe editor (add category badges)
    books/
      page.tsx               → Book list page
      [id]/
        page.tsx             → Book detail (view chapters + recipes)
        edit/
          page.tsx           → Edit book (add/remove/reorder chapters & recipes)
    categories/
      page.tsx               → Category tree browser + management
    api/
      books/
        route.ts             → GET/POST /api/books
        [id]/
          route.ts           → GET/PUT/DELETE /api/books/[id]
          chapters/
            route.ts         → POST /api/books/[id]/chapters
            [chapterId]/
              route.ts       → PUT/DELETE chapter
              recipes/
                route.ts     → POST (add recipe to chapter), DELETE (remove)
      categories/
        route.ts             → GET/POST /api/categories
        [id]/
          route.ts           → GET/PUT/DELETE /api/categories/[id]
  lib/
    storage.ts               → Add IndexedDB stores for books, chapters, categories
    recipe-store.ts          → Add category lookup helpers (unchanged core)
    book-store.ts            → NEW: Zustand store for books, chapters, categories
    types.ts                 → NEW: Shared TypeScript types for all new entities
  components/
    ui/                      → Existing shadcn/ui components
    category-tree.tsx        → NEW: Recursive tree component for categories
    book-card.tsx            → NEW: Card component for book display
    chapter-list.tsx         → NEW: Chapter list with recipe management
```

## Data Model

### Prisma Schema (Server-side SQLite)

```prisma
model RecipeBook {
  id          String    @id @default(cuid())
  title       String
  description String    @default("")
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  chapters    Chapter[]
}

model Chapter {
  id          String     @id @default(cuid())
  bookId      String
  title       String
  description String     @default("")
  position    Int        @default(0)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  book        RecipeBook @relation(fields: [bookId], references: [id], onDelete: Cascade)
  recipes     ChapterRecipe[]
  @@index([bookId])
}

model ChapterRecipe {
  chapterId String   @map("chapter_id")
  recipeId  String   @map("recipe_id")
  position  Int      @default(0)
  chapter   Chapter  @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  recipe    Recipe   @relation(fields: [recipeId], references: [id], onDelete: Cascade)

  @@id([chapterId, recipeId])
  @@index([recipeId])
}

model Category {
  id        String     @id @default(cuid())
  name      String
  parentId  String?
  parent    Category?  @relation("CategoryTree", fields: [parentId], references: [id], onDelete: Cascade)
  children  Category[] @relation("CategoryTree")
  recipes   RecipeCategory[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  @@index([parentId])
}

model RecipeCategory {
  recipeId   String   @map("recipe_id")
  categoryId String   @map("category_id")
  recipe     Recipe   @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@id([recipeId, categoryId])
  @@index([categoryId])
}
```

**Changes to existing Recipe model:**
```prisma
model Recipe {
  // ... existing fields unchanged ...
  chapterRecipes  ChapterRecipe[]
  recipeCategories RecipeCategory[]
}
```

### IndexedDB Schema (Client-side)

New object stores added to the existing `nutrilabel-db` database (version bump to 2):

```
books:          keyPath: "id"       → RecipeBookRecord
chapters:       keyPath: "id"       → index: "by-bookId" → ChapterRecord
chapterRecipes: keyPath: "[chapterId+recipeId]" → ChapterRecipeRecord
categories:     keyPath: "id"       → index: "by-parentId" → CategoryRecord
recipeCategories: keyPath: "[recipeId+categoryId]" → RecipeCategoryRecord
```

### TypeScript Types (Shared)

```typescript
interface RecipeBook {
  id: string;
  title: string;
  description: string;
  chapters: Chapter[];
  createdAt: string;
  updatedAt: string;
}

interface Chapter {
  id: string;
  bookId: string;
  title: string;
  description: string;
  position: number;
  recipes: ChapterRecipe[];
  createdAt: string;
  updatedAt: string;
}

interface ChapterRecipe {
  chapterId: string;
  recipeId: string;
  position: number;
}

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  children: Category[];
  createdAt: string;
  updatedAt: string;
}

interface RecipeCategory {
  recipeId: string;
  categoryId: string;
}
```

## Code Style

Follow existing patterns:
- `'use client'` directive on interactive pages
- Zustand stores with `set`/`get` pattern
- shadcn/ui components (Card, Dialog, Button, Input, etc.)
- IndexedDB CRUD functions follow `storage.ts` pattern
- API routes follow existing `route.ts` pattern with Prisma

```typescript
// IndexedDB pattern (from storage.ts)
export async function getAllBooks(): Promise<RecipeBookRecord[]> {
  const db = await getDB();
  return db.getAll('books');
}

// API route pattern (from existing routes)
export async function GET(request: NextRequest) {
  const books = await prisma.recipeBook.findMany({
    include: { chapters: { orderBy: { position: 'asc' } } },
  });
  return NextResponse.json(books);
}
```

## Boundaries

- **Always:** Run `bun run build` after changes, follow existing naming conventions, use shadcn/ui components
- **Ask first:** Adding new npm dependencies, changing DB schema for existing models
- **Never:** Remove existing recipe functionality, modify the nutrition label component, commit `.env` files

## Success Criteria

1. User can create, edit, and delete Recipe Books with title and description
2. User can create, edit, delete, and reorder Chapters within a Book
3. User can add/remove recipes to/from Chapters, with ordering
4. User can create hierarchical Categories (parent/child)
5. User can assign multiple Categories to a Recipe
6. A Recipe can appear in multiple Books via different Chapters
7. Deleting a Book removes its Chapters but NOT the Recipes
8. Deleting a Chapter removes the link but NOT the Recipes
9. Data persists in both IndexedDB (client) and SQLite (server)
10. All new pages use shadcn/ui and match existing design

## Open Questions

_None remaining — all clarified with user._

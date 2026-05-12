# Spec: Render Preview & Template System

## Objective

Add a render preview system to Recipe and Book pages that shows the final presentation of a recipe or book page using user-defined templates. Templates control layout, section visibility/order, styling (colors, fonts), and page sizing. A dedicated `/settings/templates` page provides full template management (CRUD + editor with live preview). The recipe page's right column gains a "Preview" tab alongside the existing "Nutrition" view. The book detail page gets a similar preview panel.

**User Stories:**
- As a user, I want to preview how my recipe will look when rendered with a chosen template
- As a user, I want to choose from multiple built-in templates (Classic Card, Full Page, Minimal)
- As a user, I want to create and customize my own templates (section order, visibility, colors, fonts)
- As a user, I want to preview an entire book rendered with a book template
- As a user, I want to manage all templates from a dedicated settings page
- As a user, I want "Add Template" to duplicate the currently selected template so I can customize from there
- As a user, I want each recipe to default to a recipe template, and each book to default to a book template
- As a user, I want book chapters to have their own default template, with separate templates for Page-type content vs Recipe-type content within chapters
- As a user, I want to print rendered recipes/books with proper print CSS

## Tech Stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS v4 + shadcn/ui (new-york style, emerald accent, stone backgrounds)
- Zustand v5 (state management, `set`/`get` pattern)
- IndexedDB via `idb` v8 (client-side only, `nutrilabel-db` database)
- @dnd-kit/core + @dnd-kit/sortable (section reordering in template editor)
- react-markdown (rendering markdown content in book pages)
- lucide-react (icons)

## Commands

```
Dev:     npm run dev
Build:   npm run build
Lint:    npm run lint
```

## Project Structure

```
src/
  lib/
    storage.ts                  → Add `templates` object store (DB_VERSION 5), TemplateRecord type, CRUD functions, seed defaults
    template-store.ts           → NEW: Zustand store for templates (fetchTemplates, createTemplate, updateTemplate, deleteTemplate, duplicateTemplate)
    types.ts                    → Shared template types (TemplateRecord, TemplateLayout, TemplateSection, TemplateTheme)
  components/
    recipe-renderer.tsx         → NEW: Pure presentational component — renders Recipe + TemplateRecord → visual output
    book-renderer.tsx           → NEW: Pure presentational component — renders Book/Chapter + TemplateRecord → visual output
    template-editor-panel.tsx   → NEW: Left-side config panel for template editor (sections, theme, page settings)
    template-preview.tsx        → NEW: Shared live preview wrapper used by editor and preview panels
    app-nav.tsx                 → Add "Templates" tab in settings dialog linking to /settings/templates
  app/
    (app)/
      recipes/page.tsx          → Add "Preview" tab to right column, template dropdown, "Add Template" button
      books/[id]/page.tsx       → Add preview section, template dropdown, "Add Template" button
      settings/
        templates/
          page.tsx              → NEW: Template list page (card grid, filter by type, CRUD actions)
          [id]/page.tsx         → NEW: Template editor (config panel left + live preview right)
          new/page.tsx          → NEW: Create template by duplicating an existing one (accepts ?from=templateId query param)
public/
  css/print.css                 → NEW: @media print rules — hide nav/chrome, render template output at full page size
```

## Data Model

### TemplateRecord (IndexedDB)

```typescript
interface TemplateRecord {
  id: string;
  name: string;
  type: 'recipe' | 'book-page' | 'book-recipe';
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  layout: TemplateLayout;
}

// Template type semantics:
// 'recipe'      → applied to standalone recipe pages (/recipes)
// 'book-page'   → applied to Page-type content within book chapters (markdown pages)
// 'book-recipe' → applied to Recipe-type content within book chapters (embedded recipe cards)

interface TemplateLayout {
  pageSize: 'card' | 'a4' | 'letter' | 'custom';
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number };
  sections: TemplateSection[];
  theme: TemplateTheme;
}

interface TemplateSection {
  id: string;
  type: 'title' | 'ingredients' | 'instructions' | 'nutrition-label' | 'nutrition-summary' | 'servings-info' | 'image' | 'notes' | 'divider' | 'chapter-title' | 'page-content' | 'page-number' | 'custom-text';
  visible: boolean;
  order: number;
  column: 1 | 2;
  style: {
    fontSize?: number;
    fontWeight?: string;
    textAlign?: 'left' | 'center' | 'right';
    color?: string;
    showStepNumbers?: boolean;
    groupAsTabs?: boolean;
  };
}

interface TemplateTheme {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
  borderRadius: number;
}
```

### IndexedDB Schema Change

Add `templates` object store to `nutrilabel-db` at version 5:
- keyPath: `'id'`
- index: `'by-type'` on field `type` (values: `'recipe'`, `'book-page'`, `'book-recipe'`)

Migration is additive-only — no changes to existing stores.

### Template Assignment & Defaults

- **Recipes**: Each recipe starts with the first `'recipe'` template as default. No `templateId` stored on the recipe record — the selected template is session-scoped (component state).
- **Books**: The book detail page uses two template selectors — one for Page-type content and one for Recipe-type content within chapters. Both default to the first template of their respective type.
- **Chapters**: Book chapters can override the book-level defaults by setting their own default template for each content type. Store `pageTemplateId` and `recipeTemplateId` on the chapter record.
- **Fallback**: If no template matches, the first template of the correct type is used. If no templates exist at all, a hardcoded built-in default is used in the renderer.

## Code Style

Follow existing patterns exactly:

```typescript
// Storage CRUD pattern (from storage.ts)
export async function getAllTemplates(): Promise<TemplateRecord[]> {
  const db = await getDB();
  return db.getAll('templates');
}

export async function getTemplatesByType(type: 'recipe' | 'book'): Promise<TemplateRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('templates', 'by-type', type);
}

// Zustand store pattern (from recipe-store.ts / book-store.ts)
interface TemplateState {
  templates: TemplateRecord[];
  isLoading: boolean;
  error: string | null;
  fetchTemplates: () => Promise<void>;
  createTemplate: (data: Omit<TemplateRecord, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateTemplate: (id: string, data: Partial<TemplateRecord>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  duplicateTemplate: (id: string) => Promise<void>;
}

// Component pattern: 'use client' directive, shadcn/ui, Tailwind
// Colors: emerald-600 primary, stone-50 bg, stone-900 text
```

## Testing Strategy

- No automated test framework is currently configured in this project
- Verification is manual via `npm run build` (TypeScript compilation + Next.js build)
- Each task must pass `npm run build` with zero errors
- Visual verification by running `npm run dev` and checking rendered output

## Boundaries

- **Always:** Run `npm run build` after each task, follow existing Zustand/IndexedDB patterns, use shadcn/ui components, keep pages under ~300 lines by extracting components
- **Ask first:** Adding new npm dependencies, changing existing DB schema (not just adding new stores), modifying the nutrition label component's internals, changing the recipe page layout beyond the right column
- **Never:** Remove existing recipe/book functionality, commit `.env` files, add server-side storage for templates

## Success Criteria

1. User can create, edit, duplicate, and delete templates from `/settings/templates`
2. Default templates are seeded on first run (Classic Card, Full Page, Minimal for recipes; Chapter Layout, Booklet for books)
3. Recipe page right column has "Nutrition" tab (existing) and "Preview" tab (new)
4. Preview tab renders the active recipe using the selected template
5. Template dropdown lists all templates of the correct type
6. Book detail page has a preview mode that renders chapters/pages using the selected book template
7. "Add Template" button duplicates the currently selected template and opens the editor with the copy
8. Template editor is a full-page route (`/settings/templates/[id]`) with live preview side-by-side
9. Template sections can be reordered via drag-and-drop
10. Theme colors, fonts, and section styles are editable and reflected in the preview
11. IndexedDB migration from version 4 to 5 is additive-only (no data loss)
12. All builds pass with zero TypeScript errors
13. Book chapters support per-chapter default templates (page + recipe content types)
14. Print CSS produces clean output for rendered recipes and books (via `@media print` rules)
15. Recipe renderers within book chapters use `'book-recipe'` templates; page content uses `'book-page'` templates

## Open Questions

_Resolved — all decisions captured in spec._

1. **Template assignment** → Each recipe/book starts with a default template. Book chapters can override with their own defaults. No `templateId` stored on recipes — session-scoped selection. Two template types for books: `'book-page'` (for Page content) and `'book-recipe'` (for Recipe content within chapters).
2. **Template editor** → Full-page route at `/settings/templates/[id]` (side-by-side config + live preview).
3. **"Add Template" flow** → Duplicates the currently selected template and opens the editor with the copy.
4. **Print CSS** → Included in this phase via `@media print` rules that hide chrome and render the template output cleanly.

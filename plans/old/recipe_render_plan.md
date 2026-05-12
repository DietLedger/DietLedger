# Implementation Plan: Render Preview & Template System

## Overview

Add a render preview system to Recipe and Book pages that shows the final presentation of a recipe or book page using user-defined templates. Templates control layout, section visibility/order, styling (colors, fonts), and page sizing. A dedicated `/settings/templates` page provides full template management (CRUD + editor with live preview). The recipe page's right column gains a "Preview" tab alongside the existing "Nutrition" view. The book detail page gets a preview panel with dual template selectors (one for Page-type content, one for Recipe-type content within chapters). Book chapters can override book-level template defaults.

## Architecture Decisions

- **Templates stored in IndexedDB** — new `templates` object store in `nutrilabel-db` (DB_VERSION 5). Additive-only migration.
- **Three template types** — `'recipe'` (standalone recipe pages), `'book-page'` (markdown page content within chapters), `'book-recipe'` (recipe cards within chapters). This replaces the original 2-type model and allows distinct layouts for each content kind.
- **Templates are JSON documents** — structured layout config (sections, order, styling). Rendering is purely React-driven.
- **Session-scoped template selection** — no `templateId` stored on recipe records. The selected template lives in component state and defaults to the first template of the correct type. Chapters are the exception: they store `pageTemplateId` and `recipeTemplateId` to override book-level defaults.
- **"Add Template" duplicates current template** — the button copies the currently selected template and opens the editor with the duplicate.
- **Zustand store for templates** — `template-store.ts` following the same `set`/`get` pattern as `recipe-store.ts` and `book-store.ts`.
- **Full-page template editor** — `/settings/templates/[id]` with config panel left + live preview right. Better UX than a modal for side-by-side editing.
- **Print CSS included** — `public/css/print.css` with `@media print` rules that hide chrome and render template output at full page size.
- **dnd-kit for section reordering** — `@dnd-kit/core` + `@dnd-kit/sortable` for drag-and-drop in the template editor.

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

### Chapter Schema Extension

Add to the `chapters` record (not a new store — fields added to existing records):

```typescript
interface Chapter {
  // ... existing fields ...
  pageTemplateId?: string;    // override for 'book-page' content
  recipeTemplateId?: string;  // override for 'book-recipe' content
}
```

These fields are optional. When absent, the book-level defaults are used. When present, they override the book-level defaults for that chapter's content rendering.

### Template Assignment & Defaults

- **Recipes**: Session-scoped — no `templateId` on recipe record. Defaults to first `'recipe'` template.
- **Books**: Two template selectors on the book detail page — one for `'book-page'` content and one for `'book-recipe'` content. Both default to the first template of their respective type. Session-scoped.
- **Chapters**: Can override book-level defaults by storing `pageTemplateId` and `recipeTemplateId` on the chapter record.
- **Fallback**: If no template matches, use the first template of the correct type. If no templates exist at all, use a hardcoded built-in default in the renderer.

## Dependency Graph

```
Types (types.ts: TemplateRecord, TemplateLayout, TemplateSection, TemplateTheme)
    │
    ├── IndexedDB schema (DB_VERSION 5 + templates store)
    │       │
    │       ├── Storage CRUD (storage.ts: template functions + seed defaults)
    │       │       │
    │       │       └── Template Zustand store (template-store.ts)
    │       │               │
    │       │               ├── Template Settings page (/settings/templates)
    │       │               │       └── Template editor (/settings/templates/[id])
    │       │               │               └── New template (/settings/templates/new)
    │       │               │
    │       │               ├── Recipe page preview (uses recipe-renderer)
    │       │               │
    │       │               └── Book detail page preview (uses book-renderer)
    │       │
    │       └── Chapter schema extension (pageTemplateId, recipeTemplateId)
    │
    ├── Recipe render engine (recipe-renderer.tsx)
    │
    ├── Book render engine (book-renderer.tsx ← reuses recipe-renderer)
    │
    ├── Template preview wrapper (template-preview.tsx)
    │
    └── Print CSS (public/css/print.css)
```

## Task List

### Phase 1: Foundation (Types, Storage & Store)

#### Task 1: Shared template types

**Description:** Add `TemplateRecord`, `TemplateLayout`, `TemplateSection`, and `TemplateTheme` interfaces to `src/lib/types.ts`. These are the canonical type definitions used by storage, store, renderer, and UI components.

**Acceptance criteria:**
- [ ] All four interfaces exported from `types.ts`
- [ ] `type` field uses union `'recipe' | 'book-page' | 'book-recipe'`
- [ ] `TemplateSection.type` includes all 12 section types from spec
- [ ] `TemplateSection.column` is typed as `1 | 2`

**Verification:**
- [ ] Build succeeds: `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/lib/types.ts`

**Estimated scope:** XS (1 file)

---

#### Task 2: Add `templates` IndexedDB store

**Description:** Bump `DB_VERSION` from 4 to 5 in `storage.ts`. Add a `templates` object store with `keyPath: 'id'` and index `by-type` on the `type` field. Register the store in the `NutriLabelDB` interface.

**Acceptance criteria:**
- [ ] `DB_VERSION` is 5
- [ ] `templates` object store created with keyPath `id` in `oldVersion < 5` upgrade block
- [ ] Index `by-type` created on `type` field
- [ ] `NutriLabelDB` interface includes `templates: IDBPObjectStore`
- [ ] Existing upgrade path for versions 1–4 untouched
- [ ] Migration is additive-only (no data loss)

**Verification:**
- [ ] Build succeeds: `npm run build`

**Dependencies:** Task 1

**Files likely touched:**
- `src/lib/storage.ts`

**Estimated scope:** S (1 file)

---

#### Task 3: Template CRUD in storage layer + seed defaults

**Description:** Add 6 CRUD functions to `storage.ts`: `getAllTemplates()`, `getTemplatesByType(type)`, `getTemplate(id)`, `createTemplate(data)`, `updateTemplate(id, data)`, `deleteTemplate(id)`. Add seed logic for default templates that runs when no templates exist yet.

**Seed templates:**
- **Classic Card** (`recipe`) — Title top, 2-col layout (ingredients left, instructions right), nutrition label bottom. Card size, emerald accent.
- **Full Page** (`recipe`) — Title centered, ingredients + instructions stacked. Letter size, portrait.
- **Minimal** (`recipe`) — Title, ingredients list, instructions only. No nutrition. Card size.
- **Chapter Layout** (`book-page`) — Chapter title top, page content below with page numbers. A4 portrait.
- **Booklet** (`book-recipe`) — Compact recipe card for embedding in chapters. Card size, smaller fonts.

**Acceptance criteria:**
- [ ] All 6 CRUD functions work and persist to IndexedDB
- [ ] `getTemplatesByType('recipe')` returns only `recipe`-type templates
- [ ] `getTemplatesByType('book-page')` returns only `book-page`-type templates
- [ ] `getTemplatesByType('book-recipe')` returns only `book-recipe`-type templates
- [ ] 5 default templates seeded on first run (when `getAllTemplates()` returns empty)
- [ ] Each seed template has `isDefault: true` and distinct section layouts

**Verification:**
- [ ] Build succeeds: `npm run build`

**Dependencies:** Task 2

**Files likely touched:**
- `src/lib/storage.ts`

**Estimated scope:** S (1 file)

---

#### Task 4: Template Zustand store

**Description:** Create `src/lib/template-store.ts` with a Zustand store following the existing `set`/`get` pattern. State: `templates`, `isLoading`, `error`. Actions: `fetchTemplates()`, `createTemplate()`, `updateTemplate()`, `deleteTemplate()`, `duplicateTemplate(id)`.

**Acceptance criteria:**
- [ ] Store follows same pattern as `recipe-store.ts` and `book-store.ts`
- [ ] `fetchTemplates()` loads all templates from IndexedDB into state
- [ ] `createTemplate()` generates UUID via `crypto.randomUUID()`, persists to IndexedDB
- [ ] `updateTemplate()` merges partial data and persists
- [ ] `deleteTemplate()` removes from IndexedDB and state
- [ ] `duplicateTemplate(id)` copies the template with name suffix " (Copy)", new UUID + timestamps
- [ ] Error handling wraps all async actions (try/catch, `error` state field)
- [ ] Import DB functions with `as dbXxx` alias pattern

**Verification:**
- [ ] Build succeeds: `npm run build`

**Dependencies:** Task 3

**Files likely touched:**
- `src/lib/template-store.ts` (new file)

**Estimated scope:** S (1 file)

---

### Checkpoint: Foundation

- [ ] All types compile without errors
- [ ] Default templates seed correctly on fresh DB
- [ ] Template CRUD works through the Zustand store
- [ ] Build succeeds with no errors

---

### Phase 2: Render Engine

#### Task 5: Recipe render engine

**Description:** Create `src/components/recipe-renderer.tsx` — a pure presentational component that takes a recipe object and a `TemplateRecord`, then renders the final visual output. Interprets the template layout: renders sections in order, applies theme styles, supports 1/2-column layouts, and handles all recipe section types.

**Acceptance criteria:**
- [ ] Renders recipe title, ingredients (with groups), instructions (with groups and step numbers), nutrition label/summary, servings info, image, notes
- [ ] Respects section `visible` toggles (hidden sections not rendered)
- [ ] Respects section `order` from template
- [ ] Applies `TemplateTheme` (primaryColor, backgroundColor, textColor, accentColor, fontFamily, borderRadius)
- [ ] Applies per-section `style` (fontSize, fontWeight, textAlign, color, showStepNumbers)
- [ ] Supports 2-column layout via `column` field (sections with `column: 1` go left, `column: 2` go right)
- [ ] Handles page sizes: `card` (compact), `a4`/`letter` (full page with margins), `custom`
- [ ] Gracefully handles missing/undefined template (falls back to hardcoded built-in default)
- [ ] Component is pure presentational — no side effects, no state

**Verification:**
- [ ] Build succeeds: `npm run build`

**Dependencies:** Task 1 (types)

**Files likely touched:**
- `src/components/recipe-renderer.tsx` (new file)

**Estimated scope:** M (1 file, complex)

---

#### Task 6: Book render engine

**Description:** Create `src/components/book-renderer.tsx` — renders a book chapter/page using a `TemplateRecord`. Handles chapter titles, page content (markdown via `react-markdown`), nested recipe cards (reuses `recipe-renderer.tsx` with `'book-recipe'` templates), and page numbers. Takes merged chapter items and applies the appropriate template based on item type.

**Acceptance criteria:**
- [ ] Renders chapter title with template styling
- [ ] Renders markdown page content using `'book-page'` template sections and theme
- [ ] Renders recipe cards within chapters by delegating to `recipe-renderer.tsx` with `'book-recipe'` template
- [ ] Supports `page-number` section type (displays sequential page numbers)
- [ ] Applies `TemplateTheme` consistently
- [ ] Falls back to hardcoded built-in default template if none provided

**Verification:**
- [ ] Build succeeds: `npm run build`

**Dependencies:** Task 5 (recipe-renderer)

**Files likely touched:**
- `src/components/book-renderer.tsx` (new file)

**Estimated scope:** M (1 file)

---

#### Task 7: Shared template preview wrapper

**Description:** Create `src/components/template-preview.tsx` — a shared wrapper component used by both the template editor and the preview panels. Handles the container styling (page size simulation, border/shadow), and delegates to `recipe-renderer` or `book-renderer` based on template type. Provides sample data for the editor's live preview.

**Acceptance criteria:**
- [ ] Renders a visual "page" container with correct sizing based on `pageSize`
- [ ] Delegates to `recipe-renderer` for `'recipe'` and `'book-recipe'` template types
- [ ] Delegates to `book-renderer` for `'book-page'` template types
- [ ] Provides built-in sample recipe/book data for editor live preview
- [ ] Accepts optional `recipe` or `chapter` prop to preview real data when available
- [ ] Scales output to fit container (CSS transform scale for page-size simulation)

**Verification:**
- [ ] Build succeeds: `npm run build`

**Dependencies:** Task 5, Task 6

**Files likely touched:**
- `src/components/template-preview.tsx` (new file)

**Estimated scope:** S (1 file)

---

### Checkpoint: Render Engine

- [ ] Both renderers produce visual output from template + data
- [ ] Default templates render without errors
- [ ] Sample data renders in the preview wrapper
- [ ] Build succeeds with no errors

---

### Phase 3: Template Settings Pages

#### Task 8: Template list page `/settings/templates`

**Description:** Create `src/app/(app)/settings/templates/page.tsx` — a card grid listing all templates, filterable by type. Three filter tabs: "Recipe", "Book Pages", "Book Recipes". Each card shows name, type badge, default indicator, and action buttons (edit, duplicate, delete). "Create Template" button at top (navigates to `/settings/templates/new`).

**Acceptance criteria:**
- [ ] Route `/settings/templates` renders the template list page
- [ ] Templates displayed in a card grid (3-column on desktop)
- [ ] Filter tabs: "Recipe" (`recipe`), "Book Pages" (`book-page`), "Book Recipes" (`book-recipe`)
- [ ] Each card shows: name, type badge, "(Default)" indicator if `isDefault`
- [ ] Action buttons: edit (→ `/settings/templates/[id]`), duplicate (calls `duplicateTemplate`), delete (with confirmation dialog)
- [ ] "Create Template" button at top → navigates to `/settings/templates/new`
- [ ] Page uses existing visual style (emerald accent, stone backgrounds, shadcn/ui)

**Verification:**
- [ ] Build succeeds: `npm run build`
- [ ] Page renders at `/settings/templates`

**Dependencies:** Task 4

**Files likely touched:**
- `src/app/(app)/settings/templates/page.tsx` (new file)

**Estimated scope:** M (1 file)

---

#### Task 9: Template editor page `/settings/templates/[id]`

**Description:** Create `src/app/(app)/settings/templates/[id]/page.tsx` — full-page editor with config panel on the left and live preview on the right. The config panel (`template-editor-panel.tsx`) includes section management (toggle visibility, reorder via drag-and-drop with dnd-kit), section style controls, theme controls (color pickers, font selector, border radius slider), and page size/orientation selectors. The preview panel uses the shared `template-preview.tsx`.

**Acceptance criteria:**
- [ ] Editor loads the template by `id` from URL param
- [ ] Left panel: name field, type display (read-only), section list with drag-to-reorder (dnd-kit)
- [ ] Section items: toggle visibility, expand for style controls (fontSize, fontWeight, textAlign, color, showStepNumbers, groupAsTabs)
- [ ] Theme controls: primaryColor, backgroundColor, textColor, accentColor (color inputs), fontFamily (select), borderRadius (slider)
- [ ] Page settings: pageSize (select), orientation (toggle), margins (number inputs)
- [ ] Right panel: live preview via `template-preview.tsx` using sample data
- [ ] All changes reflected in real-time in the preview
- [ ] "Save" button persists changes via `updateTemplate()`
- [ ] "Back" navigation returns to template list
- [ ] Page stays under ~300 lines (extract `template-editor-panel.tsx`)

**Verification:**
- [ ] Build succeeds: `npm run build`
- [ ] Editor loads, edits, and saves correctly

**Dependencies:** Task 7 (template-preview), Task 8

**Files likely touched:**
- `src/app/(app)/settings/templates/[id]/page.tsx` (new file)
- `src/components/template-editor-panel.tsx` (new file)

**Estimated scope:** L (2 files, complex) — consider splitting panel into sub-components

---

#### Task 10: New template page `/settings/templates/new`

**Description:** Create `src/app/(app)/settings/templates/new/page.tsx` — duplicates an existing template and opens the editor with the copy. Accepts `?from=templateId` query param. If `from` is provided, duplicates that template and redirects to the editor. If no `from`, shows a type selector (recipe / book-page / book-recipe), then creates a new template with sensible defaults and redirects to the editor.

**Acceptance criteria:**
- [ ] `/settings/templates/new?from=abc123` duplicates template `abc123` and redirects to `/settings/templates/[newId]`
- [ ] `/settings/templates/new` (no param) shows type selector, creates template with defaults for that type, redirects to editor
- [ ] Duplicated template gets name "Original Name (Copy)"
- [ ] Duplicated template has `isDefault: false`
- [ ] After creation, user lands in the editor ready to customize

**Verification:**
- [ ] Build succeeds: `npm run build`
- [ ] Full flow: list → "Create" → type select → editor

**Dependencies:** Task 9

**Files likely touched:**
- `src/app/(app)/settings/templates/new/page.tsx` (new file)

**Estimated scope:** S (1 file)

---

#### Task 11: Update navigation for templates

**Description:** Add a "Templates" tab to the existing settings dialog in `app-nav.tsx`. The tab links to `/settings/templates`. Also add the link to `public/css/print.css` import in the root layout.

**Acceptance criteria:**
- [ ] Settings dialog has a new "Templates" tab (4th tab after General, Food Database, Categories)
- [ ] "Templates" tab content shows a link/button to "Manage Templates" → navigates to `/settings/templates`
- [ ] Breadcrumbs work for `/settings/templates/*` routes
- [ ] Navigation closes the dialog when template link is clicked

**Verification:**
- [ ] Build succeeds: `npm run build`
- [ ] Navigation from settings dialog to templates page works

**Dependencies:** Task 8

**Files likely touched:**
- `src/components/app-nav.tsx`

**Estimated scope:** S (1 file)

---

### Checkpoint: Template Management

- [ ] Can list, create, edit, duplicate, and delete templates from `/settings/templates`
- [ ] Default templates are visible and editable
- [ ] Live preview updates in the editor
- [ ] Navigation from settings dialog reaches template pages
- [ ] Build succeeds with no errors

---

### Phase 4: Preview Integration

#### Task 12: Recipe page preview tab

**Description:** Integrate the recipe renderer into the recipe page's right column (`src/app/(app)/recipes/page.tsx`). Convert the right column from a single nutrition label card to a tabbed interface with "Nutrition" tab (existing) and "Preview" tab (new). The Preview tab shows a template dropdown, an "Add Template" button, and the rendered recipe using the selected `'recipe'` template.

**Acceptance criteria:**
- [ ] Right column has Tabs: "Nutrition" (existing content) and "Preview" (new)
- [ ] Preview tab shows template dropdown listing all `'recipe'`-type templates
- [ ] Preview tab renders the active recipe using the selected template via `template-preview.tsx`
- [ ] Selected template is session-scoped (component state, not saved to recipe)
- [ ] Defaults to first `'recipe'` template if none selected
- [ ] "Add Template" button next to dropdown → navigates to `/settings/templates/new?from=[selectedTemplateId]`
- [ ] Falls back to first default template if no templates exist
- [ ] Existing nutrition label behavior preserved exactly on the "Nutrition" tab

**Verification:**
- [ ] Preview renders the active recipe correctly
- [ ] Switching templates updates the preview
- [ ] Nutrition tab is unchanged
- [ ] Build succeeds: `npm run build`

**Dependencies:** Task 4, Task 7

**Files likely touched:**
- `src/app/(app)/recipes/page.tsx`

**Estimated scope:** M (1 file, but large — extract preview panel if needed)

---

#### Task 13: Book detail page preview panel

**Description:** Integrate the book renderer into the book detail page (`src/app/(app)/books/[id]/page.tsx`). Add a "Preview" section/toggle that renders all chapters and their content using selected templates. Two template dropdowns: one for Page-type content (`'book-page'` templates) and one for Recipe-type content (`'book-recipe'` templates). Both default to the first template of their respective type. Include "Add Template" buttons next to each dropdown.

**Acceptance criteria:**
- [ ] Book detail page has a "Preview" mode/toggle
- [ ] Preview renders all chapters using the book renderer
- [ ] Page-type chapter items rendered with selected `'book-page'` template
- [ ] Recipe-type chapter items rendered with selected `'book-recipe'` template
- [ ] Two template dropdowns with labels: "Page Template" and "Recipe Template"
- [ ] Each dropdown has an "Add Template" button → `/settings/templates/new?from=[selectedId]`
- [ ] Selection is session-scoped (component state)
- [ ] Falls back to first template of each type

**Verification:**
- [ ] Preview renders book content correctly with both template types
- [ ] Switching either template updates the relevant sections
- [ ] Build succeeds: `npm run build`

**Dependencies:** Task 4, Task 6, Task 7

**Files likely touched:**
- `src/app/(app)/books/[id]/page.tsx`

**Estimated scope:** M (1 file)

---

### Checkpoint: Preview Integration

- [ ] Recipe page has working Nutrition + Preview tabs
- [ ] Book page has working preview with dual template selectors
- [ ] Template selection updates preview in real-time
- [ ] "Add Template" buttons navigate correctly
- [ ] Build succeeds with no errors

---

### Phase 5: Chapter Template Overrides

#### Task 14: Add template IDs to chapter records

**Description:** Extend the `chapters` record in IndexedDB to support optional `pageTemplateId` and `recipeTemplateId` fields. Since IndexedDB is schemaless for record fields, no store-level migration is needed — just update the TypeScript types and storage functions. Update `Chapter` interface in `types.ts`, update the book store to handle these fields, and update the book renderer to use chapter-level overrides.

**Acceptance criteria:**
- [ ] `Chapter` interface has optional `pageTemplateId?: string` and `recipeTemplateId?: string`
- [ ] Storage functions for chapters handle the new fields (no store migration needed)
- [ ] Book renderer checks chapter-level template IDs before falling back to book-level defaults
- [ ] Existing chapters without these fields continue to work (backward compatible)

**Verification:**
- [ ] Build succeeds: `npm run build`
- [ ] Existing books/chapters render correctly (no regression)

**Dependencies:** Task 6, Task 13

**Files likely touched:**
- `src/lib/types.ts`
- `src/lib/book-store.ts`
- `src/components/book-renderer.tsx`

**Estimated scope:** S (3 files)

---

#### Task 15: Chapter template override UI

**Description:** Add template override selectors to the book detail page's chapter sections. When a chapter is expanded, show two small dropdowns for "Page Template" and "Recipe Template" with a "Use book default" option. Allow setting per-chapter template overrides that persist via `updateChapter`.

**Acceptance criteria:**
- [ ] Each expanded chapter shows template override controls
- [ ] Two dropdowns: Page Template (`'book-page'` type) and Recipe Template (`'book-recipe'` type)
- [ ] "Use book default" option (sets field to `undefined`)
- [ ] Selecting a template persists `pageTemplateId` / `recipeTemplateId` on the chapter record
- [ ] Preview panel respects chapter overrides when rendering
- [ ] Controls are unobtrusive (collapsible or compact)

**Verification:**
- [ ] Build succeeds: `npm run build`
- [ ] Chapter template overrides persist and affect preview

**Dependencies:** Task 14

**Files likely touched:**
- `src/app/(app)/books/[id]/page.tsx`
- `src/lib/book-store.ts`

**Estimated scope:** M (2 files)

---

### Checkpoint: Chapter Templates

- [ ] Chapters can override book-level template defaults
- [ ] Overrides persist and apply in preview
- [ ] Existing books/chapters unaffected
- [ ] Build succeeds with no errors

---

### Phase 6: Polish & Print

#### Task 16: Print CSS

**Description:** Create `public/css/print.css` with `@media print` rules. Hide all navigation chrome (app-nav, breadcrumbs, settings dialog, sidebar, page controls). Render the template output at full page size. Import in the root layout.

**Acceptance criteria:**
- [ ] `public/css/print.css` exists with `@media print` rules
- [ ] Nav, breadcrumbs, dialogs, and non-content chrome hidden in print mode
- [ ] Template output renders at full page width/height
- [ ] Imported in `src/app/layout.tsx` (or `globals.css`)
- [ ] Print preview (Ctrl+P) shows clean recipe/book output

**Verification:**
- [ ] Build succeeds: `npm run build`
- [ ] Print preview shows clean output (visual check)

**Dependencies:** Task 12, Task 13

**Files likely touched:**
- `public/css/print.css` (new file)
- `src/app/layout.tsx` or `src/app/globals.css` (import)

**Estimated scope:** S (2 files)

---

#### Task 17: Finalize seed templates

**Description:** Polish the 5 built-in default templates with refined section layouts, sensible style defaults, and proper theme colors. Ensure each template is visually distinct and handles edge cases (long titles, many ingredients, empty sections).

**Acceptance criteria:**
- [ ] "Classic Card" has polished 2-col layout with nutrition label
- [ ] "Full Page" has clean single-col layout with generous spacing
- [ ] "Minimal" has compact layout with essential sections only
- [ ] "Chapter Layout" handles page content and page numbers well
- [ ] "Booklet" renders compact recipe cards suitable for chapter embedding
- [ ] All templates handle edge cases: long names, empty instructions, many ingredients

**Verification:**
- [ ] Visual review of each template with sample data
- [ ] Build succeeds: `npm run build`

**Dependencies:** Task 3, Task 5, Task 6

**Files likely touched:**
- `src/lib/storage.ts` (seed data)

**Estimated scope:** S (1 file)

---

### Checkpoint: Complete

- [ ] All 17 tasks completed
- [ ] All success criteria from spec met
- [ ] Build succeeds with zero TypeScript errors
- [ ] Manual visual verification passed

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Render engine complexity — 2-column layouts, responsive sizing | Medium | Start with single-column, add 2-column as enhancement. Use CSS Grid. |
| Template editor UX — many controls can overwhelm | Medium | Use collapsible sections in `template-editor-panel.tsx`. Default everything to sensible values. |
| IndexedDB migration — DB_VERSION bump must not break existing data | High | Follow existing upgrade pattern; additive only (new store + new optional fields on schemaless records). |
| Large file sizes — recipes page is already 1578 lines | Medium | Extract preview panel into separate component. Keep page file as orchestrator. |
| dnd-kit integration — new dependency for section reordering | Low | Already approved by spec (`@dnd-kit/core` + `@dnd-kit/sortable`). Install as first step of Task 9. |
| Chapter template overrides — modifying existing store records | Medium | IndexedDB is schemaless — just add optional fields. No store-level migration needed. |

## Open Questions

All resolved per spec:

1. **Template assignment** → Session-scoped for recipes/books. Chapters store `pageTemplateId` and `recipeTemplateId` as overrides.
2. **Template editor** → Full-page route at `/settings/templates/[id]` (side-by-side config + live preview).
3. **"Add Template" flow** → Duplicates the currently selected template and opens the editor with the copy.
4. **Print CSS** → Included via `@media print` rules in `public/css/print.css`.
5. **Template types** → Three types: `'recipe'`, `'book-page'`, `'book-recipe'` for distinct content rendering.

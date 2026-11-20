# Bug Fix Plan: 6 Issues

## Issues Tracked (6 total)

| # | Issue | File(s) |
|---|-------|---------|
| 1 | Main page recipe links should deep-link to Kitchen Helper with recipe loaded and Play button ready | `app/page.tsx`, `kitchen-helper/page.tsx` |
| 2 | Meal plan page: nutrition label should be to the right of the food list; background block must contain both | `meal-plans/[weekStart]/page.tsx` |
| 3 | Leftover button: ensure it's on ALL entries (including grouped), excludes from nutrition + grocery list; provide verification test | `meal-plans/[weekStart]/page.tsx`, `grocery-list/[weekStart]/page.tsx` |
| 4 | Kitchen Helper Select Meal: sort by date, display date, remove past dates | `kitchen-helper/page.tsx` |
| 5 | Kitchen Helper Play mode: remove instruction name, show only step number + text | `kitchen-helper/page.tsx` |
| 6 | Kitchen Helper Previous button: mark current step as incomplete, reduce completed count | `kitchen-helper/page.tsx` |

---

## Task List

### Task 1: Deep-link from main page to Kitchen Helper with recipe loaded

**Description:** When a user clicks a recipe in the "Today's Meal Plan" section on the main page, they should land on the Kitchen Helper page with that recipe already selected and the Play button ready to press.

**Root cause:** The main page already links to `/kitchen-helper?recipeId=${entry.recipeId}`, but the Kitchen Helper page never reads the `recipeId` query parameter from the URL. It always starts in selection mode.

**Changes:**

**File: `src/app/(app)/kitchen-helper/page.tsx`**
- Import `useSearchParams` from `next/navigation`
- On mount, read `recipeId` from search params
- If `recipeId` is present, set `selectedRecipeId` to that value (pre-selecting the recipe)
- Determine mode: if `recipeId` exists, use `'recipe'` mode (or `'today'` if the recipe is from today's meal plan — simpler to just use `'recipe'` mode)
- The user lands with the recipe already selected, seeing the step list + Play button

**Implementation:**
```ts
const searchParams = useSearchParams();
const initialRecipeId = searchParams.get('recipeId');

useEffect(() => {
  if (initialRecipeId && recipes.length > 0) {
    const exists = recipes.find(r => r.id === initialRecipeId);
    if (exists) {
      setSelectedRecipeId(initialRecipeId);
      setMode('recipe');
    }
  }
}, [initialRecipeId, recipes]);
```

**Acceptance criteria:**
- [ ] Clicking a recipe in "Today's Meal Plan" on the main page navigates to Kitchen Helper
- [ ] The recipe is already selected (step list + Play button visible)
- [ ] No manual selection required — user can immediately hit Play
- [ ] Direct URL `http://localhost:3000/kitchen-helper?recipeId=xxx` also works
- [ ] If recipe ID is invalid, falls through to normal selection mode

**Verification:**
1. Go to main page — ensure today has meal plan entries
2. Click a recipe in "Today's Meal Plan"
3. Verify you land on Kitchen Helper with recipe selected and Play button visible

**Dependencies:** None

**Estimated scope:** S (1 file)

**Files likely touched:**
- `src/app/(app)/kitchen-helper/page.tsx`

---

### Task 2: Nutrition label side-by-side with food list on meal plan page

**Description:** On the meal plan page (`/meal-plans/2026-04-27`), when a recipe or meal group is selected, the nutrition label should appear to the right of the food/recipe list. The background card must expand to contain both.

**Root cause:** The right-side panel (`lg:col-span-1`) currently stacks content vertically: recipe info/servings on top, then `NutritionLabel` below. The `NutritionLabel` has a fixed `width: 280px` in inline styles. The panel needs a horizontal layout with the food list on the left and the label on the right, inside a single expanded card.

**Changes:**

**File: `src/app/(app)/meal-plans/[weekStart]/page.tsx`**

For single recipe selection (lines ~499-537):
- Change the layout from stacked to a `flex flex-row` or `grid grid-cols-[auto_1fr]` layout
- Left side: recipe name + servings stepper
- Right side: `<NutritionLabel>` (its natural 280px width)
- Wrap both in the same card; the card should have `flex` or grid layout

For meal group selection (lines ~539-579):
- Left side: group name + per-recipe steppers list
- Right side: combined `<NutritionLabel>`
- Same horizontal layout

Specifically, change the Card content structure from:
```
<Card>
  <div>recipe info + servings</div>
  <div><NutritionLabel /></div>
</Card>
```
To:
```
<Card>
  <div className="flex gap-4">
    <div className="flex-1 min-w-0">recipe info + servings</div>
    <div className="shrink-0"><NutritionLabel /></div>
  </div>
</Card>
```

Also ensure the outer grid gives enough room. Currently `grid-cols-1 lg:grid-cols-3` with the right panel at `lg:col-span-1` gives ~33% of a `max-w-7xl` container (~380px). With the food list + 280px label, this may need to be wider. Options:
- Change to `lg:grid-cols-[2fr_1fr]` or `lg:grid-cols-[1fr_420px]` to give the right panel more space
- Or change to a 2-column layout: `lg:grid-cols-[1fr_auto]` where the right panel is auto-sized

**Acceptance criteria:**
- [ ] Single recipe: food list/servings on left, NutritionLabel on right, same card
- [ ] Meal group: recipe list + steppers on left, combined NutritionLabel on right, same card
- [ ] Background card expands to contain both side-by-side
- [ ] No horizontal overflow or clipping of the NutritionLabel
- [ ] Empty state unchanged ("Select a meal or entry to view nutrition")
- [ ] Responsive: on smaller screens, falls back to stacked layout

**Verification:**
1. Navigate to `/meal-plans/2026-04-27` (or any week with a meal plan)
2. Click a day, then click a recipe entry
3. Verify the nutrition label appears to the right of the food info
4. Click a meal group — verify same side-by-side layout

**Dependencies:** None

**Estimated scope:** S (1 file, layout changes)

**Files likely touched:**
- `src/app/(app)/meal-plans/[weekStart]/page.tsx`

---

### Task 3: Leftover button — ensure universal presence + correct exclusion behavior

**Description:** The leftover button (fork-crossed icon) must appear on every recipe entry in the meal plan, whether it's an ungrouped entry or part of a meal group. When toggled on, the recipe's nutrition must be excluded from the nutrition label, and its ingredients must be excluded from the grocery list.

**Root cause analysis:**

1. **Button missing on grouped entries:** The `EntryRow` component (line 742-752) renders entries inside a meal group but has NO leftover toggle button. Only the `SortableEntryRow` component (line 658-739) has the leftover toggle. Entries inside groups are rendered via `EntryRow` which is a display-only component.

2. **Grocery list already filters leftovers:** The grocery list page correctly filters `nonLeftoverEntries` (line 65: `entries.filter((e) => !e.isLeftover)`). This works for the grocery list.

3. **Nutrition already filters leftovers for groups:** The `getCombinedNutrition` function (line 218-243) already filters `entries.filter((e) => !e.isLeftover)`. But for single entry selection, the nutrition always shows regardless of leftover status — this may or may not be desired (the user's description says "the recipe should be removed from the nutrition facts label to the right").

**Changes:**

**File: `src/app/(app)/meal-plans/[weekStart]/page.tsx`**

A. Add leftover toggle to `EntryRow` component (entries inside groups):
- The `EntryRow` component needs an `onToggleLeftover` prop and an interactive button
- Change from a plain `<div>` to an interactive row with the leftover button
- Pass `onToggleLeftover` from the group rendering section (line ~424-436)
- The group entries currently don't have event handlers for leftovers — need to wire them up

B. For single entry selection: if the selected entry has `isLeftover: true`, show a visual indicator on the nutrition panel (e.g., dimmed with "Leftover — nutrition excluded" message) or hide the nutrition entirely.

C. For group selection: already works via `getCombinedNutrition` filtering.

**File: `src/app/(app)/meal-plans/grocery-list/[weekStart]/page.tsx`**
- Already filters `nonLeftoverEntries` — verify this is working correctly. No changes needed unless testing reveals issues.

**Implementation for EntryRow:**
```tsx
function EntryRow({ entry, recipeName, onToggleLeftover }: { 
  entry: DayPlanEntryRecord; 
  recipeName: string; 
  onToggleLeftover?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-sm text-stone-600">
      {entry.isLeftover && <UtensilsCrossed className="w-3 h-3 text-amber-500 shrink-0" />}
      <span className="flex-1 truncate">{recipeName}</span>
      {entry.servings > 1 && (
        <Badge variant="secondary" className="text-xs h-4">×{entry.servings}</Badge>
      )}
      <Button
        variant="ghost"
        size="sm"
        className={`h-5 w-5 p-0 ${entry.isLeftover ? 'text-amber-500' : 'text-stone-300 hover:text-amber-400'}`}
        onClick={(e) => { e.stopPropagation(); onToggleLeftover?.(); }}
        title={entry.isLeftover ? 'Leftovers (click to unset)' : 'Mark as leftovers'}
      >
        <UtensilsCrossed className="w-3 h-3" />
      </Button>
    </div>
  );
}
```

And wire it up in the group rendering:
```tsx
{groupEnts.map((entry) => {
  const recipe = recipes.find(r => r.id === entry.recipeId);
  return (
    <EntryRow
      key={entry.id}
      entry={entry}
      recipeName={recipe?.name || 'Unknown Recipe'}
      onToggleLeftover={() => toggleLeftover(entry.id)}
    />
  );
})}
```

Also update the single-entry nutrition display: if the selected entry is a leftover, show a message instead of the label:
```tsx
{selectedEntry && (() => {
  if (selectedEntry.isLeftover) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-amber-600">Marked as leftovers</p>
        <p className="text-xs text-stone-400">Nutrition excluded from totals</p>
      </div>
    );
  }
  // ... existing nutrition display
})()}
```

**Acceptance criteria:**
- [ ] Every ungrouped entry has a leftover toggle button
- [ ] Every entry inside a meal group has a leftover toggle button
- [ ] Toggling leftover persists across page reloads
- [ ] Leftover entries show the fork-crossed icon in amber
- [ ] Group nutrition label excludes leftover entries from the combined total
- [ ] Single-entry nutrition panel shows "Leftovers" message when the entry is marked
- [ ] Grocery list excludes all leftover entries from ingredient aggregation

**Manual Verification Test:**

**Setup:**
1. Navigate to the meal plan page for the current week
2. Click a day to expand it
3. Add 3 recipes to the same slot (e.g., Morning) — call them Recipe A, Recipe B, Recipe C
4. Group Recipe A + Recipe B together as "Test Group"

**Test — Leftover button visible on all entries:**
1. Verify Recipe C (ungrouped) has the fork-crossed icon button
2. Verify Recipe A and Recipe B (inside the group) each have the fork-crossed icon button
3. If any entry is missing the button, this is a BUG

**Test — Leftover excludes from nutrition:**
1. Click the group "Test Group" to select it
2. Note the combined nutrition values (e.g., calories = X)
3. Click the leftover button on Recipe A (inside the group)
4. The combined nutrition should decrease — Recipe A's calories/fat/etc. are now excluded
5. Note the new calories = Y. Verify Y < X.
6. Click the leftover button on Recipe C (ungrouped entry)
7. Click Recipe C to select it
8. The nutrition panel should show a "Leftovers — nutrition excluded" message instead of the label

**Test — Leftover excludes from grocery list:**
1. Before toggling any leftovers, go to the Grocery List page for this week
2. Note all the ingredients listed (take a screenshot or count them)
3. Go back to the meal plan
4. Toggle Recipe A as leftover
5. Go back to the Grocery List
6. Verify Recipe A's ingredients are now MISSING from the list
7. Verify Recipe B's and Recipe C's ingredients are still present

**Test — Persistence:**
1. Toggle Recipe B as leftover
2. Refresh the page (F5)
3. Verify Recipe A and Recipe B still show the amber leftover icon
4. Go to Grocery List — verify both Recipe A and B's ingredients are excluded

**Dependencies:** None

**Estimated scope:** S (1-2 files)

**Files likely touched:**
- `src/app/(app)/meal-plans/[weekStart]/page.tsx`

---

### Task 4: Kitchen Helper — Select Meal: sort by date, display date, remove past meals

**Description:** The "Select Meal" tab in Kitchen Helper should sort meal groups by date, display the date next to each group, and remove groups whose date is in the past (before today).

**Root cause:** The `filteredMealGroups` useMemo (line 99-103) just filters by search query but doesn't sort by date or filter out past dates. Meal groups don't show their associated date.

**Changes:**

**File: `src/app/(app)/kitchen-helper/page.tsx`**

A. Filter out past meal groups:
- In the `filteredMealGroups` useMemo, add a filter that removes groups where `group.date < todayStr`
- Also remove groups from the base `mealGroups` state or the filtered list

B. Sort meal groups by date:
- After filtering, sort by `group.date` ascending (earliest first)

C. Display the date for each group:
- In the meal list rendering (lines ~471-492), show the date next to the group name
- Format the date nicely (e.g., "Mon, Apr 27")

**Implementation:**
```ts
const todayStr = format(new Date(), 'yyyy-MM-dd');

const filteredMealGroups = useMemo(() => {
  let groups = mealGroups;
  // Filter out past dates
  groups = groups.filter(g => g.date >= todayStr);
  // Sort by date ascending
  groups = [...groups].sort((a, b) => a.date.localeCompare(b.date));
  // Apply search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    groups = groups.filter(g => g.name.toLowerCase().includes(q));
  }
  return groups;
}, [mealGroups, searchQuery, todayStr]);
```

Display date in the group button:
```tsx
<span className="text-xs text-stone-400 ml-2">
  {format(parseISO(group.date), 'MMM d')}
</span>
```

**Acceptance criteria:**
- [ ] Meal groups are sorted by date (earliest first)
- [ ] Each meal group shows its date (e.g., "Apr 27")
- [ ] Meal groups with dates before today are not shown
- [ ] Search still works correctly on the filtered/sorted list
- [ ] Today's meal groups ARE shown (not removed)

**Verification:**
1. Create meal plans with groups across multiple weeks
2. Go to Kitchen Helper → Select Meal tab
3. Verify groups are sorted by date
4. Verify past dates are not shown
5. Verify today's groups appear

**Dependencies:** None

**Estimated scope:** S (1 file)

**Files likely touched:**
- `src/app/(app)/kitchen-helper/page.tsx`

---

### Task 5: Kitchen Helper Play mode — remove instruction name, show only number + text

**Description:** In Play mode, the step card currently shows the ingredient name (for prep steps) or a number. The requirement is to remove the instruction name and show only the step number in a circle and the actual instruction text.

**Root cause:** The play mode card (lines 747-771) shows:
- For prep steps: a utensils icon + `ingredientName` + `text`
- For cook steps: a number in a circle + `text`

The ingredient name and utensils icon should be removed from prep steps. Instead, show a step number in a circle for all steps (both prep and cook).

**Changes:**

**File: `src/app/(app)/kitchen-helper/page.tsx`**

Modify the Play mode step card to:
1. Show a step number in a circle for ALL steps (both prep and cook)
2. Remove the ingredient name display for prep steps
3. Remove the utensils icon for prep steps
4. Keep the instruction text
5. Keep the recipe name label when mode is not 'recipe' (for multi-recipe meals)

**Current code (lines 747-771):**
```tsx
{currentPlayStep.type === 'prep' && (
  <>
    <div className="w-14 h-14 ..."><Utensils /></div>
    <p className="text-lg font-semibold ...">{currentPlayStep.ingredientName}</p>
  </>
)}
{currentPlayStep.type === 'cook' && (
  <div className="w-14 h-14 ...">
    <span className="text-2xl font-bold">{currentPlayStep.stepNumber}</span>
  </div>
)}
```

**New code:**
```tsx
<div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${
  currentPlayStep.type === 'prep' ? 'bg-amber-200 text-amber-700' : 'bg-red-200 text-red-700'
}`}>
  <span className="text-2xl font-bold">{playStepIndex + 1}</span>
</div>
```

This removes the ingredient name and the utensils icon, replacing them with just the step number in the circle for both types.

**Acceptance criteria:**
- [ ] Prep steps show only a number in a circle + the instruction text
- [ ] Cook steps show only a number in a circle + the instruction text
- [ ] No ingredient name displayed in play mode
- [ ] Step number is sequential across all steps (1, 2, 3, ...)
- [ ] Color coding still works (amber for prep, red for cook)

**Verification:**
1. Select a recipe with prep and cook steps
2. Hit Play
3. Verify each step shows only a circled number and the text
4. Verify no ingredient names appear

**Dependencies:** None

**Estimated scope:** XS (1 file, small template change)

**Files likely touched:**
- `src/app/(app)/kitchen-helper/page.tsx`

---

### Task 6: Kitchen Helper — Previous button marks step as incomplete

**Description:** When the user clicks the Previous button during Play mode, the current step should be marked as incomplete (removed from `completedSteps`), so the completed count (`X/Y complete`) decreases.

**Root cause:** The Previous button handler (line 781) only decrements `playStepIndex`:
```tsx
onClick={() => setPlayStepIndex(Math.max(0, playStepIndex - 1))}
```

It doesn't modify `completedSteps`. When going back, the step you're leaving should be unmarked, and the step you're going back to should also be unmarked.

**Changes:**

**File: `src/app/(app)/kitchen-helper/page.tsx`**

When Previous is clicked:
1. Remove the current step's ID from `completedSteps` (the step being left)
2. Also remove the previous step's ID from `completedSteps` (the step being navigated to — so the user can re-complete it)
3. Then decrement `playStepIndex`

**Implementation:**
```tsx
onClick={() => {
  setCompletedSteps((prev) => {
    const next = new Set(prev);
    // Mark the step we're leaving as incomplete
    next.delete(currentPlayStep.id);
    // Also mark the step we're going back to as incomplete
    if (playStepIndex > 0) {
      const prevStep = allSteps[playStepIndex - 1];
      if (prevStep) next.delete(prevStep.id);
    }
    return next;
  });
  setPlayStepIndex(Math.max(0, playStepIndex - 1));
}}
```

**Acceptance criteria:**
- [ ] Clicking Previous decrements the completed count
- [ ] The step being navigated away from is marked incomplete
- [ ] The step being navigated back to is also marked incomplete
- [ ] The badge counter `X/Y complete` updates immediately
- [ ] Can re-complete steps by clicking "Mark Complete & Next" again
- [ ] At step 0, Previous is disabled (already the case)

**Verification:**
1. Select a recipe with multiple steps
2. Hit Play
3. Complete steps 1 and 2 (counter shows 2/4)
4. Click Previous
5. Verify counter decreases to 1/4 (or 0/4)
6. Verify you can re-complete step 2

**Dependencies:** None

**Estimated scope:** XS (1 file, small handler change)

**Files likely touched:**
- `src/app/(app)/kitchen-helper/page.tsx`

---

## Checkpoint: After Tasks 1-3
- [ ] `bun run build` passes (or `npm run build:static`)
- [ ] Manual verification of Tasks 1-3
- [ ] No regressions in recipe/book functionality

## Checkpoint: After Tasks 4-6
- [ ] `bun run build` passes (or `npm run build:static`)
- [ ] Manual verification of Tasks 4-6
- [ ] No regressions in existing functionality

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Task 2: Layout may not fit on smaller screens | Med | Use responsive breakpoints; fall back to stacked on mobile |
| Task 3: Leftover toggle inside groups may have event propagation issues | Low | Use `e.stopPropagation()` consistently |
| Task 6: Marking steps incomplete could confuse users who expect Previous to just navigate | Low | Behavior matches stated requirement; counter stays accurate |

## Open Questions
- Task 3: Should single-entry nutrition be hidden entirely when marked as leftover, or just dimmed? Plan assumes hidden with a message. Adjust if user wants dimmed instead.

# Recipe scaling: proportional default and large-batch beta

Status: Approved for implementation by the user on 2026-11-18.

## Objective and user value

Make Scale full recipe preserve recipe proportions by default. Offer an explicitly experimental, reviewable seasoning-starting-point workflow for large batches without claiming a universal culinary scaling law. Prevent food descriptors such as “no salt added” from classifying a sauce as a standalone seasoning.

## Current defects

- `classifyIngredient` uses substring matching: “Tomato sauce, canned, no salt added” matches salt.
- All scaling automatically uses square-root spice scaling and 1.5x caps for acids/leaveners, even without consent.
- Converted preview amounts use the full multiplier, independently of the saved adjusted amount, and the UI appends the original unit.
- Existing tests explicitly encode the old automatic adjustments.

## Evidence and limitations

Sources researched for this request:

1. Institute of Child Nutrition (2022), USDA Recipe Standardization Guide for School Nutrition Programs, p.67:
   https://theicn.org/cicn/resources/131/usda-recipe-standardization-guide-for-school-nutrition-programs/109523/usda-recipe-standardization-guide-for-school-nutrition-programs.pdf
   Herbs/spices, leaveners, thickeners and liquids need special attention. “The best method to determine the quantities of these specific ingredients is to prepare the recipe.” It supplies no universal numerical seasoning formula.
2. University of Wyoming Extension, Scaling: Up or Down (reviewed January 19, 2024):
   https://uwyoextension.org/uwnutrition/newsletters/scaling-up-or-down/
   Suggests an extra 50% seasoning when doubling (1.5x original, 75% of proportional); start low and taste. Advises multiple batches beyond quadrupling. This does NOT validate extrapolation to 100x.
3. University of Minnesota Extension, Planning the quantity food occasion (reviewed 2021):
   https://extension.umn.edu/food/preparing/cooking-at-home/cooking-safely-for-a-crowd/planning-the-quantity-food-occasion
   Recommends standardized quantity recipes for 25+ people and repeated small batches for family recipes, especially baked/thickened products.

Do not use the older ICN Lesson 34 as a numerical authority: its text and worked examples conflict (25% increase versus 2.25x on doubling, with further inconsistent arithmetic).

## Proposed behavior / acceptance criteria

### Exact scaling (default)

- Multiply every ingredient amount by the requested positive finite factor, preserving its unit. No spice reductions, acid/leavener caps, or forced count rounding.
- 100x: 4 tbsp “Tomato sauce, canned, no salt added” becomes 400 tbsp; 1 leaf “Basil, fresh” becomes 100 leaf units. Muffins/cheese and all other ingredients use the same factor.
- Preview and Apply Scale use the identical amount/unit. Prefer showing original units to eliminate mixed converted-unit labels.
- Yield and authoritative custom whole-recipe nutrition scale proportionally as before. Yield-only editing remains a separate operation.

### Large batch scaling (Beta), opt-in and local to this operation

- Add a clearly labeled unchecked “Large batch scaling (Beta)” option to the existing controls, not a separate recipe system.
- Recognized standalone dried culinary herbs/spices initially use 75% of their proportional amount only for factors from 2x through 4x. A visible adjustable starting percentage (1–100%) and per-ingredient proportional opt-out let the cook review the suggestion before applying. The default matches the cited doubling suggestion at 2x; at other factors through 4x it is explicitly an application heuristic, not an institutional formula.
- Below 2x use exact proportional scaling; beta must never reduce a 1x recipe or change downscaling. Explain the 2x eligibility threshold rather than inventing a smooth evidence-free formula.
- Above 4x keep proportional amounts and show a prominent warning: no validated automatic seasoning formula was found for this increase; use a tested quantity recipe or repeat smaller batches and verify seasoning. In particular a 100x request must not silently receive an arbitrary reduction.
- Fresh herbs (including “Basil, fresh”), table salt, salt-containing blends and unidentified ingredients stay proportional by default; identify them separately for review rather than pretending dried-seasoning guidance is universally applicable. Unknown herb form also stays proportional. Do not use beta estimates for curing, preservation, fermentation or other safety-dependent formulations; display this limitation without claiming automatic recipe-safety detection.
- Always show “starting estimate; test the recipe and adjust to taste where safe” plus source links in beta mode. Do not advise tasting raw/unsafe ingredients.
- Show which rows are adjusted, their proportional alternative and their actual effective multiplier; unknown/ambiguous ingredient names stay proportional.
- Do not automatically modify acids, leaveners, thickeners, cooking times or temperatures. Warn that baking/equipment/liquid adjustments require testing; no more arbitrary 1.5x caps.
- Disable beta for recipes with authoritative custom published nutrition, with an explanation: changing ingredient proportions cannot produce a valid revised published analysis. Exact proportional scaling stays available. Avoid silently keeping a full-factor nutrition label for a nonproportional recipe.
- Reset disables beta and clears its per-ingredient choices. Nothing is automatically persisted as a user preference.

### Conservative ingredient classification

- Use word/phrase boundaries and primary ingredient identity rather than any occurrence anywhere in the name.
- Recognize standalone herbs/spices and explicit seasoning blends; preparation/form descriptors such as “Basil, fresh”, “Spices, basil, dried”, “Salt, table”, and “ground black pepper” may qualify for a seasoning classification. Classification alone does not assert eligibility for the dried-seasoning reduction: distinguish fresh herbs/salt/uncertain blends from eligible dried seasonings.
- Recognize negated/exclusion descriptors including “no salt added”, “without salt”, “unsalted”, “salt-free”, “no spices added”, “without basil” and analogous forms. Negated mentions must not create a seasoning match.
- Both “Tomato sauce, canned, no salt added” and “Tomato sauce with salt/basil/spices added” remain sauce/linear. Added seasoning is not the primary ingredient. Same for cheese with herbs, salted butter and peppered meat.
- A standalone “salt-free seasoning blend” may still be a seasoning: negating salt does not negate the blend itself. Fresh peppers/vegetables and words containing keywords (e.g. peppermint candy, eggplant) are not spices merely due to substring overlap.
- Keep rules explicit, deterministic and small; no dependencies, AI classifier, network lookup or claim of perfect natural-language understanding. Show classifications in beta for human review.

## Affected systems and ownership

- Existing TypeScript preview/edit calculation: `src/lib/recipe-scaling.ts` and scaling types in `src/lib/types.ts`.
- Existing controls: `src/components/recipe/scaling-controls.tsx`.
- Existing recipe-update integration: `src/app/(app)/recipes/page.tsx` and `buildRescaledIngredientUpdate`; preserve ingredient metadata/nutrition rescaling.
- Browser suggestions remain proposed explicit ingredient edits through the current update path; Go API validation/PostgreSQL persistence remain authoritative. No new persistence, endpoints, background processes or alternative nutrition engine. If inspection reveals that correct authoritative handling requires a new API contract, stop and update this spec for approval first.
- Preserve unrelated uncommitted changes already present in these files.

## Stack, commands and code style

Existing React 19 / Next.js 16, TypeScript, Vitest 4 and Testing Library; no new dependencies.

- Focused: `npm test -- src/lib/recipe-scaling.test.ts src/components/recipe/scaling-controls.test.tsx src/components/recipe/custom-recipe-page.test.tsx src/lib/custom-recipe-nutrition.test.ts`
- Broader: `npm test`
- Types: `npx tsc --noEmit`
- Scoped lint: `npx eslint src/lib/recipe-scaling.ts src/lib/recipe-scaling.test.ts src/components/recipe/scaling-controls.tsx src/components/recipe/scaling-controls.test.tsx`

Follow existing pure functions, named exports and plain explicit types. Example target invariant: `scaledAmount: ingredient.amount * factor`; preview must format that actual value with its actual unit.

## Testing strategy and ordered implementation plan

Implementation completed in the existing scaling utility/control and current recipe update path. Added regression coverage for the reported ingredient names, exact default scaling, beta estimates/eligibility, classifier false positives, UI opt-outs and warnings. The original failing regression run reproduced the substring-classifier defect (40 instead of 400) and missing beta behavior.

Each slice follows red/green TDD. Review checkpoints follow slices 1–2 and the completed beta flow.

## Documentation updates

Update PROJECT.md recipe-management behavior and NUTRITION_DOMAIN.md scaling contract; record source limitations and verification in this spec. Update architecture/decision records only if ownership/API changes become necessary. Existing testing policy is unchanged.

## Boundaries

- Always: default to proportional scaling, preserve nutrition/metadata, make beta limitations visible, run focused regression checks, preserve existing unrelated edits.
- Ask first: approve this proposed beta heuristic/limitations, any new API/schema/dependency or scope changes.
- Never: claim a scientifically validated universal 100x seasoning formula, automatically repair old recipes without original amounts, deploy/restart live services or alter live recipe data as part of this change.

## Approval questions

Approve the adjustable 75%-of-proportional beta starting estimate for recognized dried seasonings at 2–4x (direct source support for doubling only), proportional fallback with warnings beyond 4x and for fresh herbs/salt, conservative standalone-only classification, and beta exclusion for published-nutrition recipes? A universal automatic 100x seasoning reduction is deliberately not proposed because the researched institutional sources do not support one.

## Verification status

User approved scope on 2026-11-18. Focused verification: `npm test -- src/lib/recipe-scaling.test.ts src/components/recipe/scaling-controls.test.tsx src/components/recipe/custom-recipe-page.test.tsx src/lib/custom-recipe-nutrition.test.ts` passed (35 tests). Full `npm test` passed (56 files, 487 tests); `npx tsc --noEmit`, scoped ESLint, and `git diff --check` passed. No browser runtime verification or live data changes.

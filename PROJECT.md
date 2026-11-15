# Project

> This document defines what DietLedger is, who it serves, and how product decisions should be made.
>
> Architecture belongs in ARCHITECTURE.md.
>
> Domain behavior belongs in NUTRITION_DOMAIN.md.
>
> Historical decisions belong in DECISIONS.md.
>
> This document defines product intent.


Related documents:

- ARCHITECTURE.md
- NUTRITION_DOMAIN.md
- DECISIONS.md
- TESTING_STRATEGY.md

---

# Product Mission

DietLedger exists to help people understand, plan, track, and improve nutrition using accurate food data and practical tools.

The platform combines functionality that is typically spread across multiple applications:

- recipe management
- nutrition analysis
- food logging
- meal planning
- grocery planning
- dietary compliance
- health tracking
- cookbook publishing

The goal is to provide a single integrated nutrition platform.

---

# Product Vision

DietLedger is not simply:

- a calorie tracker
- a recipe manager
- a meal planner

DietLedger is a nutrition operating system.

Users should be able to move seamlessly through the entire nutrition workflow:

```text
Food
    ↓
Ingredients
    ↓
Recipes
    ↓
Meal Planning
    ↓
Grocery Lists
    ↓
Food Consumption
    ↓
Nutrition Analysis
    ↓
Health Tracking
```

Every major feature should strengthen this workflow.

---

# Product Principles

## Nutrition Accuracy First

Nutrition accuracy is core functionality.

Accuracy is more important than convenience.

Changes affecting:

- nutrient calculations
- serving calculations
- food data mapping
- Daily Value calculations

should be treated as high-risk work.

---

## Integration Over Feature Count

DietLedger succeeds when existing features work together.

Prefer:

- connecting workflows
- strengthening integrations
- reducing friction

over adding isolated features.

---

## Practical Utility

Features should help users make better nutrition decisions.

Prioritize:

- meal planning
- food logging
- nutrition insight
- dietary compliance
- grocery preparation
- health tracking

over novelty.

---

## User Ownership

Users own their data.

Users should be able to:

- understand their data
- export their data
- manage their data

without vendor lock-in.

---

## Maintainability Matters

The project must remain maintainable by a single developer.

Avoid features that introduce disproportionate maintenance cost.

---

# Target Users

## Home Cooks

Users who create recipes and want accurate nutrition information.

Primary needs:

- recipe management
- nutrition labels
- meal planning
- grocery generation

---

## Health-Conscious Individuals

Users tracking:

- calories
- nutrients
- weight
- health metrics

over time.

---

## Families

Users managing nutrition for multiple people.

Examples:

- spouses
- children
- dependents

---

## Nutrition Professionals

Dietitians, nutrition coaches, and consultants.

Primary needs:

- client tracking
- dietary compliance
- nutrition reporting
- meal planning

---

# Core Product Loop

The primary DietLedger workflow is:

1. Create or import food data.
2. Build recipes.
3. Plan meals.
4. Generate grocery lists.
5. Consume food.
6. Track intake.
7. Measure outcomes.
8. Improve future decisions.

Future work should strengthen one or more parts of this loop.

---

# Core Capabilities

DietLedger currently focuses on the following product areas.

## Recipe Management

The dependency-aware package/quarantine upgrade is approved in `specs/recipe-nutrition-quarantine.md`; its plan records verified implementation slices. Current foundations persist immutable portable recipe/custom-food identities separately from local keys, accept native v1/v2 file envelopes, make server recipe creation atomic with duplicate-safe retry keys, preserve explicit ingredient order and zero-nutrition intent, and retain unresolved source identities plus unconfirmed supplied nutrition without dangling live links. Settings and AppNav account deletion now initiate a server-enumerated owner recipe/book JSON backup before requesting deletion, stopping on backup/download construction failures. This includes incomplete drafts and native book placement but is not a full-account backup, cannot prove the browser saved the file, and does not protect edits after its database snapshot. Settings retains administrator-successor selection. Imported recipes now stage separately: complete recipes enter the main library, while missing links trigger Stop and undo for the whole incoming batch or Relink later. `/recipes/quarantine` accumulates unresolved imports across files/visits and provides filterable expandable cards using the existing food-search popup. Confirmed repairs promote recipes into their retained book/category locations. Published views and ordinary JSON/PDF exports never read quarantine; owner backups explicitly retain it. This applies to imports only, without migrating existing recipes. Dataset inventory/preflight, greyed book/search behavior, and retain/fork conflict UI are deferred—not prerequisites for this simpler workflow.

Create, organize, search, and manage recipes. The expanded ingredient editor shows the name of the matched database food (when resolvable) and lets users choose another food; changing the match recalculates the ingredient's nutrient snapshot using the current amount and unit, without replacing its recipe-specific name or preparation details. Recipe totals and nutrition labels recalculate from all current ingredient snapshots after changes. Food search prioritizes literal exact matches over broader stemming matches so staples such as table salt are easy to find. Search and Change match allow zero-calorie foods when other canonical nutrients are present (such as sodium in salt), but exclude nutritionally empty records. Change match also offers a separate explicit Use no nutrition action for spices/trace ingredients; it creates a zero-nutrient manual snapshot. Long recipe import/export errors wrap in the recipe-list panel and remain scrollable without changing the fixed-height panel layout. The first saved storage location for a matched database food establishes a per-user default for that food; later recipe additions preselect it. In the ingredient editor, Update default saves the selected location on the current ingredient and sets the default for future additions, without changing other existing recipe ingredients. Added ingredients show their saved storage location on the collapsed ingredient tile.

---

## Nutrition Analysis

Generate nutrition labels and nutrient analysis from recipes and foods.

---

## Meal Planning

Plan meals across days and weeks.

---

## Grocery Planning

Generate grocery lists from meal plans and recipes.

---

## Food Logging

Track food consumption over time.

---

## Health Tracking

Track:

- weight
- BMI
- BMR
- TDEE
- nutrition goals
- health metrics

---

## Dietary Compliance

Analyze recipes and foods against dietary restrictions and goals.

---

## Cookbook Publishing

Organize recipes into books and export printable content. Book pages (including attribution and license prefaces) are readable and editable from the book detail view; the whole page or chapter-recipe tile opens its content while removal controls and drag handles remain separate. Chapters can be expanded independently and start collapsed for easier navigation. Edit Book changes book metadata, while the detail view manages pages and chapters. The Public Domain Recipes seed bundle places its Preface before Breakfast & brunch and keeps only the author in the book description. Cookbook PDF export requires an Imperial, Metric, or Grams selection. Grams uses exact weight units or matching food-specific USDA portion weights; if a weight is unavailable, that ingredient keeps its original amount/unit with a PDF notice. Importable recipe-bundle JSON remains unchanged.

---

## Recipe Sharing

Share recipes and discover community content.

---

# Product Boundaries

DietLedger intentionally focuses on nutrition workflows.

DietLedger is not attempting to become:

- a social network
- a messaging platform
- a content feed
- an e-commerce platform
- a general-purpose health platform

Recipe sharing exists to support nutrition workflows rather than social engagement.

---

# Prioritization Rules

Priority increases when work improves:

- nutrition accuracy
- food logging
- recipe management
- meal planning
- grocery generation
- dietary compliance
- health tracking

Priority decreases when work primarily adds:

- infrastructure
- customization
- novelty features
- social features
- architectural complexity

without improving core workflows.

---

# Product Strategy

Current strategy:

## Consolidate

Strengthen existing workflows before introducing new ones.

---

## Simplify

Reduce complexity wherever practical.

---

## Integrate

Improve connections between existing systems.

---

## Stabilize

Increase correctness, testing, and maintainability.

---

## Build Depth

Improve the quality of core nutrition workflows before expanding product scope.

---

# Product Success Criteria

DietLedger succeeds when users can:

- create recipes efficiently
- obtain trustworthy nutrition information
- plan meals effectively
- generate useful grocery lists
- track food intake accurately
- understand long-term trends
- make better nutrition decisions

Every feature should contribute to one or more of these outcomes.

---

# Product Decision Checklist

Before implementing a feature:

## User Value

- Which user problem is being solved?
- Which user benefits?

## Workflow Impact

- Which workflow improves?
- Does it strengthen the core product loop?

## Nutrition Impact

- Does it improve nutrition decision-making?

## Existing Systems

- Can existing functionality solve the problem?

## Maintenance

- What maintenance burden does this introduce?

## Alignment

- Is this aligned with the product mission?

If these questions cannot be answered clearly, reconsider the feature.

---

# Product Success Definition

Successful work:

- improves nutrition outcomes
- improves workflow efficiency
- strengthens integration between features
- improves maintainability
- improves user understanding

Unsuccessful work:

- increases complexity without user value
- creates isolated functionality
- duplicates existing capabilities
- optimizes for hypothetical future needs

Favor nutrition accuracy, workflow integration, simplicity, and maintainability.
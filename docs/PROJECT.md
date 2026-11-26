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

## Low-friction Self-hosting

The owner selected standard Docker Compose and Portainer CE Docker Standalone, pulling the web/API packages directly from GHCR with no setup helper or required host installer, Node, Git, buildx or registry login. Operators fill five empty secret assignments with independent secure values, preserve them across reruns, restrict configuration access and keep encrypted offline backups with the database; the original HMAC is crucial for provider-setting recovery. Default access is loopback port 3000; wider access requires trusted HTTPS ingress, exact browser origin and disabled insecure-loopback mode. Portainer supports explicit environment entry/import with the same health/completion dependency semantics, named storage and no Business Edition requirement. Existing operator-managed stacks remain separate: no credential overwrite, unknown-database adoption or implied live redeploy. External integration keys remain provider-issued. Runtime verification, security/history gates and actual publication are pending, not promised by this product direction. See `specs/standard-compose-ghcr-install.md` and `docker-registry-install.md`; earlier installer requirements are superseded.

## Authentication and setup

A fresh installation requires its operator's one-use setup claim to create the first administrator. After a factory reset, the operator must provide a different claim; the previous one cannot be reused. Existing browser sessions must sign in again after the session-security upgrade. Developer API-key creation is unavailable until scoped authentication is supported; existing keys cannot authenticate and may be revoked. Account and recipe data are preserved by the authentication cutover.

## Maintainability Matters

The project must remain maintainable by a single developer.

Avoid features that introduce disproportionate maintenance cost.

---

# Target Users

The [GitHub Pages introduction](index.html) highlights three ways to use DietLedger before visitors start the interactive adventure: personal nutrition tracking, household meal planning, and planning around health-related dietary requirements. The last highlights recipe screening and weekly planning, not medical or allergen certification. See the [introduction spec](specs/github-pages-introduction.md).

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

The dependency-aware package/quarantine upgrade is approved in `specs/recipe-nutrition-quarantine.md`; its plan records verified implementation slices. Current foundations persist immutable portable recipe/custom-food identities separately from local keys, accept native v1/v2 file envelopes, make server recipe creation atomic with duplicate-safe retry keys, preserve explicit ingredient order and zero-nutrition intent, and retain unresolved source identities plus unconfirmed supplied nutrition without dangling live links. Settings and AppNav account deletion now initiate a server-enumerated owner recipe/book JSON backup before requesting deletion, stopping on backup/download construction failures. This includes incomplete drafts and native book placement but is not a full-account backup, cannot prove the browser saved the file, and does not protect edits after its database snapshot. Settings retains administrator-successor selection. Imported recipes now stage separately: complete recipes enter the main library, while missing links trigger Stop and undo for the whole incoming batch or Relink later. `/recipes/quarantine` accumulates unresolved imports across files/visits and provides filterable expandable cards using the existing food-search popup. Confirmed repairs promote recipes into their retained book/category locations. Published views and ordinary JSON/PDF exports never read quarantine; owner backups explicitly retain it. This applies to imports only, without migrating existing recipes. Dataset inventory/preflight, greyed book/search behavior, and retain/fork UI for recipe/food portable-identity conflicts are deferred—not prerequisites for this simpler workflow. Same-name book import choices remain a separate server-authoritative placement workflow.

Create, organize, search, and manage recipes. In Settings → Categories, administrators can select individual categories or use adjacent link-style all/none controls and delete the selection with confirmation. Parent deletion also removes subcategories (including unchecked ones) and category assignments, not recipes; non-admin category views remain read-only. The expanded ingredient editor shows the name of the matched database food (when resolvable) and lets users choose another food; changing the match recalculates the ingredient's nutrient snapshot using the current amount and unit, without replacing its recipe-specific name or preparation details. Recipe totals and nutrition labels recalculate from all current ingredient snapshots after changes. Food search prioritizes literal exact matches over broader stemming matches so staples such as table salt are easy to find. Search and Change match allow zero-calorie foods when other canonical nutrients are present (such as sodium in salt), but exclude nutritionally empty records. Change match also offers a separate explicit Use no nutrition action for spices/trace ingredients; it creates a zero-nutrient manual snapshot. Long recipe import/export errors wrap in the recipe-list panel and remain scrollable without changing the fixed-height panel layout. The first saved storage location for a matched database food establishes a per-user default for that food; later recipe additions preselect it. In the ingredient editor, Update default saves the selected location on the current ingredient and sets the default for future additions, without changing other existing recipe ingredients. Added ingredients show their saved storage location on the collapsed ingredient tile. Full-recipe scaling is proportional by default. An opt-in **Large batch scaling (Beta)** offers reviewable 75%-of-proportional starting estimates for identified dried seasonings from 2× through 4× only; fresh herbs and salt stay proportional, and users can opt out per ingredient. Above 4× the amounts remain proportional with a recommendation to use tested quantity recipes or multiple batches. This beta is a heuristic, not a validated universal scaling formula; ingredient names are classified conservatively so seasoning mentions inside composite foods do not change their scaling.

---

## Appearance

**Luxury** is the default palette in dark appearance when no choice is saved: an art-deco-inspired dark brown, emerald and bronze/copper palette with a subdued DietLedger icon and readable emerald hover states. Luxury also has a light appearance. Users can choose Olive Botanical or other existing themes and use light or matching dark variants. Valid locally saved palette selections are retained, and light appearances keep the original icon. The former default Vintage Teal was not always saved distinctly from no selection, so it can be selected again if desired. See `specs/olive-botanical-dark-luxury-themes.md` for behavior and verification.

---

## Custom Data Reset

Administrators can **Reset all custom data** from Settings. This password-gated action removes custom content across **every user**, including recipes, books, custom foods, global categories/templates/staples, plans/logs/profiles, and import history/quarantine. Accounts, account settings, login sessions, instance configuration and imported standard nutrition databases remain. The reset is atomic and does not repopulate pantry staples; identical cookbook imports can start fresh afterward. Non-administrator personal deletion remains caller-scoped and cannot erase shared global content. See `specs/complete-custom-data-reset.md` for implementation and verification status.

---

## Nutrition Analysis

Generate nutrition labels and nutrient analysis from recipes and foods. Custom recipes can retain a cookbook's published nutrition as their authoritative analysis without individual ingredient matching. They keep their ingredients, groups, yield, serving description, timing and source notes, and remain usable as ingredients in other recipes. Supplied totals feed serving labels, food logging, meal planning and cookbook output instead of being recalculated from descriptive ingredients. Source and unreported-nutrient notices distinguish published facts from missing data. Native version 4 transfers preserve these facts; see `specs/custom-recipe-nutrition.md` for verification and deployment status.

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

Analyze recipes and foods against dietary restrictions and goals. An editable **Diabetes-aware** starter dietary profile supports the opt-in **Diabetic** button under Recipes → Dietary Filters. Its defaults are a starting point; users are responsible for their own filter choices and can personalize targets under Nutrition → Diets → Dietary Profiles. The initial screen highlights recipes meeting a high-fiber target (14 g/1,000 kcal); sodium below 2,300 mg/day remains separate daily guidance, and individual per-serving limits are optional. Sources and limitations are shown in the dietary profile editor; the recipe filter section contains controls only. Operational errors and pending or unassessed status appear near recipe results, even with filters collapsed. This is nutrition-target screening, not medical certification or a universal diabetes eating plan; unknown nutrition never counts as a confirmed match. See `specs/diabetes-aware-dietary-filter.md`.

---

## Cookbook Publishing

Organize recipes into books and export printable content. Book pages (including attribution and license prefaces) are readable and editable from the book detail view; the whole page or chapter-recipe tile opens its content while removal controls and drag handles remain separate. Chapters can be expanded independently and start collapsed for easier navigation. Edit Book changes book metadata, while the detail view manages pages and chapters. The Public Domain Recipes seed bundle places its Preface before Breakfast & brunch and keeps only the author in the book description. From a cookbook's Export page, choose PDF for printing or DietLedger bundle for an importable copy of that cookbook. PDF export requires an Imperial, Metric, or Grams selection. Grams uses exact weight units or matching food-specific USDA portion weights; if a weight is unavailable, that ingredient keeps its original amount/unit with a PDF notice. Bundle export uses the existing DietLedger JSON format and does not apply PDF settings. On import, an owned book with the same title (ignoring case and surrounding whitespace) prompts for Merge, Replace, or Cancel import. Merge preserves local metadata and structure, appending incoming chapters/pages without coalescing same-named chapters; Replace updates that book's metadata and structure but retains its recipes; Cancel stops the entire bundle.

---

## Recipe Sharing

Share recipes and discover community content. Publication is owner-authorized; private is the creation default, and only the publisher can change or revoke a share. Public visibility permits reading, not editing. Global categories and published default templates are administrator-managed; personal templates remain owner-managed. Imported standard-food facts remain unconfirmed owner package data until the required trusted catalog records are available; offline owner-backup restoration preserves source facts/portions and cookbook placement in quarantine rather than publishing unverified nutrition. See `specs/security-sharing-trust-verification.md` for implementation evidence.

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
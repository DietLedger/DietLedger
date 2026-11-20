# DietLedger USDA nutrient analysis approval

Research baseline checked November 18, 2026. Scope is federal K–12 school breakfast (SBP) and lunch (NSLP).

The first approval target is **weighted nutrient analysis**. USDA requires its approved software for nutrient analyses conducted as part of an Administrative Review. That approval also covers the nutrient-analysis portion of school meal certification for additional performance-based reimbursement. USDA publishes a separate list of tools approved to certify compliance with the full NSLP meal pattern. [USDA-approved nutrient analysis software][approved] · [NSLP certification tools][certification]

## Software requirements

A1–A12 map to Appendix B, pp. 44–45 of the USDA Nutrient Analysis Protocols (NAP) manual. The DietLedger column translates those criteria into reviewer-visible behavior. Status tracks implementation evidence. All rows start at **Unverified** because the code and product were outside the scope of the research. [USDA NAP manual and resource page][manual]

| ID | Published requirement | DietLedger acceptance evidence | Status |
| --- | --- | --- | --- |
| A1 | Include the most current Child Nutrition Database (CNDB). | Import the official FoodData Central CNDB release, display its release ID, and record it with analyses. USDA listed CN2026.10, dated October 29, 2026, as current when checked. Recheck the release before submitting. [CNDB downloads][cndb-download] | Unverified |
| A2 | Protect official CNDB information and allow editing of user-entered information. | Attempts to edit or delete an official record through the UI, API, or import workflow fail. Locally entered records remain editable. | Unverified |
| A3 | Add foods using a manufacturer's fact sheet or food label, with nutrients per serving or specified weight. | Enter a labeled serving or specified weight, attach the gram weight for a cup, piece, or other portion measure, and retain provenance. Distinguish missing values from reported zeroes. | Unverified |
| A4 | Automatically convert weight and volume measures, where available, at all levels. | Demonstrate automatic conversions in food entry, recipe creation, and menu planning. Use food-specific gram equivalents for volume and piece measures. | Unverified |
| A5 | Enter recipes and produce a recipe report. | Report recipe code, name, portion size, yield in servings, ingredients, amounts in food-service units, preparation instructions, and nutrient values per serving. | Unverified |
| A6 | Produce a Recipe Nutrient Composition Report. | Report each ingredient's nutrient contribution and the recipe's nutrient totals per serving. | Unverified |
| A7 | Resize the recipe yield while preserving the original. | Scale ingredient quantities accurately to a new yield and verify that the original recipe remains intact. | Unverified |
| A8 | Create menus for a site and copy them across sites, age/grade groups, or date ranges. | Demonstrate all three copy operations and verify that edits to the copy are independent. | Unverified |
| A9 | Produce a Menu Report for offered meals. | List each offered item, serving size, number of servings offered, and the meal's feeding figure, meaning the count of students for the meal period. | Unverified |
| A10 | Calculate weighted nutrient analysis for a single menu or a date range including a five-day week. | Produce a daily result and a weekly comparison against the selected meal and grade band's standards. Highlight each discrepancy. | Unverified |
| A11 | Display or print nutrient composition for foods and recipes. | Generate a report covering selected entries or all foods and recipes in the database. | Unverified |
| A12 | Provide clear, complete, sequential instructions. | Walk a reviewer through adding a food, entering and resizing a recipe, recording an offered week, running the analysis, and finding each report. | Unverified |

## Approval process

- USDA has directed new applicants to the **Software Evaluation Team** at `cnpntab@usda.gov`. Its public approved-software page describes the accepted uses. [State agency bulletin relaying USDA instructions][evaluation] · [USDA-approved software][approved]
- USDA says software companies must submit software **annually** for review. FoodData Central publishes the CNDB. Branded data is updated monthly, with other sources updated twice a year as needed. [USDA CNDB overview][cndb] · [CNDB downloads][cndb-download]
- Public materials reviewed did not disclose an initial application form, fee schedule, turnaround commitment, official test menus, scoring tolerances, or an independent lab certification requirement. Confirm submission instructions, acceptable reviewer access, and official tests or tolerances when contacting USDA.
- Confidence is **high** on the published functionality and annual review requirement and **medium** on the initial intake details because the submission procedure is not publicly documented in the materials reviewed.

## Pre-submission verification

### Weighted analysis

1. Use a separate calculation for each site, meal type, age/grade band, and population segment with different offerings.
2. For each nutrient and menu day, sum `nutrient_per_offered_portion × offered_serving_count` across qualifying offered items and divide by that day's feeding figure. Include choices, milk types, condiments, and noncreditable extras offered with the reimbursable meal.
3. Average daily results across the menu days. A fixture with daily values of 650, 550, and 600 kcal and feeding figures of 100, 200, and 100 must return **600 kcal**. Pooling the feeding counts would return 587.5 kcal.
4. Compute percentages from the weekly averages. Saturated fat is `100 × 9 × average_countable_saturated_fat_g / average_total_kcal`. Added sugars are `100 × 4 × average_added_sugars_g / average_total_kcal`. Keep the source precision through calculation, display rounded results as needed, and verify exact boundaries.
5. Keep a planned menu for forecasts and an offered menu for review evidence. Test multiple entrées and milk choices, a day-of substitution, and leftovers offered with a later reimbursable meal. Reproduce the daily and weekly reports from the saved inputs.

Sources and examples appear in NAP Chapter 7 and the ICN worked sodium example. The Galley documentation shows an example reviewer workflow. [USDA NAP manual][manual] · [ICN worked sodium example][weighting] · [Galley reviewer workflow][galley]

### Food and recipe fixtures

- Recreate the NAP spaghetti and meat sauce example. It uses **8 lb 8 oz as-purchased ground beef** and **6 lb 6 oz cooked ground beef** for the nutrient analysis. Preserve the production recipe and the basis for the as-served nutrient calculation. [USDA NAP manual, Chapters 5–6][manual]
- Exercise portion changes, mass conversions, food-specific volume conversions, ingredient contributions, recipe resizing, and a CNDB update. Test missing and zero nutrient values independently. A recommended result for missing required inputs is **Incomplete**, with the affected foods named.
- Record the CNDB release, food and recipe data used, menu inputs, and ruleset version needed to reproduce each report. Verify that an update does not silently change the evidence for a previously completed analysis.

### Boundary tests and reviewer package

- Cover all six meal-and-grade combinations, June 30 and July 1, 2027, inclusive sodium and calorie boundaries, strict percent boundaries, and the fluid-milk saturated-fat exclusion. Include short and long weeks and a case where a menu passes nutrient analysis but misses a required meal component.
- Prepare a runnable build or reviewer instance, a short walkthrough, sample input menus and reports, and an A1–A12 checklist with references to screens, reports, or tests. This is a proposed first-review package. Confirm USDA's submission format and evaluation criteria at intake. [NSLP regulation][nslp] · [SBP regulation][sbp] · [USDA implementation timeline][timeline]

## K–12 default menu presets

Use a preset for each meal and grade band. Store effective dates with the rules. Run nutrient analysis and meal-pattern crediting as independent checks.

### Weekly dietary specifications

These are **daily amounts averaged across the school week**, calculated separately for breakfast and lunch. Calorie ranges and sodium maxima are inclusive. Percentage limits are strict. The current regulations use `≤` for sodium, while USDA's sodium summary page displays `<`. Use the regulatory operator. [NSLP regulation][nslp] · [SBP regulation][sbp] · [USDA sodium summary][sodium]

| Meal | Grades | Energy, kcal | Saturated fat, % of kcal | Sodium through 2027-06-30 | Sodium from 2027-07-01 | Added sugars from 2027-07-01 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Breakfast | K–5 | 350–500 | <10% | ≤540 mg | ≤485 mg | <10% of kcal |
| Breakfast | 6–8 | 400–550 | <10% | ≤600 mg | ≤535 mg | <10% of kcal |
| Breakfast | 9–12 | 450–600 | <10% | ≤640 mg | ≤570 mg | <10% of kcal |
| Lunch | K–5 | 550–650 | <10% | ≤1,110 mg | ≤935 mg | <10% of kcal |
| Lunch | 6–8 | 600–700 | <10% | ≤1,225 mg | ≤1,035 mg | <10% of kcal |
| Lunch | 9–12 | 750–850 | <10% | ≤1,280 mg | ≤1,080 mg | <10% of kcal |

For current breakfast and lunch, exclude saturated fat from milk used to meet the fluid-milk component from the saturated-fat numerator. Keep its calories in the denominator and its sodium and added sugars in their respective totals. The 2026 milk rule permits whole, 2%, 1%, and skim milk. The 2024 rule removed the synthetic trans-fat check described in the 2022 manual. [2026 fluid-milk rule][milk] · [2024 school-meal final rule][rule-2024]

### Five-day meal-pattern quantities

Values are **weekly amounts offered**, with **daily minimums in parentheses**. Treat the upper ends of grain and meat/meat-alternate ranges as advisory. Administrative Review assesses the daily and weekly minimums for those components. [NSLP regulation][nslp] · [SBP regulation][sbp] · [Administrative Review regulation][review]

| Meal | Component | K–5 | 6–8 | 9–12 |
| --- | --- | ---: | ---: | ---: |
| Breakfast | Fruit, cups, with eligible vegetable substitutions | 5 (1) | 5 (1) | 5 (1) |
| Breakfast | Vegetables and individual vegetable subgroups | No separate minimum | No separate minimum | No separate minimum |
| Breakfast | Grains and/or meats/meat alternates, oz eq | 7–10 (1) | 8–10 (1) | 9–10 (1) |
| Breakfast | Fluid milk, cups | 5 (1) | 5 (1) | 5 (1) |
| Lunch | Fruit, cups | 2½ (½) | 2½ (½) | 5 (1) |
| Lunch | Vegetables total, cups | 3¾ (¾) | 3¾ (¾) | 5 (1) |
| Lunch | Dark green, cups | ½ | ½ | ½ |
| Lunch | Red/orange, cups | ¾ | ¾ | 1¼ |
| Lunch | Beans, peas, and lentils, cups | ½ | ½ | ½ |
| Lunch | Starchy, cups | ½ | ½ | ½ |
| Lunch | Other vegetables, cups | ½ | ½ | ¾ |
| Lunch | Additional vegetables from any subgroup to reach total, cups | 1 | 1 | 1½ |
| Lunch | Grains, oz eq | 8–9 (1) | 8–10 (1) | 10–12 (2) |
| Lunch | Meats/meat alternates, oz eq | 8–10 (1) | 9–10 (1) | 10–12 (2) |
| Lunch | Fluid milk, cups | 5 (1) | 5 (1) | 5 (1) |

### Additional preset rules

| ID | Rule | Implementation |
| --- | --- | --- |
| F1 | Product-level added sugars | Effective July 1, 2025, cereal ≤6 g per dry oz, yogurt ≤2 g per oz or 12 g per 6 oz, and flavored milk ≤10 g per 8 fl oz in reimbursable school meals. Run these item checks before and after the weekly limit takes effect. [USDA product-based review guidance][product-sugars] · [NSLP regulation][nslp] · [SBP regulation][sbp] |
| F2 | Whole grain-rich and desserts | At least 80% of weekly grain oz eq must be whole grain-rich. The remaining grain items must be enriched. At breakfast, use the grains offered as the denominator. At lunch, count at most 2 oz eq per week of grain-based desserts toward the grain requirement. [NSLP regulation][nslp] · [SBP regulation][sbp] |
| F3 | Produce and breakfast substitutions | Minimum creditable serving is ⅛ cup. Credit ¼ cup dried fruit as ½ cup fruit and 1 cup leafy greens as ½ cup vegetables. Pasteurized, full-strength juice may satisfy at most half of the applicable component. One breakfast substitution day may use any subgroup. Two or more substitution days require at least two different vegetable subgroups across the week. [NSLP regulation][nslp] · [SBP regulation][sbp] · [USDA breakfast substitution guidance][substitutions] |
| F4 | Lunch vegetable subgroup crediting | Extra dark-green, red/orange, or beans/peas/lentils vegetables can satisfy the Other vegetables requirement. Beans, peas, or lentils credited as meat alternates may also satisfy the weekly beans/peas/lentils subgroup requirement while contributing zero to the daily and weekly vegetable component totals. [NSLP regulation][nslp] |
| F5 | Milk offerings | Offer at least two fluid-milk options daily at each meal, including an unflavored option. Minimum creditable serving is 8 fl oz. [NSLP regulation][nslp] · [SBP regulation][sbp] |
| F6 | Short and long weeks | Use USDA's component tables for regularly scheduled 3-, 4-, 6-, and 7-day weeks. The dietary thresholds remain weekly averages. For analysis of fewer than three consecutive school days in a week, the NAP manual directs reviewers to combine those days with the preceding or following week. [USDA short and long week tables][weeks] · [USDA NAP manual, Chapter 7][manual] |
| F7 | Crediting evidence | Store the credited component, amount, and supporting evidence, such as a Food Buying Guide entry, Child Nutrition label, or manufacturer's Product Formulation Statement. Use the Nutrition Facts panel for nutrient data and retain evidence of each processed product's meal-pattern contribution. [USDA Food Buying Guide][fbg] · [USDA manufacturer documentation][manufacturer] |

Schools serving preschoolers generally use separate preschool meal patterns, with a limited flexibility for co-mingled service. The presets above are for grades K–12. [NSLP regulation][nslp] · [SBP regulation][sbp]

[approved]: https://www.fna.usda.gov/tn/usda-approved-nutrient-analysis-software
[certification]: https://www.fna.usda.gov/tn/usda-approved-certification-compliance-tools-software
[manual]: https://www.fna.usda.gov/tn/nutrient-analysis-protocols-manual
[cndb]: https://www.fna.usda.gov/tn/child-nutrition-database
[cndb-download]: https://fdc.nal.usda.gov/cndb/
[evaluation]: https://content.govdelivery.com/accounts/MIMDE/bulletins/2d98b07
[weighting]: https://theicn.org/resources/1611/worksheets/126119/weighted-nutrient-analysis-of-sodium.pdf
[galley]: https://support.galleysolutions.com/how-do-i-use-galley-for-school-meal-nutrient-analysis
[nslp]: https://www.ecfr.gov/current/title-7/section-210.10
[sbp]: https://www.ecfr.gov/current/title-7/section-220.8
[review]: https://www.ecfr.gov/current/title-7/section-210.18
[timeline]: https://www.fna.usda.gov/cn/school-nutrition-standards-updates/implementation-timeline-school-meals
[sodium]: https://www.fna.usda.gov/school-meals/nutrition-standards/sodium-limits
[milk]: https://www.govinfo.gov/content/pkg/FR-2026-05-08/html/2026-09212.htm
[rule-2024]: https://www.govinfo.gov/content/pkg/FR-2024-04-25/pdf/2024-08098.pdf
[product-sugars]: https://www.fna.usda.gov/schoolmeals/reviewing-product-based-added-sugars-limits-breakfast-cereals
[substitutions]: https://www.fna.usda.gov/sbp/vegetables-fruit-flexibility-qas
[weeks]: https://www.fna.usda.gov/school-meals/nutrition-standards/short-long-week
[fbg]: https://foodbuyingguide.fns.usda.gov/
[manufacturer]: https://www.fna.usda.gov/cn/manufacturer-documentation

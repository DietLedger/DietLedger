# DietLedger Manual Beta Regression Report — 2026-07-05

## Result

**Manual gate: FAIL — defects filed for uncovered/failing checklist items.**

Environment used:
- Local PostgreSQL 15 temp database on `127.0.0.1:55433`
- Go API via `go run .` on `http://127.0.0.1:8080`
- Next.js dev server on `http://localhost:3000`
- Browser automation with `agent-browser` session `die16`

Test account:
- Admin: `qa-beta-1783265458@example.com`
- Password: `ManualPass123!`

## Checklist Evidence

### Authentication
- [x] Registered the first admin account during setup.
- [x] Confirmed registration-disabled behavior after setup/admin-managed mode: `/register` submit returned `403` and displayed `registration is disabled`.
- [x] Logged out and logged back in successfully (`POST /api/auth/login` returned 200 and routed to `/recipes`).

### Recipe Management
- [x] Created `QA Apple Toast`.
- [x] Added USDA/FDA ingredient `Apple, raw, with skin` at 150g; nutrition label updated to 78 cal.
- [x] Edited recipe title to `QA Apple Toast Edited`.
- [x] Deleted the recipe via the recipe card confirm action.
- [ ] Text search on the main recipes page was not available; defect filed.

### Food Database
- [x] Searched food database for `apple`; `GET /api/foods/search?query=apple` returned 200 and showed `Apple, raw, with skin`.
- [x] Created custom food `QA Custom Granola` in Settings → Custom Foods.

### Books and Export
- [x] Created book `QA Family Cookbook`.
- [x] Added chapter `QA Chapter`.
- [x] Opened export flow, selected the book, and triggered `Export Cookbook PDF` with no page error reported.

### Categories
- [x] Created category `QA Category`.
- [x] Assigned category to the recipe; recipe card showed `QA Category`.

### Meal Planning
- [x] Created a weekly meal plan entry by adding `QA Apple Toast Edited` to Sunday lunch.
- [x] Generated grocery checklist; grocery list showed `Apple, raw, with skin` with converted amount `5.29oz`.

### Nutrition
- [x] Created nutrition profile `QA Tester` during setup.
- [x] Logged food entry from recipe; nutrition dashboard showed Lunch entry and macro chart.
- [x] Logged weight entry `155.2` with note `QA regression weight log`.

### Dietary Profiles
- [x] Created dietary profile `QA Gluten Check` with wheat/gluten allergen and gluten-free tag.
- [x] Added sodium threshold 2300mg.
- [ ] Compliance report generation was not available from the dietary profile/nutrition UI; defect filed.

### Settings
- [x] Managed app settings surface by opening Settings and exercising Custom Foods.
- [x] Confirmed Developer API Keys screen loads and opens Generate API Key dialog.
- [ ] Encrypted user secret/API-key storage was not exposed in Settings; only Developer API Keys and local demo key UI were visible.

### Sharing and Community
- [x] Shared recipe publicly; `POST /api/share` returned 201 and produced `/share/ed03f7b6-ba16-4428-887f-5aca9039c88d`.
- [x] Searched community recipes for `Apple`; `GET /api/community?q=Apple&sort=newest` returned 200 and displayed the shared recipe.

## Runtime Findings

- Console error observed during setup completion:
  - `Cannot update a component (Router) while rendering a different component (SetupWizard)`.
- Next dev overlay/issue badge appeared on meal-plan pages after navigation. No persisted browser page errors were captured beyond the setup console error, but this should be checked when fixing the setup warning.

## Defects Filed

1. Setup completion emits React setState-in-render console error.
2. Main recipes page lacks a text search control despite checklist coverage.
3. Compliance report component is not reachable from the nutrition/dietary profile UI.
4. Settings does not expose encrypted user secrets/API keys separately from Developer API Keys/local demo key UI.

## Cleanup Notes

The manual recipe was deleted after share/community verification. The temporary local database still contains regression support data (admin user, book, custom food, meal/weight/nutrition records, dietary profile, share record) for follow-up reproduction if needed.

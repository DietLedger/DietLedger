# DietLedger Phase 10 — Manual Regression Checklist

Status: Ready for manual verification
Date: 2026-06-07

Run the application and verify each item. Mark with [x] when verified.

## Automated Verification (completed)

- [x] `npm run lint` passes (41 pre-existing React compiler warnings, no new issues)
- [x] `npm run build` succeeds
- [x] `npm run test` passes (106/106 tests)
- [x] `cd sync-server && go test ./...` passes
- [x] `cd sync-server && go build` succeeds
- [x] Frontend coverage: 30.27% statements (up from 17.84%)
- [x] Coverage exceptions documented in `coverage-exceptions.md`

## Manual Verification (requires running app)

### Authentication
- [ ] Register new account when registration is enabled
- [ ] Confirm registration disabled behavior (set DISABLE_REGISTRATION env var)
- [ ] Login and logout

### Recipe Management
- [ ] Create recipe with ingredients
- [ ] Edit recipe
- [ ] Delete recipe
- [ ] Search recipes

### Food Database
- [ ] Search FDA/USDA food database
- [ ] Create custom food

### Books and Export
- [ ] Create book with chapters
- [ ] Export book

### Categories
- [ ] Create categories and assign recipes

### Meal Planning
- [ ] Create meal plan for a week
- [ ] Generate grocery checklist

### Nutrition
- [ ] Create nutrition profile
- [ ] Log food entry
- [ ] Log weight entry

### Dietary Profiles
- [ ] Create dietary profile
- [ ] Create allergen rule
- [ ] Generate compliance report

### Settings
- [ ] Manage app settings
- [ ] Manage encrypted API keys

### Sharing and Community
- [ ] Share a recipe
- [ ] Search community recipes

## Notes

Any defects found during manual regression become new TDD tasks.

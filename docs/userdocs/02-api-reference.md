
# API Reference

## Summary

This document defines the browser-facing REST API contract for DietLedger Phase 1.

## Conventions

### Authentication

Authenticated endpoints require:

```http
Authorization: Bearer <token>
```

### Response Envelope

Success:

```json
{
  "ok": true,
  "data": {}
}
```

Failure:

```json
{
  "ok": false,
  "error": "message"
}
```

### Identifiers

All identifiers are UUID values.

### Timestamps

All timestamps use ISO 8601 format.

## Resource Areas

### Authentication

| Endpoint | Purpose |
|-----------|---------|
| POST /api/auth/register | Create account |
| POST /api/auth/login | Authenticate |
| POST /api/auth/refresh | Renew session |
| POST /api/auth/logout | End session |

### Account

Profile, settings, export, and deletion operations.

### Recipes

Recipe lifecycle management, ingredients, and categorization.

### Books

Cookbooks, chapters, pages, and recipe organization.

### Foods

USDA and FDA search and lookup services.

### Nutrition

Profiles, food logs, and weight tracking.

### Meal Planning

Meal plans, entries, groups, and grocery generation.

### Sharing

Community publishing and sharing workflows.

## Ownership Model

### Public

Reference food data and community content.

### Private

User-owned resources.

### Shared

Explicitly published content.

## Known Contract Gaps

The following resources require endpoint completion:

- Dietary Profiles
- Allergen Rules
- Templates
- Brand Kits
- Pantry Staples
- User Location
- Encrypted Secrets
- Logout lifecycle

## Data Models

Core models include:

- User
- Recipe
- Ingredient
- RecipeBook
- PersonProfile
- MealPlan
- GroceryChecklist
- ApiKey
- SharedRecipe

Model definitions should remain versioned alongside implementation changes.

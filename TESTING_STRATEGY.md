# Testing Strategy

> This document defines the testing strategy for DietLedger.
>
> The goal of testing is not coverage for its own sake.
>
> The goal is confidence.
>
> Testing should focus on protecting business-critical functionality, reducing regression risk, and enabling safe refactoring.

---

# Testing Philosophy

DietLedger is maintained by a single developer using AI-assisted development.

Testing should optimize for:

- correctness
- confidence
- maintainability
- refactoring safety

Testing should not optimize for:

- arbitrary coverage targets
- testing implementation details
- testing frameworks
- testing generated code

A small number of valuable tests is better than a large number of fragile tests.

---

# Testing Pyramid

DietLedger follows a simplified testing pyramid.

```text
E2E Tests
    ↑
Integration Tests
    ↑
Unit Tests
```

Most tests should be unit tests.

Integration tests should protect critical workflows.

E2E tests should validate only the most important user journeys.

---

# What Must Be Tested

The highest priority is business correctness.

---

# Tier 1: Critical Business Logic

These areas should have the strongest test coverage.

## Nutrition Calculations

Examples:

- nutrient calculations
- recipe nutrition totals
- serving calculations
- scaling calculations
- Daily Value calculations

Reason:

Incorrect results directly impact users.

---

## Health Calculations

Examples:

- BMI
- BMR
- TDEE
- calorie targets
- weight projections

Reason:

These calculations influence health decisions.

---

## Dietary Compliance

Examples:

- allergen detection
- dietary rules
- compliance checks

Reason:

Incorrect behavior may create safety issues.

---

## Unit Conversion

Examples:

- weight conversion
- volume conversion
- serving conversion

Reason:

Many nutrition calculations depend on conversions.

---

# Tier 2: Core Workflows

These workflows should be protected by integration tests.

## Recipe Workflow

```text
Food
    ↓
Ingredient
    ↓
Recipe
    ↓
Nutrition
```

Validate:

- ingredient addition
- nutrition generation
- serving calculations
- recipe scaling

---

## Food Logging Workflow

```text
Food
    ↓
Food Log
    ↓
Daily Totals
```

Validate:

- log creation
- aggregation
- reporting

---

## Meal Planning Workflow

```text
Recipe
    ↓
Meal Plan
    ↓
Grocery List
```

Validate:

- plan creation
- aggregation
- grocery generation

---

## Authentication Workflow

Validate:

- login
- registration
- token refresh
- authorization

---

# Tier 3: Critical User Journeys

E2E tests should focus on complete user outcomes.

## Create Recipe

User can:

- create recipe
- add ingredients
- save recipe
- view nutrition

---

## Log Food

User can:

- create profile
- log food
- view dashboard

---

## Create Meal Plan

User can:

- add recipes
- build meal plan
- generate grocery list

---

## Authentication

User can:

- register
- login
- access protected areas

---

# What Should Not Be Tested

Avoid testing:

## Framework Behavior

Examples:

- React internals
- React Query internals
- Next.js internals
- Go standard library behavior

These are already tested by their maintainers.

---

## Implementation Details

Avoid testing:

- private helper implementations
- CSS details
- internal component structure

Test behavior instead.

---

## Trivial Code

Avoid tests for:

- simple pass-through functions
- constant declarations
- obvious getters and setters

---

# Preferred Test Types

## Pure Function Tests

Highest value.

Examples:

- nutrition calculations
- conversion logic
- compliance logic
- aggregation logic

Characteristics:

- fast
- deterministic
- easy to maintain

---

## Integration Tests

Second highest value.

Examples:

- API handlers
- repository interactions
- workflow validation

Characteristics:

- validate system behavior
- catch integration bugs

---

## UI Tests

Use when behavior matters.

Examples:

- user workflows
- complex interactions
- form behavior

Avoid snapshot-heavy testing.

---

# Repository Testing Priorities

The following areas should receive test investment first.

## Priority 1

- nutrition-calcs
- nutrient calculations
- dietary-rules
- recipe-scaling
- unit-conversion
- glycemic-load

---

## Priority 2

- recipe workflows
- food logging workflows
- meal planning workflows
- grocery generation

---

## Priority 3

- authentication
- authorization
- API validation

---

## Priority 4

- publishing workflows
- sharing workflows
- administrative functionality

---

# Backend Testing Strategy

Backend tests should validate:

- business rules
- validation
- authorization
- persistence behavior

Avoid testing:

- HTTP libraries
- JSON libraries
- database driver internals

Focus on application behavior.

---

# Frontend Testing Strategy

Frontend tests should validate:

- user interactions
- workflow behavior
- calculation presentation
- state transitions

Avoid testing:

- styling
- layout details
- implementation structure

Focus on user-visible outcomes.

---

# Nutrition Testing Requirements

Nutrition is protected functionality.

Changes affecting:

- nutrients
- servings
- BMI
- BMR
- TDEE
- Daily Values
- dietary compliance

must include tests.

No exceptions.

---

# Regression Testing

Every bug fix should include:

1. A failing test.
2. The fix.
3. A passing test.

The bug should not be allowed to reappear.

---

# Test Data Principles

Prefer:

- small datasets
- realistic values
- deterministic inputs

Avoid:

- large fixtures
- random values
- unnecessary complexity

Tests should be easy to understand.

---

# Coverage Philosophy

Coverage is a signal.

Coverage is not a goal.

A well-tested critical calculation is more valuable than dozens of low-value tests.

When choosing between:

- more coverage
- better coverage

prefer better coverage.

---

# Before Merging Changes

For significant changes verify:

## Correctness

- Does behavior work?
- Are calculations correct?

## Regression Safety

- Are tests present?
- Are tests meaningful?

## Risk Areas

- Nutrition
- Health calculations
- Compliance
- Authentication
- Data integrity

Have these areas been protected?

---

# Testing Checklist

Before completing a change:

## Business Logic

- Is the behavior tested?

## Critical Calculations

- Are calculations verified?

## Integration

- Are workflows validated?

## Regression

- Would this bug be caught again?

## Maintainability

- Will future contributors understand the test?

If any answer is no, additional testing may be required.

---

# Success Criteria

The testing strategy succeeds when:

- critical calculations are protected
- regressions are caught early
- refactoring becomes safer
- contributors trust the test suite
- bugs become increasingly difficult to reintroduce

The goal is confidence, not coverage.
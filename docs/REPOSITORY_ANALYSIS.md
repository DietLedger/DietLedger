# Repository Analysis

> This document explains how the repository is organized, where complexity exists, and what future contributors should understand before making changes.
>
> This is not an architecture document.
>
> See:
>
> - ARCHITECTURE.md for system design
> - PROJECT.md for product goals
> - NUTRITION_DOMAIN.md for domain rules
> - DECISIONS.md for historical decisions
> - TESTING_STRATEGY.md for test modifications and planning

---

# Repository Overview

DietLedger is organized into two primary applications:

```text
src/
    Next.js frontend

sync-server/
    Go API

PostgreSQL
    Authoritative datastore
```

Architecture ownership is documented in ARCHITECTURE.md.

---

# Repository Mental Model

The codebase should be understood as:

```text
React Components
    ↓
React Query Hooks
    ↓
API Client
    ↓
Go API
    ↓
PostgreSQL
```

Most new functionality should fit somewhere in this chain.

Avoid introducing alternate paths.

---

# Primary Development Areas

## Frontend

Location:

```text
src/
```

Responsibilities:

- rendering
- user interaction
- workflows
- client-side calculations
- API communication

Key areas:

```text
src/app/
src/components/
src/hooks/
src/lib/
```

---

## Backend

Location:

```text
sync-server/
```

Responsibilities:

- business rules
- validation
- authorization
- persistence
- API endpoints

Key areas:

```text
handlers_*.go
store_postgres.go
repository.go
auth.go
```

---

# Complexity Hotspots

These areas require additional caution.

## Recipes

Current state:

- largest workflow in the system
- highest change frequency
- largest frontend surface area

Risk:

Changes often affect:

- ingredients
- nutrition calculations
- food search
- scaling
- categories
- sharing

Review related functionality before making modifications.

---

## Nutrition Calculations

Location:

```text
src/lib/
```

Examples:

- nutrition-calcs.ts
- dietary-rules.ts
- recipe-scaling.ts
- glycemic-load.ts

Risk:

Incorrect calculations create product defects.

Always validate behavior and update tests.

See NUTRITION_DOMAIN.md.

---

## Store Layer

Location:

```text
sync-server/store_postgres.go
sync-server/repository.go
```

Current state:

- large file
- broad ownership
- high coupling

Risk:

Changes often affect multiple domains.

Review all callers before modifying repository interfaces.

---

## Authentication

Location:

```text
sync-server/auth.go
src/hooks/use-auth.tsx
src/lib/api-client-go.ts
```

Risk:

Authentication impacts the entire application.

Changes require careful validation.

---

# Architectural Debt

These areas are known candidates for future improvement.

## Large Frontend Pages

Notable examples:

```text
recipes/page.tsx
```

Symptoms:

- high complexity
- multiple responsibilities
- difficult testing

Refactor only when necessary.

Avoid large rewrites.

---

## Large Backend Files

Notable examples:

```text
handlers_crud.go
store_postgres.go
```

Symptoms:

- many responsibilities
- difficult navigation
- broad coupling

Prefer incremental improvements.

---

# Historical Artifacts

The repository contains remnants of prior architectures.

Examples:

```text
store_sqlite.go
legacy deployment files
historical planning documents
obsolete specifications
```

Do not assume these represent active architecture.

Consult:

- ARCHITECTURE.md
- DECISIONS.md

before using historical code as a reference.

---

# Testing Priorities

Testing priorities are defined in TESTING_STRATEGY.md.

Repository-specific testing focus areas:

1. Nutrition calculations
2. Recipe workflows
3. Food logging
4. Authentication
5. Meal planning

---

# Before Modifying Code

Use CodeGraph to:

1. Locate symbols.
2. Trace callers.
3. Trace callees.
4. Inspect related tests.
5. Inspect related documentation.

Do not assume behavior from file names alone.

Understand the implementation before proposing changes.

---

# High-Risk Changes

Exercise additional caution when modifying:

- nutrition calculations
- serving calculations
- recipe scaling
- authentication
- authorization
- persistence models
- migration files
- API contracts

These areas have broad impact across the system.

---

# Repository Success Criteria

Successful changes:

- reduce complexity
- preserve correctness
- improve maintainability
- improve testability
- respect ownership boundaries

Unsuccessful changes:

- introduce unnecessary infrastructure
- duplicate existing functionality
- create alternate data flows
- increase cognitive load without clear benefit
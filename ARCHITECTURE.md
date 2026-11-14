# DietLedger Architecture

> This document defines the authoritative architecture of DietLedger.
>
> The primary goals of the architecture are:
>
> * correctness
> * maintainability
> * simplicity
> * solo-developer velocity
> * AI-assisted development
>
> When making architectural decisions, prefer simpler solutions unless additional complexity provides clear and measurable value.

---

# System Overview

DietLedger is a server-authoritative nutrition platform.

The system consists of four primary layers:

```text
Browser
    ↓
Next.js Frontend
    ↓
Go API
    ↓
PostgreSQL
```

Authority flows downward.

The browser is not authoritative.

The frontend is not authoritative.

The API is authoritative.

PostgreSQL is the system of record.

---

# Architectural Principles

## Simplicity Over Abstraction

Prefer:

* direct implementations
* explicit data flow
* straightforward ownership

Avoid:

* unnecessary layers
* speculative abstractions
* framework-driven architecture

---

## Single Source Of Truth

Every piece of data must have a single authoritative owner.

Duplicate ownership creates consistency problems and increases maintenance cost.

---

## Existing Systems First

Before introducing new infrastructure, dependencies, or abstractions:

1. Can PostgreSQL solve the problem?
2. Can the Go API solve the problem?
3. Can existing code solve the problem?

Prefer extending existing systems over creating new systems.

---

## Optimize For One Developer

Architecture should optimize for:

* understanding
* debugging
* maintainability
* low operational burden

Not for hypothetical future organizations.

---

# Technology Stack

## Frontend

Responsibilities:

* rendering
* routing
* user interaction
* presentation logic

Technology:

* Next.js
* React
* TypeScript

---

## API

Responsibilities:

* business rules
* validation
* authorization
* persistence orchestration

Technology:

* Go

The API is the authoritative implementation of domain behavior.

---

## Portable Recipe/Food Identity

Recipes and custom foods persist a namespaced UUID `portableId` independently of their local row key. PostgreSQL generates it once and rejects mutation; owner-scoped uniqueness allows authorized recipe copies to retain identity without sharing edit access. API reads expose it and ordinary update APIs reject attempts to set it. USDA food identity remains its FDC food ID, unrelated to nutrient IDs. Migration 000028 assigns identities to legacy local objects without guessing remote origins. Package transfer integration follows `specs/recipe-nutrition-quarantine-plan.md`; stored identity alone does not imply quarantine/preflight is implemented.

## Ingredient Source Fidelity

PostgreSQL stores ingredient order, deliberate zero-nutrition intent, unresolved typed source identities and unconfirmed package-supplied facts. Missing package dependencies do not become dangling live links: the original reference is retained separately until a later server-authoritative repair verifies a target. Unconfirmed facts retain basis/unit/provenance but do not count as a food match. The Go API validates these contracts and native package round trips; the browser does not infer intent from nutrient values.

## Database

Responsibilities:

* persistent storage
* transactional consistency
* authoritative data ownership

Technology:

* PostgreSQL

All persistent application data belongs in PostgreSQL.

---

# Ownership Model

## PostgreSQL Owns

* users
* foods
* recipes
* books
* food logs
* meal plans
* grocery plans
* nutrition data
* health data
* application settings
* USDA food-specific portion weights and per-user defaults for storing matched foods

PostgreSQL is the authoritative source of domain data.

---

## Go API Owns

* validation
* business rules
* authorization
* calculation orchestration
* persistence operations

Business logic belongs in the API. The Go API validates matched-food identities and storage locations, creates a user's first storage default atomically with the first ingredient location edit, and authorizes explicit default updates. Shared USDA food rows do not store user preferences. Cookbook PDF unit formatting in the browser is presentation-only; it reads food-specific USDA portion weights but never changes stored amounts or nutrient snapshots.

---

## React Query Owns

Server state.

Examples:

* recipes
* foods
* profiles
* meal plans
* food logs
* books
* food storage defaults

React Query is the only client-side cache for server-owned data.

---

## Zustand Owns

Transient UI state.

Examples:

* dialogs
* selections
* editor workflows
* drag and drop state
* temporary UI interactions

Zustand does not own authoritative domain data.

---

## React Component State Owns

Local component concerns.

Examples:

* form visibility
* input state
* temporary interactions

Component state should remain local whenever practical.

---

# Data Flow

## Read Flow

```text
PostgreSQL
    ↓
Go API
    ↓
React Query
    ↓
React Components
```

---

## Write Flow

```text
React Components
    ↓
Go API
    ↓
PostgreSQL
    ↓
React Query Invalidation
    ↓
UI Refresh
```

Frontend writes should not bypass the API.

---

# Domain Boundaries

## Frontend Boundary

The frontend may:

* render data
* collect user input
* manage UI state

The frontend should not become the primary location for business rules.

---

## API Boundary

The API is responsible for:

* enforcing business rules
* validating requests
* coordinating persistence
* protecting data integrity

---

## Database Boundary

The database is responsible for:

* persistence
* constraints
* transactional consistency

The database should not contain application business workflows.

---

# Architectural Decisions

The following decisions are considered settled.

## PostgreSQL Is The Sole Source Of Truth

All persistent application data belongs in PostgreSQL.

---

## Server-Authoritative Architecture

The server is authoritative.

The browser is a client.

---

## REST API Architecture

DietLedger uses a REST-based API architecture.

---

## React Query For Server State

Server-owned state belongs in React Query.

---

## Zustand For UI State

Zustand is limited to transient UI concerns.

---

## Single API Architecture

DietLedger operates as a single application with a single API and a single primary database.

---

## Recipe Share Visibility

Shared recipes use a three-tier visibility model (`private`, `users`, `public`)
enforced server-side by the Go API:

* `public` — anyone can view; appears in community gallery
* `users` — any authenticated DietLedger user can view; appears in gallery for logged-in users
* `private` — owner only; never in gallery

The `/api/share/<token>` GET and `/api/community` endpoints use `optionalAuth`
middleware: they accept requests without a token (anonymous) but attach the user
to context when a valid token is present, enabling visibility-tier enforcement.

Frontend public routes (`/share/*`, `/community`) bypass the `(app)/layout.tsx`
auth redirect so unauthenticated visitors can view public-tier content.

---

# Historical Decisions

The following systems were intentionally removed:

* IndexedDB persistence
* Offline-first synchronization
* Conflict resolution systems
* Local-first architecture
* SQLite production backend
* Tauri support
* Capacitor support
* Next.js API routes

See DECISIONS.md for rationale and historical context.

---

# Architecture Review Checklist

Testing requirements are defined in TESTING_STRATEGY.md.

Before introducing a significant architectural change:

## Ownership

* Who owns the data?
* Is ownership singular?

## Business Logic

* Does this belong in the API?
* Why not?

## Existing Systems

* Can PostgreSQL solve this?
* Can the Go API solve this?
* Can existing code solve this?

## Complexity

* What complexity is being added?
* Is it justified?

## Maintenance

* Will future contributors understand this?
* Does this increase operational burden?

## Documentation

Must the following be updated?

* ARCHITECTURE.md
* DECISIONS.md
* PROJECT.md
* NUTRITION_DOMAIN.md
* API documentation

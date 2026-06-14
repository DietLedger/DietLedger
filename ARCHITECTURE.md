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

PostgreSQL is the authoritative source of domain data.

---

## Go API Owns

* validation
* business rules
* authorization
* calculation orchestration
* persistence operations

Business logic belongs in the API.

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

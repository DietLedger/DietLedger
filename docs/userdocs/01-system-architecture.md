
# System Architecture

## Summary

This document defines the required Phase 1 architecture for DietLedger. It serves as the authoritative reference for system behavior, ownership boundaries, deployment topology, persistence requirements, authentication, testing, and operational constraints.

## Overview

### Purpose

DietLedger Phase 1 provides a hosted, account-based nutrition platform.

### Architectural Goals

- Single authoritative database.
- Single application backend.
- Stateless API services.
- Multi-user ownership enforcement.
- Test-driven development.
- Simplified operational model.

## Architecture

```text
Browser
  -> Next.js Web Application
  -> Go API Server
  -> PostgreSQL
```

### Responsibilities

| Component | Responsibility |
|------------|---------------|
| Next.js | Presentation layer |
| Go API | Business logic, validation, authorization |
| PostgreSQL | Persistent data ownership |
| Browser | User interaction only |

## Data Ownership

All persistent user data must be stored in PostgreSQL.

### Persistent Data

- Accounts
- Recipes
- Ingredients
- Books
- Meal plans
- Grocery lists
- Nutrition data
- Custom foods
- Templates
- Brand kits
- User settings
- API keys and secrets

### Non-Authoritative Client Storage

Allowed uses:

- UI preferences
- Recoverable caches
- Temporary editor state

Not allowed:

- Primary persistence
- Cross-device state ownership
- Secrets

## Authentication and Authorization

### Requirements

- JWT access tokens
- Refresh tokens
- API boundary authorization
- Ownership validation on every private resource

### Security Requirements

- Secrets encrypted at rest
- Private resources isolated per user
- Frontend never trusted for authorization decisions

## Frontend Architecture

### Server State

React Query owns:

- Fetching
- Caching
- Mutation state
- Invalidation

### Client State

Zustand may be used only for:

- Dialog state
- Editor drafts
- Drag-and-drop interactions
- Temporary UI workflows

## Backend Architecture

The Go API server:

- Validates all external input.
- Owns all business logic.
- Applies database migrations.
- Enforces authorization.
- Returns consistent JSON responses.

## Deployment

### Runtime Components

- Frontend container
- API container
- PostgreSQL instance

### Required Environment Variables

- Database connection string
- JWT signing key
- Encryption key
- API URL configuration
- Registration control flag

## Scalability Principles

Phase 1 prioritizes:

- Proper indexing
- Pagination
- Stateless services
- Efficient query design

Phase 1 explicitly excludes:

- Microservices
- Event sourcing
- Distributed caches
- Sharding
- Browser-facing gRPC

## Testing Requirements

### Backend

- Unit tests
- Handler tests
- Repository tests
- Contract tests

### Frontend

- Vitest
- React Testing Library
- Playwright
- API integration tests

## Related Information

- API Reference
- Migration Guide

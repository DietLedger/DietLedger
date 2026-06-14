
# DietLedger Documentation

## Overview

This documentation set defines the Phase 1 architecture, API contract, and migration strategy for DietLedger.

DietLedger Phase 1 is a hosted, multi-user nutrition platform built around a Next.js web application, a Go API server, and PostgreSQL. The objective of Phase 1 is to simplify the existing architecture into a maintainable production system suitable for a solo developer using AI-assisted development.

## Documentation Map

### Architecture

- `01-system-architecture.md`
- Source of truth for architecture, ownership, deployment, authentication, storage, and testing requirements.

### API Reference

- `02-api-reference.md`
- Browser-facing REST API contract.
- Resource ownership rules.
- Authentication model.
- Data model reference.

### Migration Guide

- `03-migration-guide.md`
- Implementation roadmap.
- Phase gates.
- Migration sequencing.
- Verification requirements.

## Audience

This documentation is intended for:

- Developers
- Maintainers
- Contributors
- AI-assisted development agents
- Future architecture reviewers

## Documentation Rules

When conflicts exist:

1. System Architecture is authoritative for architectural decisions.
2. API Reference is authoritative for endpoint contracts.
3. Migration Guide is authoritative for migration sequencing.

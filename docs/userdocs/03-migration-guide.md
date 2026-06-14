
# Migration Guide

## Summary

This document describes the migration path from the current architecture to the DietLedger Phase 1 target architecture.

## Migration Objectives

The migration must achieve the following outcomes:

- PostgreSQL becomes the sole source of truth.
- The Go API becomes the only application backend.
- IndexedDB is removed as authoritative storage.
- Local-only operation is removed.
- Sync infrastructure is removed.
- Existing user-facing functionality remains available.

## Migration Principles

1. Every phase must end with a working system.
2. Test-first development is required.
3. Replacement behavior must exist before deletion.
4. Architectural correctness takes priority over implementation speed.

## Phase Overview

| Phase | Objective |
|---------|-----------|
| 0 | Testing and contract foundation |
| 1 | Lock runtime path to Go API |
| 2 | Complete server ownership |
| 3 | Remove sync infrastructure |
| 4 | Remove IndexedDB architecture |
| 5 | Remove Next.js API routes |
| 6 | Remove obsolete backend architecture |
| 7 | React Query migration |
| 8 | Remove platform remnants |
| 9 | Deployment hardening |
| 10 | Coverage completion and regression |

## Phase Gates

Each phase requires:

- Successful frontend build
- Successful backend build
- Passing tests
- No known feature regressions

## Critical Path

```text
Phase 0
 -> Phase 1
 -> Phase 2
 -> Phase 3
 -> Phase 4
 -> Phase 5
 -> Phase 6
 -> Phase 7
 -> Phase 8
 -> Phase 9
 -> Phase 10
```

## Stop Conditions

Migration must pause when:

- User-facing functionality cannot be preserved.
- Ownership boundaries change.
- Authentication requirements change.
- PostgreSQL ownership is challenged.
- Architectural assumptions become invalid.

## Verification Commands

```bash
npm run lint
npm run test
npm run test:coverage
npm run build

cd sync-server && go test ./...
cd sync-server && go build

docker compose build
```

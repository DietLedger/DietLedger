# AI Architecture Review for DietLedger

Status: Source-driven AI-maintainer review  
Audience: AI coding agents and the human maintainer  
Basis: `AGENTS.md`, CodeGraph review, and current source architecture.

---

## Executive summary

DietLedger is intentionally designed for AI-assisted maintenance: clear ownership boundaries, boring REST contracts, a single Go API, and PostgreSQL as the only authoritative datastore. This is a good architecture for a solo developer because it reduces hidden state, avoids distributed-system complexity, and gives AI agents a small number of source-of-truth documents and implementation paths.

The largest AI-maintenance risk is stale documentation that still describes removed local/offline systems. Future agents must prefer `ARCHITECTURE.md`, `DECISIONS.md`, current Go source, and CodeGraph over older storage diagrams in `DATA_STORE.MD`.

---

## AGENTS.md-derived architecture rules

AI agents working on DietLedger must preserve these architectural constraints:

1. Use CodeGraph for codebase discovery before grep/find/ad-hoc reads when available.
2. Keep work spec-driven; tie changes to written acceptance criteria or explicit user request.
3. Use TDD for behavior changes, bug fixes, domain logic, API changes, persistence changes, and UI behavior.
4. Do not make the browser authoritative.
5. Do not move business rules from the Go API into frontend code.
6. PostgreSQL is authoritative for persistent data.
7. React Query owns client server state.
8. Zustand, if used, owns only transient UI interaction state.
9. Avoid unrelated cleanup, broad rewrites, speculative abstractions, and new infrastructure unless clearly justified.
10. Update relevant docs after every architecture, domain, API, or behavior change.

---

## Source-of-truth hierarchy for AI agents

When sources conflict, use this order:

1. Current user request.
2. Current source code verified through CodeGraph/direct reads.
3. `AGENTS.md` workflow and architecture instructions.
4. `ARCHITECTURE.md`, `DECISIONS.md`, `PROJECT.md`, `NUTRITION_DOMAIN.md`.
5. Tests and migration files.
6. `docs/userdocs/*`.
7. `DATA_STORE.MD` only as historical context until rewritten.

---

## Architecture strengths for AI-assisted development

| Strength | Why it helps humans and AI agents |
|---|---|
| Single API backend | Reduces duplicated behavior and search space. |
| PostgreSQL source of truth | Avoids local/offline conflict resolution and hidden state. |
| Explicit REST handlers | Easy to trace route -> handler -> store -> SQL. |
| Store interface | Clear persistence boundary and method inventory. |
| Migrations in source | Schema history is inspectable and reviewable. |
| Canonical nutrient model | Makes nutrition data mapping and testing more predictable. |
| React Query client state | Standard cache/invalidation model instead of custom sync. |
| Docker Compose deployment | Understandable runtime topology for a single maintainer. |

---

## AI-specific risk register

| Risk | Why it matters | Recommended guardrail |
|---|---|---|
| Stale offline/local docs | Agents may reintroduce IndexedDB/local-first concepts that were intentionally removed. | Rewrite or archive `DATA_STORE.MD`; reference `docs/architecture-review.md` from user docs. |
| API docs lag implementation | Agents may implement endpoints already present or document nonexistent routes. | Generate API docs from `sync-server/server.go` route inventory and `GoApiClient` methods. |
| Frontend calculation drift | Nutrition calculations in UI can diverge from Go API if business logic is added client-side. | Treat frontend calculations as presentation/preview unless server-confirmed; mirror canonical unit fixtures. |
| Hidden auth assumptions | Refresh tokens are JWT-only in current auth service; docs may imply revocation/logout lifecycle. | Document current behavior; add server-side refresh persistence only if explicitly required. |
| Rate-limit proxy ambiguity | In-memory limiter keys by remote address before auth context; proxy/container may collapse identities. | Document limitation; only add edge/distributed limits when deployment exposure requires it. |
| Multi-replica seed processor | Every API process starts the seed processor. | Keep one API replica or add DB locking before scaling API replicas. |
| Large Store interface | Easy for agents to add methods instead of simplifying. | Prefer extending existing domain methods only when necessary; keep ownership clear. |

---

## Recommended documentation cleanup backlog

1. **Rewrite `DATA_STORE.MD`** around the current PostgreSQL-only authoritative runtime.
2. **Expand `docs/userdocs/02-api-reference.md`** from current CodeGraph route inventory and `GoApiClient` methods.
3. **Mark removed systems as historical**: IndexedDB authority, Next.js domain API routes, SQLite production path, sync engine, offline-first queues.
4. **Add a short `docs/userdocs/README.md` link** to `docs/architecture-review.md` and diagram prompts.
5. **Document current auth lifecycle honestly**: login/register/refresh/client logout/API keys; no server logout route unless implemented.

---

## AI-safe change checklist

Before changing architecture or behavior, an AI agent should answer:

- What written spec or acceptance criteria authorizes this change?
- Which source file owns this behavior today?
- Is the data authoritative in PostgreSQL?
- Is the business rule enforced in Go, not only in React?
- What route, handler, store method, migration, and client method are affected?
- What focused failing test proves the intended change?
- Which docs must be updated?
- What exact command verifies the change?

---

## AI architecture narrative

DietLedger is not built like a large enterprise platform; it is built like a maintainable product for a single developer. The architecture deliberately chooses clear boundaries over fashionable complexity:

```text
React renders and interacts.
React Query caches server state.
Next.js proxies same-origin API calls.
Go validates, authorizes, and applies business rules.
PostgreSQL is the source of truth.
```

That simplicity is the system's main architectural asset. AI agents should protect it.

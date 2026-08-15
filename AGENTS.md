# DietLedger Agent Instructions

This repository is maintained by a single developer using AI-assisted development.

Your responsibility is to improve the product while preserving architectural consistency, domain correctness, maintainability, and simplicity.

---

# Required Reading

Always read:

1. AGENTS.md

Read additional documents only when relevant.

## PROJECT.md

Read when working on:

* product features
* roadmap decisions
* prioritization
* workflow design
* user experience decisions

## ARCHITECTURE.md

Read when working on:

* system design
* ownership boundaries
* persistence
* API design
* frontend/backend responsibilities
* infrastructure decisions

## NUTRITION_DOMAIN.md

Read when working on:

* nutrition calculations
* food logging
* recipes
* serving calculations
* nutrient analysis
* dietary compliance
* health metrics

## DECISIONS.md

Read when:

* introducing new technology
* changing architecture
* revisiting prior decisions
* proposing major refactors
* revisiting historical architectural decisions and rationale

## TESTING_STRATEGY.md

Read when:
* interacting with testing requirements, priorities, and standards
* making tests 
* updating tests
* removing tests
* planning tests
* making testing changes

Load only the documents necessary for the current task.

---

# Repository Discovery

## CodeGraph Requirement

If CodeGraph has been initialized for this project and CodeGraph tools are available, coding agents must use CodeGraph for codebase discovery before falling back to grep, find, or ad-hoc file reads.

This applies to:

* locating files, symbols, routes, handlers, components, and tests
* tracing callers and callees
* understanding ownership boundaries and implementation flow
* assessing impact before edits
* proposing architecture changes or implementing significant features

Recommended flow:

1. Use CodeGraph to locate the relevant files and symbols.
2. Trace callers and callees where behavior or ownership is affected.
3. Inspect the identified source files directly.
4. Search for existing patterns, tests, and documentation.
5. Use grep/find only after CodeGraph is insufficient, unavailable, or the task is literal text matching.

Do not assume a system does not exist until it has been verified.

Understand the current implementation before proposing a replacement.

---

# Opencode Workflow Requirements

DietLedger code work must follow the practices exposed by opencode's `using-agent-skills` meta-skill and related engineering skills.

Before starting work:

1. Check which workflow skills apply, including `using-agent-skills`, `spec-driven-development`, `test-driven-development`, `planning-and-task-breakdown`, `source-driven-development`, `incremental-implementation`, `code-review-and-quality`, and any task-specific skill.
2. State assumptions for non-trivial work.
3. Stop and ask when requirements, existing code, or documentation conflict.
4. Push back when the requested approach has concrete product, technical, security, correctness, or maintenance risk.
5. Choose the simplest solution that satisfies the spec.
6. Keep scope tight; do not perform unrelated cleanup, refactors, or feature additions.
7. Verify with evidence before declaring completion.

---

# Spec-Driven Development Requirement

DietLedger is spec-driven. Do not implement code that is not tied to a written spec, issue, plan, or explicit acceptance criteria.

For new features, significant changes, ambiguous requests, architectural decisions, or work touching multiple modules:

1. Create or update a spec before coding.
2. Capture objective, user value, success criteria, affected files/systems, testing strategy, documentation updates, and open questions.
3. Get human approval when the spec changes product behavior, architecture, scope, or acceptance criteria.
4. Keep the spec alive: update it before implementing decisions discovered during the work.

For small, unambiguous fixes, the issue plus a concise implementation note can serve as the spec, but acceptance criteria and verification must still be explicit.

---

# Test-Driven Development Requirement

DietLedger code changes must follow TDD.

For behavior changes, bug fixes, domain logic, API changes, persistence changes, or UI behavior:

1. Write or update a focused failing test first.
2. Run it and confirm it fails for the expected reason.
3. Implement the smallest change that makes it pass.
4. Refactor only while tests remain green.
5. Run the focused test and any broader checks required by risk.

For bugs, reproduce the bug with a failing test before fixing it. If TDD is not practical for a specific change, document why, use the narrowest alternative verification, and add regression coverage where possible.

---

# Development Workflow

When implementing a change:

1. Understand the problem and the governing spec.
2. Understand the existing implementation.
3. Identify ownership boundaries.
4. Reuse existing systems where possible.
5. Make the smallest correct change.
6. Verify the changed behavior with the narrowest useful check.
7. Update the relevant documentation/specs after every change.

Prefer modifying an existing system over creating a new one. Avoid broad rewrites, drive-by refactors, or formatting-only churn outside the files needed for the task.

---

# Design Principles

## Simplicity Wins

Prefer:

* simpler systems
* fewer abstractions
* fewer dependencies
* fewer moving parts

Avoid complexity unless it provides clear user value.

---

## Deletion Is A Feature

Before adding anything ask:

1. Can existing code solve this?
2. Can code be removed?
3. Can complexity be reduced?

Prefer deletion over addition whenever practical.

---

## Optimize For One Developer

The system is intentionally optimized for:

* solo development
* AI-assisted development
* maintainability
* understandability

Do not optimize for hypothetical future teams.

---

## Prefer Existing Patterns

Use existing repository patterns whenever reasonable.

Avoid introducing new architectural styles, frameworks, abstractions, or infrastructure without strong justification.

---

# Architecture Rules

Detailed architecture documentation lives in ARCHITECTURE.md.

Important rules:

* PostgreSQL is authoritative.
* The Go API owns business logic and validation.
* React Query owns server state.
* Zustand owns UI interaction state only.
* The browser is not authoritative.
* API contracts should stay explicit and boring; avoid hidden client-side business rules.

Consult ARCHITECTURE.md before making architectural decisions. New services, persistence patterns, background jobs, external integrations, or state-management approaches require a clear reason and documentation updates.

---

# Deployment Rules

The backend (Go API) and frontend (Next.js) both run as Docker containers on a
remote host (`deploy.example.invalid`). A local `go build` / `npm run build` does NOT update
the running services — only a rebuilt Docker image deployed to the host does.

When producing a deployable tar, follow the conventions in `build-all.bat`:

* Build both images via `docker buildx bake --load -f docker-compose.build.yml`.
* Save a **single combined tar**: `docker save -o docker-build/dietledger-{VERSION}.tar recipetool-dietledger recipetool-api` (VERSION from `package.json`).
* Copy `docker-compose.yml` into `docker-build/`.
* Remote deployment is operator-managed; remote-operation tooling is not included.

Do not invent alternative tar names, locations, or single-image tars.

---

# Nutrition Domain Rules

Nutrition calculations are high-risk functionality.

Changes affecting:

* nutrient calculations
* serving calculations
* BMI
* BMR
* TDEE
* dietary compliance
* health metrics

require careful validation.

Consult NUTRITION_DOMAIN.md before making domain changes.

Incorrect nutrition calculations are product defects.

---

# Refactoring Rules

Prefer:

* fewer files
* clearer ownership
* explicit behavior
* simpler implementations

Avoid:

* speculative abstractions
* enterprise patterns
* unnecessary indirection
* future-proofing without evidence

A simpler system is usually a better system.

---

# Documentation Requirements

Documentation is part of implementation. Update the relevant docs, specs, plans, or ADRs after every change so the written source of truth stays aligned with the code.

## Architecture Changes

Update:

* ARCHITECTURE.md
* DECISIONS.md

## Domain Changes

Update:

* NUTRITION_DOMAIN.md

## Product Changes

Update:

* PROJECT.md

## API Changes

Update:

* API documentation
* API contracts

## Testing Changes

Update:

* TESTING_STRATEGY.md when changing test policy, test tooling, or what must be covered.

---

# Verification Rules

Do not claim a change is complete without evidence.

Verification should match the risk of the change:

* Documentation-only changes: proofread and inspect the diff.
* Small frontend changes: run the relevant lint/type/test command when available; use browser verification when behavior or layout matters.
* Small backend changes: run the focused Go test package first.
* Cross-cutting or domain changes: run focused tests plus any broader checks needed to prove no regression.

If an executable check was not run, state why and identify the non-executable verification performed.

---

# Dependency & Tooling Rules

Do not add dependencies, code generators, frameworks, services, or build tooling unless the task clearly requires it and existing options are insufficient.

Before adding a dependency, confirm:

1. It solves a real current problem.
2. The standard library or existing dependencies cannot reasonably solve it.
3. The maintenance, security, and deployment costs are acceptable.
4. Relevant docs and lockfiles are updated intentionally.

---

# Change Checklist

Before implementing a significant change:

## Product

* What user problem is being solved?
* Which workflow improves?

## Architecture

* Who owns the data?
* Where does the business logic belong?
* Does this introduce unnecessary complexity?

## Existing Systems

* Can existing code solve this?
* Is a new abstraction actually necessary?

## Maintenance

* Will future contributors understand this?
* Does this make the system easier or harder to maintain?

If the answers are unclear, reconsider the approach.

---

# Success Criteria

Successful changes:

* improve user value
* preserve correctness
* reduce complexity
* improve maintainability
* respect ownership boundaries

Unsuccessful changes:

* increase complexity without clear value
* duplicate existing functionality
* introduce unnecessary infrastructure
* solve hypothetical future problems

Favor simplicity, correctness, and maintainability.

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

Before proposing architecture changes or implementing significant features:

1. Use CodeGraph.
2. Locate relevant symbols.
3. Trace callers and callees.
4. Inspect existing implementations.
5. Search for existing patterns.
6. Search for tests.
7. Search for documentation.

Do not assume a system does not exist until it has been verified.

Understand the current implementation before proposing a replacement.

---

# Development Workflow

When implementing a change:

1. Understand the problem.
2. Understand the existing implementation.
3. Identify ownership boundaries.
4. Reuse existing systems where possible.
5. Minimize complexity.
6. Update documentation when required.

Prefer modifying an existing system over creating a new one.

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
* The Go API owns business logic.
* React Query owns server state.
* Zustand owns UI interaction state.
* The browser is not authoritative.

Consult ARCHITECTURE.md before making architectural decisions.

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

Documentation is part of implementation.

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

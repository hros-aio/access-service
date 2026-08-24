# Implementation Plan: Permission Catalog & Dependency Matrix

**Branch**: `015-permission-catalog` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/015-permission-catalog/spec.md`

## Summary

Implement the in-memory **Permission Catalog & Dependency Matrix** inside `PermissionCatalogModule` (`hros-access-service`). The domain loads capability definitions from a static YAML specification (`permission-catalog.yaml`), validates graph integrity and acyclicity at startup to gate readiness probes, indexes definitions in memory for $O(1)$ lookups, provides full-set dependency validation for role assignments, generates shared contracts for `@hros/libs-contracts`, and exposes read-only query endpoints for Role Matrix rendering.

---

## Technical Context

**Language/Version**: TypeScript 5.x+, Node.js 20+

**Primary Dependencies**: NestJS (v10+), js-yaml, class-validator, class-transformer, `@hrms/libs-core`, `@hrms/libs-apis`, `@hros/libs-contracts`

**Storage**: None (Pure in-memory aggregate and directed acyclic graph; zero PostgreSQL/Redis storage per ADR-A2 and SYSTEM_OVERVIEW §5.4).

**Testing**: Jest (Unit testing for DAG cycle detection and dependency rule evaluation; e2e testing for startup probe gating and query APIs).

**Target Platform**: Linux / Kubernetes containerized deployment inside `hros-access-service`.

**Project Type**: Modular domain module inside NestJS polyrepo backend service.

**Performance Goals**: $O(1)$ permission lookup in memory; $<500\text{ms}$ catalog hierarchy query response; startup DAG validation $<50\text{ms}$ for hundreds of capabilities.

**Constraints**: Immutable in-memory state; zero database round trips; hard failure on startup probe if cyclic/dangling dependencies exist; no runtime mutation APIs allowed on permissions.

**Scale/Scope**: ~100-300 fine-grained business capabilities across 10+ core HR modules.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Rule | Compliance Status | Rationale |
|---|---|---|
| Clean Architecture & Layering | PASS | Controllers handle HTTP transport; `PermissionCatalogService` and `PermissionDependencyService` encapsulate domain logic; no DB repos required. |
| Bounded Contexts & Database Isolation | PASS | Operates strictly within `PermissionCatalogModule`; zero foreign keys or direct queries across boundaries. |
| Shared Library-First Approach | PASS | Standard decorators and filters reused from `@hrms/libs-*`; contracts exported to `@hros/libs-contracts`. |
| Strict Type Safety | PASS | `strict: true` compliant; explicit return types and immutable DTO/aggregate interfaces. |
| TDD & Quality Gates | PASS | Unit tests for graph cycle detection, dependency validation, and YAML loading; E2E tests for API endpoints. |
| Code-Owned Permissions (ADR-A2) | PASS | Pure YAML + in-memory graph; no DB tables or runtime DB foreign keys. |

---

## Project Structure

### Documentation (this feature)

```text
specs/015-permission-catalog/
├── plan.md              # Implementation plan
├── research.md          # Technical research & architectural decisions
├── data-model.md        # Value objects & in-memory graph models
├── quickstart.md        # Verification scenarios & test commands
├── contracts/           # API and DTO contracts
│   └── permission-catalog.contract.ts
└── checklists/
    └── requirements.md  # Specification quality checklist
```

### Source Code (repository layout)

```text
src/
└── modules/
    └── permissions/
        ├── config/
        │   └── permission-catalog.yaml
        ├── constants/
        │   └── permission-catalog.constants.ts
        ├── controllers/
        │   └── permissions.controller.ts
        ├── dto/
        │   ├── permission-catalog-response.dto.ts
        │   └── permission-dependencies-response.dto.ts
        ├── errors/
        │   └── permission-catalog.errors.ts
        ├── interfaces/
        │   ├── permission-definition.interface.ts
        │   ├── permission-dependency-graph.interface.ts
        │   └── validation-result.interface.ts
        ├── loaders/
        │   └── permission-catalog.loader.ts
        ├── services/
        │   ├── permission-catalog.service.ts
        │   ├── permission-catalog-validator.service.ts
        │   └── permission-dependency.service.ts
        ├── permissions.module.ts
        └── index.ts
scripts/
└── generate-permission-contracts.ts
test/
└── permissions/
    ├── permission-catalog.e2e-spec.ts
    └── fixtures/
        ├── cyclic-catalog.yaml
        └── dangling-catalog.yaml
```

**Structure Decision**: Structured as an in-memory sub-domain module `src/modules/permissions/` inside `hros-access-service` following Clean Architecture and NestJS modular conventions.

---

## Complexity Tracking

> **No Constitution violations identified.** Design adheres fully to the Constitution, ADR-A2, ADR-A4, and SYSTEM_OVERVIEW §5.

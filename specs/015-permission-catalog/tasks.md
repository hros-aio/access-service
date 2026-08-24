# Tasks: Permission Catalog & Dependency Matrix

**Input**: Design documents from `specs/015-permission-catalog/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

## Format: `[TaskID] [P?] [Story?] Description with file path`
- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: Which user story this task belongs to (`US1`, `US2`, `US3`, `US4`)
- All tasks must strictly include exact file paths

---

## Phase 1: Setup (Module Scaffolding & Shared Interfaces)

**Purpose**: Module structure initialization, schema definition, and interface contracts

- [X] T001 [P] Create domain interfaces and value objects in `src/modules/permissions/interfaces/permission-definition.interface.ts`
- [X] T002 [P] Create graph model interfaces in `src/modules/permissions/interfaces/permission-dependency-graph.interface.ts`
- [X] T003 [P] Create validation result contracts in `src/modules/permissions/interfaces/validation-result.interface.ts`
- [X] T004 [P] Create domain errors for catalog parsing and dependency violations in `src/modules/permissions/errors/permission-catalog.errors.ts`
- [X] T005 [P] Create initial canonical static YAML catalog in `src/modules/permissions/config/permission-catalog.yaml`

---

## Phase 2: Foundational (Parser, In-Memory Graph Index & Module Lifecycle)

**Purpose**: Core YAML loader and dependency graph index construction required by all user stories

**⚠️ CRITICAL**: Must be completed before user story endpoints and validation engines can execute.

- [X] T006 Implement `PermissionCatalogLoader` to parse YAML, validate `resource.action` naming format, and build $O(1)$ memory lookup maps in `src/modules/permissions/loaders/permission-catalog.loader.ts`
- [X] T007 Implement in-memory DAG index builder in `src/modules/permissions/loaders/permission-graph-builder.ts`
- [X] T008 [P] Implement unit tests for YAML parsing and $O(1)$ index lookup in `src/modules/permissions/loaders/permission-catalog.loader.spec.ts`
- [X] T009 Register providers, exported services, and barrel exports in `src/modules/permissions/permissions.module.ts` and `src/modules/permissions/index.ts`

**Checkpoint**: In-memory catalog is loaded, indexed, and available for dependency evaluation and queries.

---

## Phase 3: User Story 4 - Platform Startup Integrity & Cycle Prevention (Priority: P1)

**Goal**: Validate graph acyclicity and referential integrity during startup and fail pod readiness probe on cyclic or dangling dependencies.

**Independent Test**: Provide cyclic or dangling test YAML fixtures to startup lifecycle hooks and verify that `CyclicPermissionDependencyError` or `DanglingPermissionPrerequisiteError` is thrown, halting service bootstrap.

### Tests for User Story 4
- [X] T010 [P] [US4] Create cyclic and dangling fixture YAML files in `test/permissions/fixtures/cyclic-catalog.yaml` and `test/permissions/fixtures/dangling-catalog.yaml`
- [X] T011 [P] [US4] Implement unit tests for DAG cycle detection and dangling prerequisite validation in `src/modules/permissions/services/permission-catalog-validator.service.spec.ts`

### Implementation for User Story 4
- [X] T012 [US4] Implement `PermissionCatalogValidator` with Tarjan's/DFS cycle detection in `src/modules/permissions/services/permission-catalog-validator.service.ts`
- [X] T013 [US4] Hook `PermissionCatalogValidator` into `PermissionCatalogModule.onModuleInit()` lifecycle and readiness health probe gating in `src/modules/permissions/permissions.module.ts`

**Checkpoint**: Pod startup fail-fast integrity validation is active and verified against cyclic and dangling fixtures.

---

## Phase 4: User Story 1 - Administrator Views the Capability Catalog & Role Matrix (Priority: P1) 🎯 MVP

**Goal**: Expose read-only hierarchical query endpoints for the Role Matrix UI grouped by module, resource, and action.

**Independent Test**: Send `GET /permissions/catalog` with admin authentication and verify that capabilities are returned grouped by module and resource with consistent `resource.action` representations.

### Tests for User Story 1
- [X] T014 [P] [US1] Create unit tests for catalog presentation aggregation in `src/modules/permissions/services/permission-catalog.service.spec.ts`
- [X] T015 [P] [US1] Create API integration test for catalog read endpoints and tenant context guard in `test/permissions/permissions-catalog.e2e-spec.ts`

### Implementation for User Story 1
- [X] T016 [P] [US1] Create Response DTOs for catalog query (`PermissionCatalogResponseDto`, `ModuleGroupDto`, `ResourceGroupDto`, `PermissionItemDto`, `PermissionDependenciesResponseDto`) in `src/modules/permissions/dto/permission-catalog-response.dto.ts`
- [X] T017 [US1] Implement `PermissionCatalogService` to aggregate permissions by module and resource in `src/modules/permissions/services/permission-catalog.service.ts`
- [X] T018 [US1] Implement `PermissionCatalogController` with `GET /permissions/catalog` and `GET /permissions/dependencies` in `src/modules/permissions/controllers/permissions.controller.ts`

**Checkpoint**: Administrator can query the complete permission catalog hierarchy and dependency matrix via authenticated REST API.

---

## Phase 5: User Story 2 & User Story 3 - Permission Dependency Validation Engine (Priority: P1/P2)

**Goal**: Provide domain validation engine (`validatePermissionSet`) enforcing prerequisite grants (`location.update` requires `location.view`) and blocking prerequisite revocations when dependent actions remain active.

**Independent Test**: Execute `PermissionDependencyService.validatePermissionSet()` with missing prerequisite view capability and assert validation failure with clear error details; test revoking prerequisite view while action capability remains and assert blocked removal error.

### Tests for User Story 2 & 3
- [X] T019 [P] [US2] Implement unit tests for prerequisite grant enforcement in `src/modules/permissions/services/permission-dependency.service.spec.ts`
- [X] T020 [P] [US3] Implement unit tests for dependent retention revocation blocking in `src/modules/permissions/services/permission-dependency.service.spec.ts`

### Implementation for User Story 2 & 3
- [X] T021 [US2] Implement `PermissionDependencyService.validatePermissionSet()` enforcing prerequisite graph inclusion and unknown/deprecated code rejection in `src/modules/permissions/services/permission-dependency.service.ts`
- [X] T022 [US3] Implement reverse dependent traversal in `PermissionDependencyService` to detect and block prerequisite capability revocation in `src/modules/permissions/services/permission-dependency.service.ts`
- [X] T023 [US2] Export `PermissionDependencyService` in `src/modules/permissions/index.ts` for consumption by `RoleModule`

**Checkpoint**: Role creation and update operations can fully validate resulting permission sets against the dependency engine.

---

## Phase 6: Shared Contract Generation & Export

**Purpose**: Automate code generation of TypeScript types, enums, and module metadata for `@hros/libs-contracts` from `permission-catalog.yaml`.

- [X] T024 [P] Implement code generation script parsing YAML and generating TypeScript contracts in `scripts/generate-permission-contracts.ts`
- [X] T025 Add contract generation workflow and generate exported contracts in `specs/015-permission-catalog/contracts/permission-catalog.contract.ts`

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, end-to-end verification, and final quality gate checks

- [X] T026 [P] Execute all unit and integration test suites (`pnpm test src/modules/permissions`)
- [X] T027 Run quickstart verification scenarios per `specs/015-permission-catalog/quickstart.md`
- [X] T028 [P] Ensure zero lint/type errors (`pnpm lint` and `pnpm build`)

---

## Dependencies & Execution Order

### User Story Dependencies
```
Phase 1 (Setup) ──> Phase 2 (Foundational: Loader & In-Memory Graph)
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
     Phase 3 (US4: Startup DAG)   Phase 4 (US1: Query API - MVP)
             │                           │
             └─────────────┬─────────────┘
                           ▼
              Phase 5 (US2/US3: Dependency Engine)
                           │
                           ▼
              Phase 6 (Shared Contracts) ──> Phase 7 (Polish)
```

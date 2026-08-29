---
description: 'Task list for Multi-Group Cumulative Access Evaluation implementation'
---

# Tasks: Multi-Group Cumulative Access Evaluation

**Input**: Design documents from `/specs/023-multi-group-cumulative-access-evaluation/`
**Prerequisites**: [plan.md](specs/023-multi-group-cumulative-access-evaluation/plan.md), [spec.md](specs/023-multi-group-cumulative-access-evaluation/spec.md), [research.md](specs/023-multi-group-cumulative-access-evaluation/research.md), [data-model.md](specs/023-multi-group-cumulative-access-evaluation/data-model.md), [contracts/bootstrap-capabilities.contract.md](specs/023-multi-group-cumulative-access-evaluation/contracts/bootstrap-capabilities.contract.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (`US1`, `US2`, `US3`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Define core interfaces, domain types, and data access models for effective role projection.

- [x] T001 [P] Create domain interfaces `EffectiveUserRole`, `ScopeConstraint`, `ScopeType`, and `ResourceContext` in `src/modules/authorization/interfaces/effective-user-role.interface.ts`
- [x] T002 [P] Create TypeORM entity `UserEffectiveRoleEntity` mapping `user_effective_roles` table in `src/modules/authorization/entities/user-effective-role.entity.ts`
- [x] T003 Create `UserEffectiveRoleRepository` with multi-tenant query and batch upsert/delete operations in `src/modules/authorization/repositories/user-effective-role.repository.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core projection and cache persistence engines that MUST be complete before access evaluation and guards.

- [x] T004 Implement `UserAuthorizationCacheService` for reading/writing `authz:user:{tenant}:{userId}` with monotonic versioning and recovery in `src/modules/authorization/services/user-authorization-cache.service.ts`
- [x] T005 [P] Unit tests for `UserAuthorizationCacheService` verifying JSON serialization, version bumping, and cache miss fallback in `src/modules/authorization/services/user-authorization-cache.service.spec.ts`
- [x] T006 Implement `EffectiveRoleProjectionService` for computing active group role-scope tuples, atomic diffing, and batch persistence in `src/modules/authorization/services/effective-role-projection.service.ts`
- [x] T007 Integration tests for `EffectiveRoleProjectionService` with real PostgreSQL transaction rollback in `src/modules/authorization/services/effective-role-projection.service.spec.ts`

---

## Phase 3: User Story 1 - Multi-Group Additive Permission & Scope Evaluation (Priority: P1) 🎯 MVP

**Goal**: Pure domain evaluation engine and runtime guard resolving cumulative permissions and computing the logical OR union of scopes.

**Independent Test**: Evaluate access for a user assigned to Group A (`EMPLOYEE`/`SELF`) and Group B (`MANAGER`/`DIRECT_REPORTEES`) to verify they can access self and direct reportees while denying unrelated peers.

- [x] T008 [P] [US1] Unit test suite for `CumulativeAccessEvaluator` covering multi-role permission resolution and scope unions (`SELF`, `DIRECT_REPORTEES`, `COMPANY`, `LOCATION`, `DEPARTMENT`, `TENANT`) in `src/modules/authorization/services/cumulative-access-evaluator.service.spec.ts`
- [x] T009 [US1] Implement `CumulativeAccessEvaluator` pure evaluation service in `src/modules/authorization/services/cumulative-access-evaluator.service.ts`
- [x] T010 [P] [US1] Unit test suite for `AuthorizationGuard` verifying `@RequirePermissions()`, L1/Redis role resolution, and fail-closed behavior in `src/modules/authorization/guards/authorization.guard.spec.ts`
- [x] T011 [US1] Implement in-process `AuthorizationGuard` extracting request context, fetching user cache, and evaluating access via `CumulativeAccessEvaluator` in `src/modules/authorization/guards/authorization.guard.ts`

---

## Phase 4: User Story 2 - Group Unassignment and Partial Scope Revocation (Priority: P2)

**Goal**: Incremental projection diffing ensuring that ceasing to match one group removes only that group's capabilities while preserving other active groups, and clearing all access when zero groups match.

**Independent Test**: Remove a user from one of two active user groups and verify that only the unassigned group's rows are deleted in `user_effective_roles` and reflected in Redis.

- [x] T012 [P] [US2] Integration tests for group unassignment, partial revocation, and zero-group edge case in `src/modules/authorization/services/effective-role-projection.unassign.spec.ts`
- [x] T013 [US2] Enhance `EffectiveRoleProjectionService.recomputeUserEffectiveRoles` with atomic batch deletion for revoked group memberships and zero-group eviction in `src/modules/authorization/services/effective-role-projection.service.ts`
- [x] T014 [US2] Update `UserAuthorizationCacheService` to handle empty roles array `{"version": N, "roles": []}` on zero-group state in `src/modules/authorization/services/user-authorization-cache.service.ts`

---

## Phase 5: User Story 3 - Post-Login Session Bootstrap for Multi-Group Capabilities (Priority: P3)

**Goal**: Provide a post-login bootstrap endpoint returning the cumulative deduplicated permissions, authorized navigation modules, and authorization version without running dynamic matching queries.

**Independent Test**: Call `GET /auth/bootstrap/capabilities` and verify that the returned permissions represent the union across all assigned roles with valid module derivations.

- [x] T015 [P] [US3] Create DTO `BootstrapCapabilitiesResponseDto` in `src/modules/authorization/dto/bootstrap-capabilities-response.dto.ts`
- [x] T016 [P] [US3] Unit tests for `BootstrapAuthorizationService` resolving cumulative permissions and catalog modules in `src/modules/authorization/services/bootstrap-authorization.service.spec.ts`
- [x] T017 [US3] Implement `BootstrapAuthorizationService` aggregating cached roles, resolving permissions, and mapping navigation modules in `src/modules/authorization/services/bootstrap-authorization.service.ts`
- [x] T018 [US3] Implement `BootstrapAuthorizationController` exposing `GET /auth/bootstrap/capabilities` in `src/modules/authorization/controllers/bootstrap-authorization.controller.ts`
- [x] T019 [US3] E2E integration test for bootstrap capabilities endpoint in `test/authorization/bootstrap-capabilities.e2e-spec.ts`

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Module registration, performance validation, and quickstart verification.

- [x] T020 Register all new services, repositories, controllers, and guards in `src/modules/authorization/authorization.module.ts`
- [x] T021 [P] Validate quickstart scenarios against running test suite per `specs/023-multi-group-cumulative-access-evaluation/quickstart.md`

---

## Dependencies & Execution Order

```text
Phase 1 (Setup: T001-T003)
      │
      ▼
Phase 2 (Foundational: T004-T007)
      │
      ├──────────────────────────────┐
      ▼                              ▼
Phase 3 (US1: T008-T011)       Phase 4 (US2: T012-T014)
      │                              │
      └──────────────┬───────────────┘
                     ▼
               Phase 5 (US3: T015-T019)
                     │
                     ▼
               Phase 6 (Polish: T020-T021)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup: Interfaces, Entity, Repository).
2. Complete Phase 2 (Foundational: Projection & Cache services).
3. Complete Phase 3 (US1: `CumulativeAccessEvaluator` & `AuthorizationGuard`).
4. Validate MVP: Multi-group access evaluation and cumulative scope union pass all unit/integration tests.

### Incremental Delivery

1. Add User Story 2: Group unassignment and partial revocation logic.
2. Add User Story 3: Session bootstrap capabilities endpoint.
3. Complete Phase 6: Polish, module wiring, and quickstart validation.

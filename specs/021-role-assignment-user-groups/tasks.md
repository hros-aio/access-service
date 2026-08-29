---

description: "Task list for Role Assignment to User Groups implementation"
---

# Tasks: Role Assignment to User Groups

**Input**: Design documents from `/specs/021-role-assignment-user-groups/`  
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/roles-assignment.contract.json](contracts/roles-assignment.contract.json)

## Format: `- [ ] [TaskID] [P?] [Story?] Description with file path`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (`[US1]`, `[US2]`, `[US3]`, `[US4]`)
- Explicit file paths included for every task

---

## Phase 1: Setup (Shared Types & Exceptions)

**Purpose**: Define the domain exceptions, DTO contracts, and event payloads needed across all role assignment workflows.

- [x] T001 [P] Create `HighImpactConfirmationRequiredError` and role assignment domain errors in `src/modules/user-groups/domain/exceptions/user-group.exceptions.ts`
- [x] T002 [P] Create `UpdateUserGroupRolesDto`, `EstimateRoleAssignmentImpactDto`, and `AssignedRoleItemDto` in `src/modules/user-groups/dto/` and export in `src/modules/user-groups/dto/index.ts`

---

## Phase 2: Foundational (Domain Aggregate & Repository Enhancements)

**Purpose**: Core aggregate mutations and data access methods required for role assignment operations.

**⚠️ CRITICAL**: Must complete before user story application services and controllers.

- [x] T003 Enhance `UserGroupAggregate` with `assignRoles`, `unassignRoles`, and `replaceRoles` methods in `src/modules/user-groups/domain/aggregates/user-group.aggregate.ts`
- [x] T004 [P] Add unit tests for `UserGroupAggregate` role assignment methods in `src/modules/user-groups/domain/aggregates/user-group.aggregate.spec.ts`
- [x] T005 [P] Implement `AuthSecurityEventOutbox.fromUserGroupRolesAssigned` and `fromUserGroupRoleUnassigned` factory methods in `src/modules/auth/entities/auth-security-event-outbox.entity.ts`

**Checkpoint**: Foundation ready — user story implementations can proceed.

---

## Phase 3: User Story 1 - Assign and Unassign Roles on a User Group (Priority: P1) 🎯 MVP

**Goal**: Enable tenant administrators to update role assignments on a user group, incrementing the dirty version and recording transactional outbox events without synchronously modifying user-effective roles.

**Independent Test**: Call `UserGroupRoleAssignmentService.updateRoleAssignments` with target role IDs; verify `user_group_roles` join table updates, `user_groups.version` increments while `projection_version` stays unchanged, and outbox event is saved in the same transaction.

### Implementation for User Story 1

- [x] T006 [US1] Create `UserGroupRoleAssignmentService` orchestrating validation, role delta updates, version bumping, and outbox persistence in `src/modules/user-groups/services/user-group-role-assignment.service.ts`
- [x] T007 [P] [US1] Create unit tests for `UserGroupRoleAssignmentService` in `src/modules/user-groups/services/user-group-role-assignment.service.spec.ts`
- [x] T008 [US1] Register `UserGroupRoleAssignmentService` in `UserGroupModule` providers and exports in `src/modules/user-groups/user-group.module.ts`

**Checkpoint**: User Story 1 functional and independently testable at the service layer.

---

## Phase 4: User Story 2 - Pre-Commit Blast Radius & Impact Estimation (Priority: P2)

**Goal**: Provide pre-commit impact visibility (affected user count, zero-role warnings, high-impact flag) based on materialized group memberships without mutating database state.

**Independent Test**: Call `RoleAssignmentImpactService.estimateRoleAssignmentImpact` with target role IDs on a group with materialized members; verify returned affected user count and zero-role employee count match expectations.

### Implementation for User Story 2

- [x] T009 [US2] Implement `RoleAssignmentImpactService` computing affected users, zero-role edge cases, and threshold comparison in `src/modules/user-groups/services/role-assignment-impact.service.ts`
- [x] T010 [P] [US2] Create unit tests for `RoleAssignmentImpactService` in `src/modules/user-groups/services/role-assignment-impact.service.spec.ts`
- [x] T011 [US2] Integrate `RoleAssignmentImpactService` into `UserGroupRoleAssignmentService` to evaluate impact during updates and register in `src/modules/user-groups/user-group.module.ts`

**Checkpoint**: User Stories 1 and 2 functional and independently testable.

---

## Phase 5: User Story 3 - High-Impact Explicit Confirmation Gate (Priority: P3)

**Goal**: Block high-impact role assignments that exceed the threshold unless explicitly submitted with `confirmed: true`.

**Independent Test**: Attempt a role assignment update where impact exceeds threshold with `confirmed: false`; verify `HighImpactConfirmationRequiredError` (HTTP 422) is thrown and transaction rolls back. Re-attempt with `confirmed: true`; verify transaction succeeds.

### Implementation for User Story 3

- [x] T012 [US3] Enforce high-impact confirmation gating in `UserGroupRoleAssignmentService.updateRoleAssignments` in `src/modules/user-groups/services/user-group-role-assignment.service.ts`
- [x] T013 [P] [US3] Add unit and boundary tests for high-impact confirmation logic in `src/modules/user-groups/services/user-group-role-assignment.service.spec.ts`

**Checkpoint**: High-impact confirmation gate active and enforced.

---

## Phase 6: User Story 4 - View Assigned Roles on a User Group & REST Endpoints (Priority: P4)

**Goal**: Expose secure, tenant-isolated REST endpoints to query assigned roles, estimate impact, and update role assignments.

**Independent Test**: Call `GET /user-groups/:id/roles`, `POST /user-groups/:id/roles/impact-estimate`, and `PUT /user-groups/:id/roles` via HTTP client with JWT auth and permission guards; verify proper status codes and tenant scoping.

### Implementation for User Story 4

- [x] T014 [US4] Implement `UserGroupRoleController` exposing `GET`, `PUT`, and `POST /impact-estimate` endpoints with Swagger docs and permission guards in `src/modules/user-groups/controllers/user-group-role.controller.ts`
- [x] T015 [P] [US4] Create unit/controller tests for `UserGroupRoleController` in `src/modules/user-groups/controllers/user-group-role.controller.spec.ts`
- [x] T016 [US4] Register `UserGroupRoleController` in `UserGroupModule` in `src/modules/user-groups/user-group.module.ts`

**Checkpoint**: All user stories exposed via REST API and independently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end verification, linting, and alignment with system architecture and documentation.

- [x] T017 [P] Run linter and formatting checks across all modified and created files
- [x] T018 Execute unit test suite for user groups module (`npm test -- user-group`)
- [x] T019 Validate quickstart test scenarios against `specs/021-role-assignment-user-groups/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS user story implementations.
- **User Story 1 (Phase 3)**: Depends on Phase 2.
- **User Story 2 (Phase 4)**: Depends on Phase 2 & Phase 3 data structures.
- **User Story 3 (Phase 5)**: Depends on Phase 3 & Phase 4.
- **User Story 4 (Phase 6)**: Depends on Phase 3, 4, 5 services.
- **Polish (Phase 7)**: Depends on all user story phases.

### Parallel Opportunities

- T001 and T002 can run in parallel (different files in domain exceptions and DTOs).
- T004 and T005 can run in parallel.
- T007 (unit tests) can run in parallel with T008 (module wiring).
- T010 (impact tests) and T015 (controller tests) can run in parallel with their respective service implementations.

---

## Implementation Strategy

### MVP First (User Story 1 Only)
1. Complete Phase 1 (Setup) and Phase 2 (Foundational).
2. Complete Phase 3 (User Story 1 - `UserGroupRoleAssignmentService`).
3. Validate User Story 1 independently with unit tests.

### Incremental Delivery
1. Add User Story 2 (`RoleAssignmentImpactService`).
2. Add User Story 3 (High-impact gate enforcement).
3. Add User Story 4 (`UserGroupRoleController` REST endpoints).
4. Run full test suite and quickstart validation.

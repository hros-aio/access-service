# Tasks: Custom Role Lifecycle Management

**Input**: Design documents from `/specs/017-custom-roles/` (`plan.md`, `spec.md`, `data-model.md`, `contracts/custom-roles.openapi.yaml`, `research.md`, `quickstart.md`)

**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories), `data-model.md`, `contracts/`

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Update domain event types, DTO contracts, and shared exception definitions.

- [X] T001 [P] Add role lifecycle security event types (`role.created`, `role.copied`, `role.deactivated`, `role.reactivated`) to `src/enums/event-type.enum.ts`
- [X] T002 [P] Create DTO request classes (`CreateCustomRoleDto`, `CopyRoleDto`, `UpdateCustomRoleDto`, `DeactivateRoleDto`, `RoleImpactResponseDto`) in `src/modules/roles/dto/role.dto.ts`
- [X] T003 [P] Extend role custom exceptions (`InvalidRoleTypeException`, `RoleDeactivationConfirmationRequiredException`, `RoleVersionConflictException`) in `src/modules/roles/exceptions/role.exceptions.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core entity outbox factory methods and repository queries for reach metrics.

**⚠️ CRITICAL**: Must complete before user story implementations.

- [X] T004 Add static factory methods to `AuthSecurityEventOutbox` (`fromRoleCreated`, `fromRoleCopied`, `fromRoleDeactivated`, `fromRoleReactivated`) in `src/modules/auth/entities/auth-security-event-outbox.entity.ts`
- [X] T005 [P] Add `countAssignedUserGroups(roleId, tenantCode)` and `countActiveUserReach(roleId, tenantCode)` queries in `src/modules/roles/repositories/role.repository.ts`
- [X] T006 [P] Update `RoleResponseDto` to include `isUnassigned`, `assignedUserGroupCount`, and `activeUserReachCount` in `src/modules/roles/dto/role.dto.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Create Custom Role from Scratch (Priority: P1) 🎯 MVP

**Goal**: Allow tenant administrators to create new active custom roles with tenant-unique names and validated capability dependencies, persisting permissions and synchronizing Redis cache.

**Independent Test**: Send `POST /authorization/roles` with unique name and valid permissions (e.g., `['employee.view', 'employee.update']`), verify role is persisted with `type = 'CUSTOM'`, `version = 1`, permissions inserted with `is_protected = false`, Redis cache seeded, and outbox event `role.created` saved. Verify 422 on dependency error and 409 on duplicate name.

### Implementation for User Story 1

- [X] T007 [US1] Implement `createCustomRole(dto)` in `src/modules/roles/services/role.application.service.ts` with name uniqueness check, `PermissionDependencyService.validatePermissionSet()` verification, transactional persistence into `roles` & `role_permissions`, outbox event logging, and synchronous Redis cache seeding
- [X] T008 [US1] Expose `POST /roles` endpoint in `src/modules/roles/controllers/role.controller.ts` with Swagger documentation and DTO validation
- [X] T009 [US1] Add unit and integration tests for custom role creation, DAG dependency enforcement, and name conflict handling in `src/modules/roles/services/role.application.service.spec.ts`

**Checkpoint**: User Story 1 is fully functional and testable independently as the core MVP.

---

## Phase 4: User Story 2 - Clone / Copy Existing Role (Priority: P2)

**Goal**: Allow administrators to clone an existing System or Custom role into a new Custom role, decoupling from system templates and resetting all permission protection flags (`is_protected = FALSE`).

**Independent Test**: Send `POST /authorization/roles/:id/copy` for a System role with protected permissions, verify the new role is created with `type = 'CUSTOM'`, `systemRoleKey = null`, all permissions have `is_protected = false`, and cross-tenant copying is rejected with 404.

### Implementation for User Story 2

- [X] T010 [US2] Implement `copyRole(sourceRoleId, dto)` in `src/modules/roles/services/role.application.service.ts` validating source role tenant isolation, target name uniqueness, cloning permissions with `is_protected = false`, persisting `role.copied` outbox event, and synchronously updating Redis
- [X] T011 [US2] Expose `POST /roles/:id/copy` endpoint in `src/modules/roles/controllers/role.controller.ts`
- [X] T012 [US2] Add unit tests for role cloning and protection reset verification in `src/modules/roles/services/role.application.service.spec.ts`

**Checkpoint**: User Stories 1 and 2 work independently.

---

## Phase 5: User Story 3 - Modify Role Details and Permissions with Impact Safeguards (Priority: P2)

**Goal**: Allow updating custom role details and permissions with optimistic locking (`version`), capability dependency validation, pre-commit blast-radius estimation, and immediate Redis cache synchronization.

**Independent Test**: Send `PUT /authorization/roles/:id` with matching version to update permissions, verify version increments, Redis cache overwrites, and stale version updates fail with 409 Conflict. Send `GET /authorization/roles/:id/impact` to verify reach estimation.

### Implementation for User Story 3

- [X] T013 [P] [US3] Implement `estimateImpact(roleId)` in `src/modules/roles/services/role.application.service.ts` returning assigned user groups and active user reach counts
- [X] T014 [US3] Update `updateCustomRole(roleId, dto)` in `src/modules/roles/services/role.application.service.ts` to enforce custom role modification constraints (block system role mutations), optimistic concurrency locking on `roles.version`, DAG dependency validation, `role_permissions` diffing, outbox event generation, and synchronous Redis cache overwrite
- [X] T015 [US3] Expose `GET /roles/:id/impact` and `PUT /roles/:id` endpoints in `src/modules/roles/controllers/role.controller.ts`
- [X] T016 [US3] Add unit tests for role updates, optimistic concurrency conflict handling, and impact pre-checks in `src/modules/roles/services/role.application.service.spec.ts`

**Checkpoint**: User Stories 1, 2, and 3 work independently.

---

## Phase 6: User Story 4 - Custom Role Deactivation and Reactivation (Priority: P3)

**Goal**: Enable soft-deactivation with multi-group impact warnings and reactivation, immediately revoking or restoring capability evaluations while maintaining full audit continuity.

**Independent Test**: Attempt deactivating an assigned role without confirmation to verify impact warning response. Confirm deactivation and verify status becomes `INACTIVE`, version bumps, and Redis cache is updated. Reactivate and verify transition back to `ACTIVE`.

### Implementation for User Story 4

- [X] T017 [US4] Implement `deactivateRole(roleId, dto)` in `src/modules/roles/services/role.application.service.ts` checking assigned group impact, requiring explicit confirmation if assigned, updating status to `INACTIVE`, bumping version, recording `role.deactivated` outbox event, and updating Redis cache to empty/inactive state
- [X] T018 [US4] Implement `reactivateRole(roleId)` in `src/modules/roles/services/role.application.service.ts` restoring status to `ACTIVE`, bumping version, recording `role.reactivated` outbox event, and restoring Redis cache entry
- [X] T019 [US4] Expose `POST /roles/:id/deactivate` and `POST /roles/:id/reactivate` endpoints in `src/modules/roles/controllers/role.controller.ts`
- [X] T020 [US4] Add unit tests for role deactivation guard, impact warning confirmation, and reactivation in `src/modules/roles/services/role.application.service.spec.ts`

**Checkpoint**: User Stories 1, 2, 3, and 4 work independently.

---

## Phase 7: User Story 5 - Role Listing, Inspection, and Unassigned Badging (Priority: P3)

**Goal**: Expose query endpoints listing and inspecting roles with tenant isolation, `is_unassigned` badges, active user reach metrics, and permission protection flags.

**Independent Test**: Send `GET /authorization/roles` and verify custom roles without user groups display `isUnassigned: true`, assigned roles display `isUnassigned: false` with accurate `activeUserReachCount`, and queries across tenants are isolated.

### Implementation for User Story 5

- [X] T021 [US5] Update `listRoles()` and `getRoleById()` in `src/modules/roles/services/role.application.service.ts` to enrich role responses with `isUnassigned` and `activeUserReachCount` using repository join/count helpers
- [X] T022 [US5] Add query filter support (`type`, `status`) to `GET /roles` in `src/modules/roles/controllers/role.controller.ts`
- [X] T023 [US5] Add unit tests for role queries, filtering, unassigned indicators, and reach metrics in `src/modules/roles/services/role.application.service.spec.ts`

**Checkpoint**: All 5 user stories are functional and testable.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Verify end-to-end integration, validate against quickstart scenarios, and ensure documentation sync.

- [X] T024 [P] Verify OpenAPI/Swagger decorators and tags across all role endpoints in `src/modules/roles/controllers/role.controller.ts`
- [X] T025 Execute end-to-end test validation matching all scenarios in `specs/017-custom-roles/quickstart.md`
- [X] T026 [P] Ensure ESLint and Prettier formatting compliance across all touched files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories.
- **User Stories (Phase 3+)**: All depend on Phase 2 completion.
  - US1 (Create) -> Core MVP.
  - US2 (Copy), US3 (Update), US4 (Deactivate/Reactivate), and US5 (Query/Metrics) can proceed in priority order.
- **Polish (Phase 8)**: Depends on all user stories being complete.

### Parallel Opportunities

- Setup tasks T001, T002, T003 can execute concurrently.
- Foundational tasks T005, T006 can execute concurrently.
- Polish tasks T024, T026 can run in parallel.

---

## Implementation Strategy

### MVP First (User Story 1 Only)
1. Complete Phase 1: Setup (T001 - T003)
2. Complete Phase 2: Foundational (T004 - T006)
3. Complete Phase 3: User Story 1 (T007 - T009)
4. **Validate**: Test custom role creation, DAG dependency enforcement, and cache seeding independently.

### Incremental Delivery
1. Add User Story 2 (T010 - T012) -> Role cloning with protection reset.
2. Add User Story 3 (T013 - T016) -> Mutation, optimistic locking, and impact analysis.
3. Add User Story 4 (T017 - T020) -> Deactivation impact guards and reactivation.
4. Add User Story 5 (T021 - T023) -> Unassigned badging and reach query APIs.
5. Complete Polish & E2E Verification (T024 - T026).

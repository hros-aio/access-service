# Tasks: User Group Definition & Lifecycle

**Input**: Design documents from `/specs/018-user-group-lifecycle/` (`plan.md`, `spec.md`, `data-model.md`, `contracts/user-groups.openapi.yaml`, `research.md`, `quickstart.md`)

**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories), `data-model.md`, `contracts/`

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure & Types)

**Purpose**: Establish database migrations, domain enums, exceptions, and event definitions.

- [X] T001 [P] Create TypeORM database migration for `user_groups` and `user_group_roles` tables with composite unique constraints and GIN index on `rule_attribute_keys` in `src/migrations/1724700000000-create-user-groups-and-user-group-roles.ts`
- [X] T002 [P] Create `UserGroupStatus` (`ACTIVE`, `INACTIVE`) and `ScopeType` (`SELF`, `DIRECT_REPORTEES`, `COMPANY`, `LOCATION`, `DEPARTMENT`, `TENANT_WIDE`) enums in `src/modules/user-groups/domain/enums/`
- [X] T003 [P] Define custom domain exceptions (`InvalidMatchingRuleError`, `ConcurrentModificationError`, `UserGroupNotFoundError`, `InvalidScopeError`, `DuplicateUserGroupNameError`, `InvalidStateTransitionError`) in `src/modules/user-groups/domain/exceptions/user-group.exceptions.ts`
- [X] T004 [P] Add user group event types (`user_group.created`, `user_group.updated`, `user_group.deactivated`, `user_group.reactivated`, `authorization.user-group-updated`) in `src/enums/event-type.enum.ts`

---

## Phase 2: Foundational (Entities, Repositories, Rule Engine)

**Purpose**: Core domain entities, TypeORM persistence mappings, matching rule validation engine, and outbox event builders.

**⚠️ CRITICAL**: Must complete before user story application services.

- [X] T005 [P] Create `UserGroupEntity` and `UserGroupRoleEntity` with TypeORM decorators and relations in `src/modules/user-groups/entities/`
- [X] T006 [P] Implement `MatchingRuleValidator` with closed attribute allow-list, operator validation, and `rule_attribute_keys` extraction in `src/modules/user-groups/domain/validators/matching-rule.validator.ts`
- [X] T007 [P] Create unit tests for `MatchingRuleValidator` testing valid combinations, unsupported attributes, and invalid operators in `src/modules/user-groups/services/matching-rule.validator.spec.ts`
- [X] T008 [P] Implement `UserGroup` domain aggregate root enforcing status transitions, scope rules, and dirty-state version counters in `src/modules/user-groups/domain/aggregates/user-group.aggregate.ts`
- [X] T009 [P] Implement `UserGroupRepository` and `UserGroupRoleRepository` enforcing tenant scoping in `src/modules/user-groups/repositories/`
- [X] T010 [P] Add static factory methods to `AuthSecurityEventOutbox` (`fromUserGroupCreated`, `fromUserGroupUpdated`, `fromUserGroupDeactivated`, `fromUserGroupReactivated`) in `src/modules/auth/entities/auth-security-event-outbox.entity.ts`
- [X] T011 Create `UserGroupModule` registering entities, repositories, and providers in `src/modules/user-groups/user-group.module.ts` and import into `src/app.module.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Create Dynamic User Group with Scopes and Matching Rules (Priority: P1) 🎯 MVP

**Goal**: Allow tenant administrators to create new active User Groups with tenant-unique names, scope configuration, validated matching criteria, and optional assigned roles, persisting outbox events and setting dirty state (`version = 1, projection_version = 0`).

**Independent Test**: Send `POST /admin/user-groups` with valid payload (scope, matching rules, roles). Verify 201 Created with `status: ACTIVE`, `version: 1`, `projectionVersion: 0`, `isPendingSync: true`, and outbox event persisted. Verify 400 on disallowed attributes and 409 on duplicate name.

### Implementation for User Story 1

- [X] T012 [P] [US1] Create request DTO `CreateUserGroupDto` with class-validator decorators in `src/modules/user-groups/dto/create-user-group.dto.ts`
- [X] T013 [US1] Implement `createUserGroup(dto)` in `src/modules/user-groups/services/user-group-lifecycle.service.ts` validating name uniqueness within tenant, parsing rules via `MatchingRuleValidator`, assigning roles, setting `version = 1, projection_version = 0`, and persisting outbox events (`user_group.created` and `authorization.user-group-updated`) in a transaction
- [X] T014 [US1] Expose `POST /admin/user-groups` endpoint in `src/modules/user-groups/controllers/user-group-admin.controller.ts`
- [X] T015 [US1] Add unit tests for `createUserGroup` verifying validation, zero-role draft handling, duplicate rejection, and outbox creation in `src/modules/user-groups/services/user-group-lifecycle.service.spec.ts`

**Checkpoint**: User Story 1 is fully functional and testable independently as the core MVP.

---

## Phase 4: User Story 2 - Modify User Group Configuration and Roles (Priority: P2)

**Goal**: Allow administrators to update user group metadata, matching rules, scope, and role assignments while enforcing optimistic concurrency version checks and setting the group dirty for synchronization.

**Independent Test**: Send `PUT /admin/user-groups/:id` with matching version token. Verify version increments to 2, `isPendingSync: true`, and outbox events saved. Verify stale version submits fail with 409 Conflict.

### Implementation for User Story 2

- [X] T016 [P] [US2] Create request DTO `UpdateUserGroupDto` in `src/modules/user-groups/dto/update-user-group.dto.ts`
- [X] T017 [US2] Implement `updateUserGroup(id, dto, expectedVersion)` in `src/modules/user-groups/services/user-group-lifecycle.service.ts` enforcing optimistic concurrency check (`version = expectedVersion`), updating metadata/rule/scope/roles, incrementing `version`, and persisting `user_group.updated` and `authorization.user-group-updated` in outbox
- [X] T018 [US2] Expose `PUT /admin/user-groups/:id` endpoint in `src/modules/user-groups/controllers/user-group-admin.controller.ts`
- [X] T019 [US2] Add unit tests for `updateUserGroup` verifying optimistic locking conflict (409), rule updates, and role delta persistence in `src/modules/user-groups/services/user-group-lifecycle.service.spec.ts`

**Checkpoint**: User Stories 1 and 2 work independently.

---

## Phase 5: User Story 3 - User Group Deactivation and Reactivation (Priority: P2)

**Goal**: Enable administrators to deactivate active user groups (scheduling member access revocation) and reactivate inactive groups (scheduling access restoration) with optimistic concurrency locks.

**Independent Test**: Send `POST /admin/user-groups/:id/deactivate` with version token; verify status updates to `INACTIVE`, version bumps, `isPendingSync: true`, and `user_group.deactivated` written to outbox. Send `POST /admin/user-groups/:id/reactivate`; verify status updates to `ACTIVE` and `user_group.reactivated` recorded.

### Implementation for User Story 3

- [X] T020 [P] [US3] Create request DTO `LifecycleTransitionDto` in `src/modules/user-groups/dto/lifecycle-transition.dto.ts`
- [X] T021 [US3] Implement `deactivateUserGroup(id, expectedVersion)` and `reactivateUserGroup(id, expectedVersion)` in `src/modules/user-groups/services/user-group-lifecycle.service.ts` verifying state transitions, bumping version, and logging outbox events
- [X] T022 [US3] Expose `POST /admin/user-groups/:id/deactivate` and `POST /admin/user-groups/:id/reactivate` endpoints in `src/modules/user-groups/controllers/user-group-admin.controller.ts`
- [X] T023 [US3] Add unit tests for deactivation/reactivation lifecycle flows and invalid transition rejections in `src/modules/user-groups/services/user-group-lifecycle.service.spec.ts`

**Checkpoint**: User Stories 1, 2, and 3 work independently.

---

## Phase 6: User Story 4 - User Group Listing, Details Query, and Status Indicators (Priority: P3)

**Goal**: Provide tenant-isolated queries returning user group details, paginated summaries, draft zero-role flags (`hasNoAssignedRoles: true`), and dirty synchronization indicators (`isPendingSync: true`).

**Independent Test**: Query `GET /admin/user-groups` and `GET /admin/user-groups/:id`. Verify tenant isolation (404 on cross-tenant ID), correct pagination, accurate `isPendingSync` and `hasNoAssignedRoles` indicators.

### Implementation for User Story 4

- [X] T024 [P] [US4] Create response DTOs `UserGroupDetailsDto`, `UserGroupSummaryDto`, and query DTO `UserGroupQueryDto` in `src/modules/user-groups/dto/`
- [X] T025 [US4] Implement `UserGroupQueryService` (`getUserGroupById`, `listUserGroups`) calculating `isPendingSync: version > projection_version` and `hasNoAssignedRoles: roles.length === 0` in `src/modules/user-groups/services/user-group-query.service.ts`
- [X] T026 [US4] Expose `GET /admin/user-groups` and `GET /admin/user-groups/:id` endpoints in `src/modules/user-groups/controllers/user-group-admin.controller.ts`
- [X] T027 [US4] Add unit and integration tests for user group queries, pagination, search filtering, and cross-tenant protection in `src/modules/user-groups/services/user-group-query.service.spec.ts`

**Checkpoint**: All 4 user stories are functional and testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify end-to-end integration, validate against quickstart scenarios, and ensure API documentation sync.

- [X] T028 [P] Add OpenAPI / Swagger decorators to `UserGroupAdminController` and DTOs matching `specs/018-user-group-lifecycle/contracts/user-groups.openapi.yaml`
- [X] T029 Execute end-to-end test validation covering all scenarios in `specs/018-user-group-lifecycle/quickstart.md` in `test/user-groups.e2e-spec.ts`
- [X] T030 [P] Ensure ESLint and Prettier formatting compliance across all `src/modules/user-groups/` files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories.
- **User Stories (Phase 3+)**: All depend on Phase 2 completion.
  - US1 (Create) -> Core MVP.
  - US2 (Update), US3 (Deactivate/Reactivate), and US4 (Query/Inspect) can proceed in priority order.
- **Polish (Phase 7)**: Depends on all user stories being complete.

### Parallel Opportunities

- Setup tasks T001, T002, T003, T004 can execute concurrently.
- Foundational tasks T005, T006, T007, T008, T009, T010 can execute in parallel.
- Polish tasks T028, T030 can execute in parallel.

---

## Implementation Strategy

1. **MVP First**: Deliver Phase 1, Phase 2, and Phase 3 (US1: Create User Group) to establish the working core.
2. **Incremental Enhancements**: Add updates with optimistic locking (US2), lifecycle state transitions (US3), and query/inspection endpoints (US4).
3. **Validation**: Execute integration and quickstart validation suite (Phase 7) to guarantee zero cross-tenant leakage and 100% outbox event atomicity.

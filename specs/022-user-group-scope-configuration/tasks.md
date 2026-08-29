# Tasks: User Group Scope Configuration

**Input**: Design documents from `specs/022-user-group-scope-configuration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup & Data Model Alignment

**Purpose**: Verify and prepare domain models, enums, and outbox event constants.

- [x] T001 [P] Ensure `ScopeType` members (`SELF`, `DIRECT_REPORTEES`, `COMPANY`, `LOCATION`, `DEPARTMENT`, `TENANT_WIDE`, and alias `TENANT`) are defined in `src/modules/user-groups/domain/enums/scope-type.enum.ts`
- [x] T002 [P] Register `USER_GROUP_SCOPE_UPDATED = 'user_group.scope_updated'` in `src/enums/event-type.enum.ts`
- [x] T003 [P] Add outbox builder method `fromUserGroupScopeUpdated` in `src/modules/auth/entities/auth-security-event-outbox.entity.ts`

---

## Phase 2: Foundational (Domain Validators & Impact Engine)

**Purpose**: Core scope validation invariants and non-mutating impact calculation engine.

- [x] T004 [P] Implement `UserGroupScopeValidator` enforcing scope type allow-list and reference ID requirements (`scopeRefId` mandatory for `COMPANY`, `LOCATION`, `DEPARTMENT`; normalized to `null` for `SELF`, `DIRECT_REPORTEES`, `TENANT_WIDE`) in `src/modules/user-groups/domain/validators/user-group-scope.validator.ts`
- [x] T005 [P] Implement unit tests for `UserGroupScopeValidator` in `src/modules/user-groups/domain/validators/user-group-scope.validator.spec.ts`
- [x] T006 [P] Implement `UserGroupScopeImpactService` to calculate affected user count from materialized memberships and evaluate high-impact threshold in `src/modules/user-groups/services/user-group-scope-impact.service.ts`
- [x] T007 [P] Implement unit tests for `UserGroupScopeImpactService` in `src/modules/user-groups/services/user-group-scope-impact.service.spec.ts`

---

## Phase 3: User Story 1 - Configure and Update Scope Boundary (Priority: P1) 🎯 MVP

**Goal**: Tenant administrators can view and mutate User Group scope boundaries within a transactional boundary, bumping version and creating outbox events.

**Independent Test**: Update scope on an existing User Group, verify `user_groups.scope_type` and `user_groups.scope_ref_id` are saved, version increments, and audit record is in `auth_security_events_outbox`.

- [x] T008 [US1] Add `updateScope(scopeType, scopeRefId, updatedBy)` method to `UserGroupAggregate` in `src/modules/user-groups/domain/aggregates/user-group.aggregate.ts`
- [x] T009 [P] [US1] Implement unit tests for aggregate scope updates in `src/modules/user-groups/domain/aggregates/user-group.aggregate.spec.ts`
- [x] T010 [P] [US1] Create DTOs `UserGroupScopeDetailsDto` and `UpdateUserGroupScopeDto` in `src/modules/user-groups/dto/`
- [x] T011 [US1] Implement `UserGroupScopeService` with `getScope()` and `updateScope()` (handling optimistic locking, entity updates, and outbox persistence) in `src/modules/user-groups/services/user-group-scope.service.ts`
- [x] T012 [P] [US1] Create unit tests for `UserGroupScopeService` in `src/modules/user-groups/services/user-group-scope.service.spec.ts`
- [x] T013 [US1] Create `UserGroupScopeController` exposing `GET /user-groups/:id/scope` and `PUT /user-groups/:id/scope` in `src/modules/user-groups/controllers/user-group-scope.controller.ts`
- [x] T014 [US1] Register controller and services in `src/modules/user-groups/user-group.module.ts`

---

## Phase 4: User Story 2 - Pre-Commit Blast Radius & Impact Estimation (Priority: P2)

**Goal**: Tenant administrators can preview the estimated blast radius before committing a scope change.

**Independent Test**: Call `POST /user-groups/:id/scope/impact-estimate` with proposed scope, verify calculated affected user count and `requiresConfirmation` flag without database mutation.

- [x] T015 [P] [US2] Create DTOs `EstimateScopeImpactDto` and `ScopeImpactEstimateDto` in `src/modules/user-groups/dto/`
- [x] T016 [US2] Expose `POST /user-groups/:id/scope/impact-estimate` on `UserGroupScopeController` in `src/modules/user-groups/controllers/user-group-scope.controller.ts`
- [x] T017 [P] [US2] Implement controller tests for impact estimation endpoint in `src/modules/user-groups/controllers/user-group-scope.controller.spec.ts`

---

## Phase 5: User Story 3 - High-Impact Explicit Confirmation Gate (Priority: P3)

**Goal**: Prevent accidental large-scale scope changes by requiring explicit confirmation when the affected population exceeds the high-impact threshold.

**Independent Test**: Submit a high-impact scope update with `confirmed: false` (expect HTTP 422), then re-submit with `confirmed: true` (expect HTTP 200).

- [x] T018 [US3] Enforce `HighImpactConfirmationRequiredError` in `UserGroupScopeService.updateScope()` when threshold is exceeded and `confirmed !== true` in `src/modules/user-groups/services/user-group-scope.service.ts`
- [x] T019 [P] [US3] Implement unit/integration tests for high-impact confirmation rejection and bypass in `src/modules/user-groups/services/user-group-scope.service.spec.ts`

---

## Phase 6: User Story 4 - Multi-Tenant Authorization Isolation & Cumulative Union (Priority: P4)

**Goal**: Enforce strict tenant isolation and audit trail logging across all scope operations.

**Independent Test**: Verify cross-tenant requests return HTTP 404, and valid scope changes persist tenant-scoped outbox records.

- [x] T020 [US4] Enforce strict tenant isolation via `RequestContextService.getTenantCode()` and `@RequirePermissions('user_group.update')` across `UserGroupScopeController` and `UserGroupScopeService`
- [x] T021 [P] [US4] Implement end-to-end integration tests verifying tenant isolation, optimistic concurrency conflicts (HTTP 409), and outbox persistence in `src/modules/user-groups/user-group-scope.integration.spec.ts`

---

## Phase 7: Polish & Documentation

**Purpose**: Cross-cutting improvements and test suite validation.

- [x] T022 [P] Export all new DTOs, services, and validators in `src/modules/user-groups/index.ts`
- [x] T023 Run test suite across `src/modules/user-groups/` and verify 100% pass rate

# Tasks: Dynamic Matching Criteria & Population Evaluation

**Input**: Design documents from `/specs/019-user-group-dynamic-matching/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`)

**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories), `research.md`, `data-model.md`, `contracts/`

**Tests**: Unit, integration, and contract tests are included per Constitution TDD standards.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure & Migrations)

**Purpose**: Database schema expansion and baseline projection models

- [X] T001 [P] Create TypeORM database migration adding columns (`company_id`, `location_id`, `department_id`, `grade_id`, `job_title_id`, `employment_status`, `manager_employee_id`, `reportees_count`, `source_version`) to `employee_references` in `src/migrations/1724880000000-extend-employee-references-projection.ts`
- [X] T002 [P] Create TypeORM database migration for `user_group_memberships` and `user_effective_roles` tables with indexes and unique constraints in `src/migrations/1724880001000-create-group-memberships-and-effective-roles.ts`
- [X] T003 Update `EmployeeReference` TypeORM entity with extended columns in `src/modules/employee/entities/employee-reference.entity.ts`
- [X] T004 [P] Create `UserGroupMembership` TypeORM entity in `src/modules/user-groups/entities/user-group-membership.entity.ts`
- [X] T005 [P] Create `UserEffectiveRole` TypeORM entity in `src/modules/user-groups/entities/user-effective-role.entity.ts`
- [X] T006 Export new entities and update `UserGroupModule` & `EmployeeModule` entity registrations in `src/modules/user-groups/entities/index.ts` and `src/modules/user-groups/user-group.module.ts`

---

## Phase 2: Foundational (Repositories & Projection Layer)

**Purpose**: Data access layer and repositories supporting atomic projection updates, conditional version upserts, and member lookups

- [X] T007 Implement `EmployeeReferenceRepository` extended methods (`upsertProjection`, `updateReporteesCount`, `findByEmployeeId`, `findCandidateEmployees`) in `src/modules/employee/repositories/employee-reference.repository.ts`
- [X] T008 [P] Implement `UserGroupMembershipRepository` for batch insert/delete and membership lookups in `src/modules/user-groups/repositories/user-group-membership.repository.ts`
- [X] T009 [P] Implement `UserEffectiveRoleRepository` for minimal diff updates and role evaluations in `src/modules/user-groups/repositories/user-effective-role.repository.ts`
- [X] T010 Unit tests for `EmployeeReferenceRepository` in `src/modules/employee/repositories/employee-reference.repository.spec.ts`
- [X] T011 [P] Unit tests for `UserGroupMembershipRepository` in `src/modules/user-groups/repositories/user-group-membership.repository.spec.ts`

**Checkpoint**: Foundation ready - projection schema, repositories, and data access methods fully tested.

---

## Phase 3: User Story 1 - Administrator Defines User Group Matching Criteria (Priority: P1) 🎯 MVP

**Goal**: Domain parser, validator, and attribute key extractor enforcing closed allow-lists and "all" (AND) combinator logic.

**Independent Test**: Provide criteria definitions (valid, invalid operator, unsupported field, nested OR) to validator and assert correct validation result or domain exception with extracted `ruleAttributeKeys`.

### Tests for User Story 1

- [X] T012 [P] [US1] Unit tests for `MatchingRuleValidator` and domain models in `src/modules/user-groups/domain/validators/matching-rule.validator.spec.ts`

### Implementation for User Story 1

- [X] T013 [US1] Update `MatchingRule` and `RuleClause` value objects and types (supporting both `field`/`attribute` and extended operator vocabulary) in `src/modules/user-groups/domain/value-objects/matching-rule.vo.ts`
- [X] T014 [US1] Enhance `MatchingRuleValidator` to enforce `combinator: 'all'`, closed attribute allow-list (`employmentStatus`, `companyId`, `locationId`, `departmentId`, `gradeId`, `jobTitleId`, `reporteesCount`, `hasReportees`), and operator validation in `src/modules/user-groups/domain/validators/matching-rule.validator.ts`
- [X] T015 [US1] Ensure `UserGroupLifecycleService` and `UserGroupAggregate` invoke the updated validator and populate `rule_attribute_keys` in `src/modules/user-groups/services/user-group-lifecycle.service.ts`

**Checkpoint**: User Story 1 complete - matching rules can be authored, validated against the closed vocabulary, and persisted with indexed attribute keys.

---

## Phase 4: User Story 2 - Employee Automatically Matches or Ceases Matching a User Group (Priority: P1)

**Goal**: In-memory matching engine, parameterized SQL query translator, atomic membership reconciler, and attribute propagation service.

**Independent Test**: Simulate an employee attribute update (e.g., department or status changed); verify candidate group lookup via `rule_attribute_keys && $changed_keys`, pure in-memory rule evaluation, atomic membership diff reconciliation, and cascade to `user_effective_roles`.

### Tests for User Story 2

- [X] T016 [P] [US2] Unit tests for `UserGroupMatchingEngine` (in-memory evaluation & SQL builder) in `src/modules/user-groups/services/user-group-matching.engine.spec.ts`
- [X] T017 [P] [US2] Unit tests for `MembershipReconciler` in `src/modules/user-groups/services/membership-reconciler.service.spec.ts`
- [X] T018 [P] [US2] Unit tests for `EmployeeAttributePropagationService` in `src/modules/user-groups/services/employee-attribute-propagation.service.spec.ts`

### Implementation for User Story 2

- [X] T019 [US2] Implement `UserGroupMatchingEngine` with pure in-memory `evaluate()` and parameterized `buildMatchingQuery()` in `src/modules/user-groups/services/user-group-matching.engine.ts`
- [X] T020 [US2] Implement `MembershipReconciler` (`reconcileSingleEmployee`, `reconcileGroupPopulation`) with atomic diffing and outbox audit logging in `src/modules/user-groups/services/membership-reconciler.service.ts`
- [X] T021 [US2] Implement `EmployeeAttributePropagationService` using array-overlap group candidate queries (`rule_attribute_keys && $changedKeys`) in `src/modules/user-groups/services/employee-attribute-propagation.service.ts`
- [X] T022 [US2] Export and register new services in `src/modules/user-groups/user-group.module.ts`

**Checkpoint**: User Story 2 complete - single-employee attribute modifications evaluate criteria in-memory and reconcile memberships and effective roles atomically.

---

## Phase 5: User Story 3 - Manager Eligibility Updates Based on Reporting Lines (Priority: P2)

**Goal**: Consume directory Kafka lifecycle events with `source_version` idempotency checks, maintain derived `reportees_count` on managers, and trigger dynamic group matching.

**Independent Test**: Ingest `employee.reporting-line-changed` Kafka events; verify old manager reportees count decrements and new manager increments, triggering immediate re-evaluation and manager user group enrollment/revocation.

### Tests for User Story 3

- [X] T023 [P] [US3] Unit and integration tests for `EmployeeLifecycleConsumer` reporting-line and lifecycle events in `src/kafka/consumers/employee-lifecycle.consumer.spec.ts`

### Implementation for User Story 3

- [X] T024 [US3] Update `EmployeeLifecyclePayload` interface and event patterns for directory events (`employee.created`, `employee.updated`, `employee.department-changed`, `employee.location-changed`, `employee.reporting-line-changed`) in `src/kafka/interfaces/employee-lifecycle.interface.ts`
- [X] T025 [US3] Extend `EmployeeLifecycleConsumer` to handle reporting-line changes, update projection rows with `source_version` check, adjust derived `reportees_count`, and invoke `EmployeeAttributePropagationService` in `src/kafka/consumers/employee-lifecycle.consumer.ts`

**Checkpoint**: User Story 3 complete - workforce reporting-line transitions and directory lifecycle events drive manager criteria evaluation automatically.

---

## Phase 6: User Story 4 - Dynamic Population Preview & Impact Estimation (Priority: P3)

**Goal**: Query APIs and estimation services to paginate active members, preview draft criteria matching populations, and estimate impact diffs before saving.

**Independent Test**: Call preview and criteria-impact endpoints with valid/empty rules; verify accurate counts, paginated results, and diff estimations without modifying database state.

### Tests for User Story 4

- [X] T026 [P] [US4] Contract and unit tests for `UserGroupPopulationController` and `UserGroupPopulationQueryService` in `src/modules/user-groups/controllers/user-group-population.controller.spec.ts` and `src/modules/user-groups/services/user-group-population-query.service.spec.ts`

### Implementation for User Story 4

- [X] T027 [P] [US4] Create DTOs (`PreviewMatchingDto`, `CriteriaImpactDto`, `MatchedMemberDto`, `MatchingRuleDto`) in `src/modules/user-groups/dto/`
- [X] T028 [US4] Implement `UserGroupPopulationQueryService` (`getMatchingPopulation`, `previewCriteriaPopulation`, `estimateCriteriaDiff`) in `src/modules/user-groups/services/user-group-population-query.service.ts`
- [X] T029 [US4] Implement `UserGroupPopulationController` exposing `GET /api/v1/user-groups/:id/members`, `POST /api/v1/user-groups/preview-matching`, and `POST /api/v1/user-groups/:id/criteria-impact` in `src/modules/user-groups/controllers/user-group-population.controller.ts`
- [X] T030 [US4] Register controller and service in `src/modules/user-groups/user-group.module.ts`

**Checkpoint**: User Story 4 complete - administrators can preview matching populations and inspect diff impacts with zero side effects.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end verification, performance validation, and security audit hardening

- [X] T031 [P] End-to-end integration test covering criteria authoring, Kafka event ingestion, matching re-evaluation, and effective role materialization in `src/modules/user-groups/user-group-matching.integration.spec.ts`
- [X] T032 [P] Swagger and OpenAPI schema validation against `specs/019-user-group-dynamic-matching/contracts/user-group-matching.openapi.yaml`
- [X] T033 Execute quickstart validation scenarios defined in `specs/019-user-group-dynamic-matching/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Database migrations and entity definitions — no dependencies.
- **Foundational (Phase 2)**: Depends on Phase 1 — blocks all user stories.
- **User Story 1 (Phase 3 - MVP)**: Can start after Phase 2.
- **User Story 2 (Phase 4)**: Depends on Phase 2 & Phase 3 (evaluator uses domain models).
- **User Story 3 (Phase 5)**: Depends on Phase 4 (Kafka consumer invokes propagation service).
- **User Story 4 (Phase 6)**: Depends on Phase 3 & Phase 4 (queries utilize matching engine & repositories).
- **Polish (Phase 7)**: Depends on all user stories being complete.

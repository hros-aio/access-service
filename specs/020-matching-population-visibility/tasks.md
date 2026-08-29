# Tasks: Matching Population Visibility

**Input**: Design documents from `specs/020-matching-population-visibility/`  
**Prerequisites**: [plan.md](file:///home/ren0503/new-hros/admin-module/auth-svc/specs/020-matching-population-visibility/plan.md), [spec.md](file:///home/ren0503/new-hros/admin-module/auth-svc/specs/020-matching-population-visibility/spec.md), [data-model.md](file:///home/ren0503/new-hros/admin-module/auth-svc/specs/020-matching-population-visibility/data-model.md), [contracts/](file:///home/ren0503/new-hros/admin-module/auth-svc/specs/020-matching-population-visibility/contracts/)

## Format: `- [ ] [ID] [P?] [Story?] Description with file path`

- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: User story identifier (`[US1]`, `[US2]`) mapped to `spec.md`

---

## Phase 1: Setup & Foundational Prerequisites

**Purpose**: Shared infrastructure and foundational DTO validations

- [X] T001 [P] Verify and refine DTO contracts in `src/modules/user-groups/dto/preview-matching.dto.ts` and `src/modules/user-groups/dto/user-group-query.dto.ts`
- [X] T002 [P] Verify closed-vocabulary attribute and operator allow-lists in `src/modules/user-groups/domain/validators/matching-rule.validator.ts`

---

## Phase 2: User Story 1 - View Materialized User Group Population (Priority: P1) 🎯 MVP

**Goal**: Provide fast, paginated data access for tenant administrators to view the total count and materialized members of a saved User Group without recomputing dynamic rules.

**Independent Test**: Query an active User Group with materialized members and verify that paginated employee records and total counts are returned accurately, deterministically, and with strict tenant isolation.

### Tests for User Story 1

- [X] T003 [P] [US1] Unit test for paginated membership queries and count computation in `src/modules/user-groups/services/user-group-population-query.service.spec.ts`
- [X] T004 [P] [US1] Unit test for GET `/user-groups/:id/members` endpoint, pagination parameters, and tenant context isolation in `src/modules/user-groups/controllers/user-group-population.controller.spec.ts`

### Implementation for User Story 1

- [X] T005 [US1] Implement `findMembershipsByGroup` and `findMemberEmployeeIdsByGroup` in `src/modules/user-groups/repositories/user-group-membership.repository.ts`
- [X] T006 [US1] Implement `getMatchingPopulation` in `src/modules/user-groups/services/user-group-population-query.service.ts`
- [X] T007 [US1] Implement and decorate `GET /user-groups/:id/members` with `@RequirePermissions('user_group.view')` and Swagger docs in `src/modules/user-groups/controllers/user-group-population.controller.ts`

**Checkpoint**: At this point, User Story 1 (Materialized Group Population Visibility) is fully functional and independently testable.

---

## Phase 3: User Story 2 - Real-Time Matching Criteria Preview in Draft Mode (Priority: P2)

**Goal**: Execute read-only dynamic matching evaluation against the `employee_references` projection to return estimated matching counts and sample matched employee records during draft rule authoring without mutating state.

**Independent Test**: Post a draft criteria payload to the preview endpoint and verify that total count and bounded sample matching records (up to 50) are returned with zero state mutation.

### Tests for User Story 2

- [X] T008 [P] [US2] Unit test for parameterized SQL query generation across operators (`eq`, `in`, `gt`, `exists`) in `src/modules/user-groups/services/user-group-matching.engine.spec.ts`
- [X] T009 [P] [US2] Unit test for draft criteria preview and zero-match handling in `src/modules/user-groups/services/user-group-population-query.service.spec.ts`
- [X] T010 [P] [US2] Unit test for POST `/user-groups/preview-matching` controller and 400 validation error handling in `src/modules/user-groups/controllers/user-group-population.controller.spec.ts`

### Implementation for User Story 2

- [X] T011 [US2] Implement safe parameterized matching query generation in `src/modules/user-groups/services/user-group-matching.engine.ts`
- [X] T012 [US2] Implement `previewCriteriaPopulation` with concurrent count/bounded sample query execution in `src/modules/user-groups/services/user-group-population-query.service.ts`
- [X] T013 [US2] Implement and decorate `POST /user-groups/preview-matching` with `@RequirePermissions('user_group.view')` in `src/modules/user-groups/controllers/user-group-population.controller.ts`

**Checkpoint**: At this point, User Stories 1 and 2 are fully functional and independently testable.

---

## Phase 4: Polish & Cross-Cutting Integration

**Purpose**: Integration verification, performance validations, and test coverage

- [X] T014 [P] End-to-end integration tests for multi-tenant isolation and edge cases in `src/modules/user-groups/user-group-matching.integration.spec.ts`
- [X] T015 Verify test suite coverage thresholds and execute quickstart scenarios per `specs/020-matching-population-visibility/quickstart.md`

---

## Dependencies & Execution Order

```text
Foundational (T001, T002)
      │
      ├───────────────────────────────┐
      │                               │
User Story 1 (T003-T007)        User Story 2 (T008-T013)
      │                               │
      └──────────────┬────────────────┘
                     │
         Polish & Integration (T014, T015)
```

### Parallel Opportunities

- **Phase 1**: T001 and T002 can execute in parallel.
- **Phase 2 (US1)**: Test tasks T003 and T004 can execute in parallel.
- **Phase 3 (US2)**: Test tasks T008, T009, and T010 can execute in parallel.
- **User Story Independence**: Once Phase 1 is complete, User Story 1 and User Story 2 can be developed in parallel by separate developers or sequentially (US1 first for MVP).

---

## Implementation Strategy

### MVP First (User Story 1 Only)
1. Complete Phase 1 Foundational tasks (`T001`, `T002`).
2. Complete Phase 2 User Story 1 tasks (`T003` - `T007`).
3. Validate materialized population queries independently via `npm test`.

### Incremental Delivery
1. Deliver US1 (Materialized Population Visibility).
2. Deliver US2 (Draft Criteria Real-Time Preview).
3. Execute Phase 4 Polish and Integration Suite.

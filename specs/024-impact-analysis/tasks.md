---
description: "Task list for Pre-Commit Impact Analysis & High-Impact Warnings"
---

# Tasks: Pre-Commit Impact Analysis & High-Impact Warnings

**Input**: Design documents from `specs/024-impact-analysis/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/impact-analysis-api.contract.md](contracts/impact-analysis-api.contract.md)

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize module scaffolding and compile-time types for impact analysis.

- [x] T001 Create `src/modules/impact-analysis/` folder structure matching plan layout
- [x] T002 [P] Define impact analysis interfaces and constants in `src/modules/impact-analysis/interfaces/impact-analysis.interface.ts`
- [x] T003 [P] Define domain exceptions in `src/modules/impact-analysis/exceptions/impact-analysis.exceptions.ts`
- [x] T004 [P] Define DTOs (`ImpactEstimateDto`, `PreviewRoleImpactDto`, `PreviewUserGroupImpactDto`) in `src/modules/impact-analysis/dto/`

---

## Phase 2: Foundational (Core Calculation Engine)

**Purpose**: Implement the set-based read-only SQL calculation repository and base service.

- [x] T005 Implement `ImpactAnalysisRepository` with set-based parameterized SQL queries for role reach and user group matching rule diffing in `src/modules/impact-analysis/repositories/impact-analysis.repository.ts`
- [x] T006 Implement unit and query tests for `ImpactAnalysisRepository` in `src/modules/impact-analysis/repositories/impact-analysis.repository.spec.ts`
- [x] T007 Implement `ImpactAnalysisService` core blast radius calculation methods in `src/modules/impact-analysis/services/impact-analysis.service.ts`
- [x] T008 [P] Wire `ImpactAnalysisModule` and barrel export in `src/modules/impact-analysis/impact-analysis.module.ts` and `src/modules/impact-analysis/index.ts`
- [x] T009 Register `ImpactAnalysisModule` in `src/app.module.ts`

**Checkpoint**: Core impact analysis engine is ready for user stories.

---

## Phase 3: User Story 1 - Impact Blast Radius Visibility Before Changes (Priority: P1) 🎯 MVP

**Goal**: Expose dedicated preview endpoints for administrators to simulate Role and User Group changes and receive gross access gain/loss counts.

**Independent Test**: Request impact preview on Role permission updates and User Group criteria changes; verify gross gains and gross losses are returned without database mutations.

- [x] T010 [P] [US1] Unit test for preview endpoints and service logic in `src/modules/impact-analysis/services/impact-analysis.service.spec.ts`
- [x] T011 [US1] Implement `ImpactAnalysisController` with `POST /roles/:id/impact-preview` and `POST /user-groups/:id/impact-preview` in `src/modules/impact-analysis/controllers/impact-analysis.controller.ts`
- [x] T012 [P] [US1] Unit test `ImpactAnalysisController` in `src/modules/impact-analysis/controllers/impact-analysis.controller.spec.ts`
- [x] T013 [US1] Integrate `MatchingRuleValidator` and `UserGroupScopeValidator` in preview paths in `src/modules/impact-analysis/services/impact-analysis.service.ts`

**Checkpoint**: Standalone impact preview endpoints are fully functional and verifiable.

---

## Phase 4: User Story 2 - High-Impact Modification Guard & Two-Step Confirmation (Priority: P2)

**Goal**: Block direct save of high-impact changes on Role and User Group write paths unless explicit confirmation is provided, recording acknowledged blast radius in the outbox.

**Independent Test**: Submit mutation exceeding threshold without confirmation flag, verify HTTP 409 conflict, and confirm mutation succeeds with `confirmed: true`.

- [x] T014 [US2] Update `UpdateCustomRoleDto`, `DeactivateRoleDto`, `UpdateUserGroupDto`, `UpdateUserGroupScopeDto`, and `UpdateUserGroupRolesDto` with optional `confirmed?: boolean`
- [x] T015 [US2] Integrate `ImpactAnalysisService` into `RoleApplicationService` write methods (`updateCustom`, `deactivate`) in `src/modules/roles/services/role.application.service.ts`
- [x] T016 [US2] Integrate `ImpactAnalysisService` into `UserGroupLifecycleService` and `UserGroupScopeService` write methods in `src/modules/user-groups/services/`
- [x] T017 [US2] Ensure outbox audit events include acknowledged blast radius on confirmed high-impact commits across `RoleApplicationService` and `UserGroupLifecycleService`
- [x] T018 [P] [US2] Unit and integration tests for two-step confirmation guard in `src/modules/roles/services/role.application.service.spec.ts` and `src/modules/user-groups/services/user-group-lifecycle.service.spec.ts`

**Checkpoint**: High-impact two-step confirmation guard active across all Role and User Group write paths.

---

## Phase 5: User Story 3 - Critical Capability Single-Holder Coverage Loss Detection (Priority: P3)

**Goal**: Warn and protect against removing the sole remaining active employee holding critical administrative capabilities.

**Independent Test**: Attempt deactivation or narrowing of group membership for the only remaining Built-in Administrator; verify coverage loss indicator is returned.

- [x] T019 [US3] Implement critical capability holder detection queries in `src/modules/impact-analysis/repositories/impact-analysis.repository.ts`
- [x] T020 [US3] Add coverage loss evaluation logic to `ImpactAnalysisService` in `src/modules/impact-analysis/services/impact-analysis.service.ts`
- [x] T021 [P] [US3] Add unit tests for coverage loss detection in `src/modules/impact-analysis/services/impact-analysis.service.spec.ts`

**Checkpoint**: All three user stories functional and integrated.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate end-to-end scenarios, ensure clean linting and full test coverage.

- [x] T022 Run `npm run test` across all impact analysis, roles, and user-groups suites
- [x] T023 [P] Verify ESLint and Prettier compliance via `npm run lint`
- [x] T024 Execute quickstart validation scenarios defined in `specs/024-impact-analysis/quickstart.md`

---

## Dependencies & Execution Order

```
Phase 1 (Setup)
       │
       ▼
Phase 2 (Foundational Engine)
       │
       ▼
Phase 3 (User Story 1 - Preview Endpoints) 🎯 MVP
       │
       ▼
Phase 4 (User Story 2 - Two-Step Guard on Mutations)
       │
       ▼
Phase 5 (User Story 3 - Coverage Loss Detection)
       │
       ▼
Phase 6 (Polish & Test Verification)
```

## Parallel Opportunities

- **Setup & Foundational**: T002, T003, T004, T008 can be authored concurrently.
- **US1 & US2**: Controller testing (T012) can run parallel to service integration (T013).
- **US2 Integration**: DTO extensions (T014) and outbox integration (T017) can proceed alongside service guards (T015, T016).
- **Verification**: T022 and T023 can run concurrently.

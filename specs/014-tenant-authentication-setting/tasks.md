# Tasks: Tenant Authentication Settings

**Input**: Design documents from `/specs/014-tenant-authentication-setting/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/authentication-settings-contracts.md`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (`US1`, `US2`)
- Explicit file paths included in all descriptions.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Module structure and core definitions

- [x] T001 Create module directory structure for `src/modules/authentication-settings/` per implementation plan

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database entity, DTO contracts, and repository infrastructure

- [x] T002 [P] Create `AuthenticationSettings` domain entity in `src/modules/authentication-settings/domain/authentication-settings.entity.ts`
- [x] T003 [P] Create `UpdateAuthenticationSettingsDto` with CIDR and threshold validations in `src/modules/authentication-settings/dto/update-authentication-settings.dto.ts`
- [x] T004 [P] Create `AuthenticationSettingsResponseDto` in `src/modules/authentication-settings/dto/authentication-settings-response.dto.ts`
- [x] T005 Create `AuthenticationSettingsRepository` with optimistic lock support in `src/modules/authentication-settings/infrastructure/authentication-settings.repository.ts`

**Checkpoint**: Foundation ready - domain entity, repository, and DTOs prepared.

---

## Phase 3: User Story 1 - View Tenant Authentication Posture (Priority: P1) 🎯 MVP

**Goal**: Enable tenant administrators to view their tenant's active authentication security settings.

**Independent Test**: Execute controller and application service tests to verify `GET /admin/settings/authentication` returns active tenant settings or 403/404 errors as appropriate.

### Tests for User Story 1

- [x] T006 [P] [US1] Unit test for `getSettings()` in `src/modules/authentication-settings/transport/authentication-settings.controller.spec.ts`

### Implementation for User Story 1

- [x] T007 [US1] Implement `getSettings()` in `src/modules/authentication-settings/application/authentication-settings.service.ts`
- [x] T008 [US1] Implement `GET /admin/settings/authentication` endpoint in `src/modules/authentication-settings/transport/authentication-settings.controller.ts`

**Checkpoint**: User Story 1 complete - settings retrieval fully functional and testable independently.

---

## Phase 4: User Story 2 - Update Tenant Authentication Parameters (Priority: P2)

**Goal**: Allow tenant administrators to update security parameters (MFA, password reset, account lockout, IP restrictions) with optimistic locking and transactional outbox audit event generation.

**Independent Test**: Send `PATCH /admin/settings/authentication` with valid/invalid payloads and version numbers; verify entity updates, outbox insertions, and 409 concurrency error handling.

### Tests for User Story 2

- [x] T009 [P] [US2] Unit test for DTO input validations in `src/modules/authentication-settings/dto/update-authentication-settings.dto.spec.ts`
- [x] T010 [P] [US2] Unit test for `updateSettings()` transaction & outbox logic in `src/modules/authentication-settings/application/authentication-settings.service.spec.ts`
- [x] T011 [P] [US2] Repository integration test for optimistic concurrency locking in `src/modules/authentication-settings/infrastructure/authentication-settings.repository.spec.ts`

### Implementation for User Story 2

- [x] T012 [US2] Implement `updateSettings()` logic with diff extraction and transaction outbox append in `src/modules/authentication-settings/application/authentication-settings.service.ts`
- [x] T013 [US2] Implement `PATCH /admin/settings/authentication` endpoint in `src/modules/authentication-settings/transport/authentication-settings.controller.ts`

**Checkpoint**: User Story 2 complete - updates, optimistic concurrency, and transactional outbox auditing fully functional.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Module wiring and end-to-end quickstart validation

- [x] T014 Register `AuthenticationSettingsModule` in NestJS application imports
- [x] T015 Run quickstart test scenarios per `specs/014-tenant-authentication-setting/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies
- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Phase 1 completion.
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion.
- **User Story 2 (Phase 4)**: Depends on Phase 2 completion (can run after US1 service/controller created).
- **Polish (Phase 5)**: Depends on Phase 3 and Phase 4.

### Parallel Opportunities
- T002, T003, T004 can run in parallel in Phase 2.
- Unit tests T009, T010, T011 can run in parallel in Phase 4.

---

## Implementation Strategy (MVP First)

1. Complete Phase 1 & Phase 2.
2. Complete Phase 3 (US1) -> Verify `GET /admin/settings/authentication` (MVP!).
3. Complete Phase 4 (US2) -> Verify `PATCH /admin/settings/authentication`, optimistic locking, and outbox event publishing.
4. Complete Phase 5 -> Finalize module registration and validate via test suites.

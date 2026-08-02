# Tasks: Password Reset Workflow (Self-Service & Admin-Initiated)

**Input**: Design documents from `/specs/010-forgot-password/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Explicit file paths included in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and migration setup

- [x] T001 Create TypeORM database migration file `src/database/migrations/1722500000000-AddOutboxRetryColumns.ts` adding `attempt_count` and `last_attempted_at` columns to `auth_security_events_outbox`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before user story work begins

- [x] T002 Implement custom exceptions for password reset in `src/modules/password/exceptions/password-reset.exception.ts`.
- [x] T003 [P] Implement Redis challenge adapter `src/modules/password/adapters/password-reset-redis.adapter.ts` with `{tenantCode:userId}` hash tags and atomic failure attempt counter (max 3).
- [x] T004 [P] Create DTO `src/modules/password/dto/request-password-reset.dto.ts` with class-validator decorators.
- [x] T005 [P] Create DTO `src/modules/password/dto/verify-reset-code.dto.ts` with class-validator decorators.
- [x] T006 [P] Create DTO `src/modules/password/dto/confirm-password-reset.dto.ts` with class-validator decorators.
- [x] T007 [P] Create DTO `src/modules/password/dto/admin-initiate-password-reset.dto.ts` with class-validator decorators.

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Self-Service Password Reset (Priority: P1) 🎯 MVP

**Goal**: Enable end-users to request reset codes, verify OTP codes, and confirm password changes with global session revocation.

**Independent Test**: Execute self-service reset request, verify OTP code, and confirm new password via REST endpoints. Confirm credential update in DB, session key deletion in Redis, and outbox event dispatch.

### Tests for User Story 1

- [x] T008 [P] [US1] Unit test `PasswordService` self-service methods in `src/modules/password/services/password.service.spec.ts`.
- [x] T009 [P] [US1] Integration test self-service reset workflow in `test/password-reset.e2e-spec.ts`.

### Implementation for User Story 1

- [x] T010 [US1] Implement `PasswordService.requestResetCode` and `confirmPasswordReset` in `src/modules/password/services/password.service.ts` with timing-attack prevention, DB transaction, Argon2id hashing, security version bump, session deletion, and outbox event append.
- [x] T011 [US1] Implement REST endpoints `/auth/password/reset/request`, `/verify`, and `/confirm` in `src/modules/password/controllers/password.controller.ts`.
- [x] T012 [US1] Register providers, controllers, and adapters in `src/modules/password/password.module.ts`.

**Checkpoint**: User Story 1 (Self-Service Reset) is fully functional and testable independently.

---

## Phase 4: User Story 2 - Administrator-Initiated Password Reset (Priority: P2)

**Goal**: Allow administrators with `user:security:manage` permission to initiate password reset flows for users.

**Independent Test**: Authenticated admin invokes `/auth/admin/users/:userId/password-reset`, verifying challenge creation and `authentication.password-reset-requested` outbox event generation without exposing secrets.

### Tests for User Story 2

- [x] T013 [P] [US2] Unit test `PasswordService.adminInitiateReset` in `src/modules/password/services/password.service.spec.ts`.
- [x] T014 [P] [US2] Integration test admin-initiated reset endpoint in `test/password-reset.e2e-spec.ts`.

### Implementation for User Story 2

- [x] T015 [US2] Implement `PasswordService.adminInitiateReset` in `src/modules/password/services/password.service.ts`.
- [x] T016 [US2] Implement REST endpoint `POST /auth/admin/users/:userId/password-reset` in `src/modules/password/controllers/password.controller.ts` decorated with `@Permissions('user:security:manage')`.

**Checkpoint**: User Story 2 (Admin-Initiated Reset) is functional and testable independently.

---

## Phase 5: User Story 3 - Tenant Policy Enforcement (Priority: P3)

**Goal**: Block self-service password resets when `allow_self_service_password_reset = false` in tenant settings.

**Independent Test**: Set `allow_self_service_password_reset` to `false` and verify self-service request is rejected with `SELF_SERVICE_RESET_DISABLED` error.

### Tests for User Story 3

- [x] T017 [P] [US3] Unit test tenant policy evaluation in `src/modules/password/services/password.service.spec.ts`.

### Implementation for User Story 3

- [x] T018 [US3] Integrate `AuthenticationSettingsModule` in `src/modules/password/services/password.service.ts` to enforce `allow_self_service_password_reset` policy check.

**Checkpoint**: All user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, and quality verification

- [x] T019 Execute quickstart validation scenarios defined in `specs/010-forgot-password/quickstart.md`.
- [x] T020 [P] Run full test suite and verify test coverage thresholds (`pnpm run test:cov`).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Can start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001). Blocks all User Story phases.
- **User Story 1 (Phase 3)**: Depends on Foundational phase.
- **User Story 2 (Phase 4)**: Depends on Foundational phase.
- **User Story 3 (Phase 5)**: Depends on Foundational phase and US1 `PasswordService`.
- **Polish (Phase 6)**: Depends on US1, US2, US3 completion.

### Parallel Opportunities

- Foundational DTO tasks T004, T005, T006, T007 can run in parallel with Redis adapter T003.
- Unit and integration tests T008, T009, T013, T014, T017 can be developed alongside implementation.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Run migration T001.
2. Complete Foundational tasks T002–T007.
3. Implement US1 tasks T008–T012.
4. Validate US1 independently (MVP release ready).

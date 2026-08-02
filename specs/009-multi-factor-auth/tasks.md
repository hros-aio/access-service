---
description: "Task list for Multi-Factor Authentication (MFA) implementation"
---

# Tasks: Multi-Factor Authentication (MFA)

**Input**: Design documents from `/specs/009-multi-factor-auth/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Module structure and core interface setup

- [x] T001 Create MFA module directory structure `src/modules/mfa/` (adapters, controllers, dto, interfaces, repositories, services)
- [x] T002 Register `MfaModule` in application root module `src/app.module.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema migration and KMS encryption adapter

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Create TypeORM migration for outbox retry columns `src/database/migrations/1720000000000-AddOutboxRetryColumns.ts` (adds `attempt_count`, `last_attempted_at`)
- [x] T004 [P] Implement KMS Envelope Encryption adapter in `src/modules/mfa/adapters/kms-crypto.adapter.ts`
- [x] T005 [P] Create TypeORM repository and entity for MFA methods in `src/modules/mfa/repositories/mfa_method.repository.ts` and `src/modules/mfa/entities/mfa_method.entity.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Enroll in a Second Factor (Priority: P1) 🎯 MVP

**Goal**: Allow users to enroll and activate TOTP / Email OTP second factors.

**Independent Test**: Can be tested by calling initiate enrollment, submitting the verification code, and asserting that `status = 'active'` in PostgreSQL and `authentication.mfa-enrolled` is written to the outbox.

### Implementation for User Story 1

- [x] T006 [P] [US1] Create DTOs for MFA enrollment in `src/modules/mfa/dto/enroll_mfa.dto.ts` and `src/modules/mfa/dto/verify_enrollment.dto.ts`
- [x] T007 [US1] Implement `verifyAndActivateFactor` method in `src/modules/mfa/services/mfa_application.service.ts`
- [x] T008 [US1] Implement enrollment HTTP handlers in `src/modules/mfa/controllers/mfa.controller.ts` (`POST /api/v1/auth/mfa/enroll`, `POST /api/v1/auth/mfa/enroll/verify`)
- [x] T009 [P] [US1] Add unit tests for factor enrollment in `src/modules/mfa/services/mfa_application.service.spec.ts`

**Checkpoint**: User Story 1 complete and independently testable

---

## Phase 4: User Story 2 - Complete a Second-Factor Challenge at Login (Priority: P1)

**Goal**: Enable users logging in to verify their second factor via Redis-backed challenges.

**Independent Test**: Can be tested by creating a Redis login challenge key, submitting valid/invalid codes to challenge verification endpoint, and verifying attempt lockouts and access token issuance.

### Implementation for User Story 2

- [x] T010 [P] [US2] Implement Redis MFA challenge adapter in `src/modules/mfa/adapters/redis_mfa_challenge.adapter.ts`
- [x] T011 [P] [US2] Create challenge verification DTO in `src/modules/mfa/dto/verify_challenge.dto.ts`
- [x] T012 [US2] Implement `verifyLoginChallenge` method in `src/modules/mfa/services/mfa_application.service.ts`
- [x] T013 [US2] Expose challenge verification endpoint `POST /api/v1/auth/mfa/challenge/verify` in `src/modules/mfa/controllers/mfa.controller.ts`
- [x] T014 [P] [US2] Add unit tests for login challenge adapter and verification logic in `src/modules/mfa/adapters/redis_mfa_challenge.adapter.spec.ts`

**Checkpoint**: User Story 2 complete and independently testable

---

## Phase 5: User Story 3 - Mandatory MFA Blocks Full Access Until Enrolled (Priority: P2)

**Goal**: Force un-enrolled users in mandatory MFA tenants into a restricted setup session during login.

**Independent Test**: Can be tested by setting tenant policy to mandatory MFA, performing primary authentication for an un-enrolled user, and asserting response contains `mfaRequired: true`.

### Implementation for User Story 3

- [x] T015 [US3] Update primary authentication logic in `src/modules/auth/services/auth.application.service.ts` to check tenant mandatory MFA policy and issue restricted setup session
- [x] T016 [P] [US3] Add unit tests for mandatory MFA gating in `src/modules/auth/services/auth.application.service.spec.ts`

**Checkpoint**: User Story 3 complete and independently testable

---

## Phase 6: User Story 4 - Administrator Resets a User's MFA (Priority: P2)

**Goal**: Allow tenant admins to disable a target user's MFA factors and invalidate all active sessions.

**Independent Test**: Can be tested by calling admin reset endpoint, verifying PostgreSQL factor status disabled and `security_version` incremented, Redis sessions deleted, and `authentication.mfa-reset` event written to outbox.

### Implementation for User Story 4

- [x] T017 [P] [US4] Create Admin Reset DTO in `src/modules/mfa/dto/admin_reset_mfa.dto.ts`
- [x] T018 [US4] Implement `resetUserMfa` in `src/modules/mfa/services/mfa_admin_application.service.ts` (handles DB soft-delete, `security_version` bump, Redis session deletion, and outbox write)
- [x] T019 [US4] Expose admin reset endpoint `POST /api/v1/admin/users/:userId/mfa/reset` in `src/modules/mfa/controllers/mfa_admin.controller.ts`
- [x] T020 [P] [US4] Add unit tests for Admin MFA reset service in `src/modules/mfa/services/mfa_admin_application.service.spec.ts`

**Checkpoint**: User Story 4 complete and independently testable

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end testing, error handling polish, and outbox relay verification

- [x] T021 [P] Create E2E test suite in `test/mfa.e2e-spec.ts` covering all User Scenarios (US1–US4)
- [x] T022 Update Outbox Relay worker in `src/modules/outbox/services/outbox_relay_worker.service.ts` to handle `attempt_count` and `last_attempted_at` retry logic
- [x] T023 Run validation scenarios outlined in `specs/009-multi-factor-auth/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-6)**: All depend on Foundational phase completion
  - US1 (Enrollment) and US2 (Challenge) can proceed in parallel
  - US3 (Mandatory Gate) depends on US1 enrollment capabilities
  - US4 (Admin Reset) can proceed independently once Foundational completes
- **Polish (Phase 7)**: Depends on all user story phases being complete

### Parallel Opportunities

- T004 (KMS Adapter) and T005 (MFA Repository) can run in parallel in Foundational phase.
- T006 (Enrollment DTOs) and T009 (Enrollment spec tests) can run in parallel.
- T010 (Redis Challenge Adapter) and T011 (Challenge DTOs) can run in parallel.
- T017 (Admin Reset DTO) and T020 (Admin Reset spec tests) can run in parallel.
- T021 (E2E Test Suite) can be drafted alongside controller implementations.

---

## Implementation Strategy

### MVP Scope (User Story 1 & 2)
1. Complete Phase 1 & Phase 2 (Setup & Foundational)
2. Complete Phase 3 (US1 - Factor Enrollment)
3. Complete Phase 4 (US2 - Login Challenge Verification)
4. Validate MVP using unit tests & quickstart guide.

# Tasks: Session Management & Logout Engine

**Input**: Design documents from `/specs/011-session-management/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Unit, Integration, and E2E tests are included for each user story as defined in spec.md and quickstart.md.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Infrastructure preparation and directory initialization for Session Module

- [x] T001 Create module directory structure at `src/modules/session/` (controllers, services, adapters, dto, interfaces, tests)
- [x] T002 [P] Define TypeScript DTOs and contracts in `src/modules/session/dto/logout-response.dto.ts` and `src/modules/session/dto/force-logout-request.dto.ts`
- [x] T003 [P] Define core session domain interfaces and service tokens in `src/modules/session/interfaces/session.interface.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Atomic Redis adapter operations and event schemas required by all user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement atomic Lua scripts and methods (`DEL`, `SREM`) with `{tenantCode:userId}` cluster hash tags in `src/modules/session/adapters/redis-session.adapter.ts`
- [x] T005 Create unit and integration tests for Redis Lua script execution in `src/modules/session/tests/redis-session.adapter.spec.ts`
- [x] T006 [P] Register `SessionModule` providers and imports in `src/modules/session/session.module.ts` and `src/app.module.ts`

**Checkpoint**: Foundation ready - session store atomic adapter and module configuration complete.

---

## Phase 3: User Story 1 - Single Device Logout (Priority: P1) 🎯 MVP

**Goal**: Allow authenticated users to revoke their active session on a single device via `POST /auth/logout`.

**Independent Test**: Log in from two devices, execute `POST /auth/logout` from Device A, verify Device A's session is deleted while Device B remains authenticated.

### Tests for User Story 1

- [x] T007 [P] [US1] Unit test for single device logout orchestration in `src/modules/session/tests/session.service.spec.ts`
- [x] T008 [P] [US1] E2E test for `POST /auth/logout` endpoint in `src/modules/session/tests/session.e2e-spec.ts`

### Implementation for User Story 1

- [x] T009 [US1] Implement `logoutCurrentSession` method in `src/modules/session/services/session.service.ts` (invokes `RedisSessionAdapter` and appends `authentication.session-revoked` event to outbox within DB transaction)
- [x] T010 [US1] Implement `logout` controller handler for `POST /auth/logout` with `@UseGuards(JwtAuthGuard)` in `src/modules/session/controllers/session.controller.ts`

**Checkpoint**: User Story 1 (Single Device Logout) is fully functional and independently testable.

---

## Phase 4: User Story 2 - Security-Critical Session Invalidation (Priority: P1)

**Goal**: Atomically increment `security_version` in PostgreSQL and purge all Redis session keys upon security-critical events.

**Independent Test**: Establish active user sessions, trigger security version bump in DB, verify all subsequent requests with existing JWTs return 401 Unauthorized.

### Tests for User Story 2

- [x] T011 [P] [US2] Integration test for user `security_version` increment and Redis purge in `src/modules/session/tests/session.service.spec.ts`

### Implementation for User Story 2

- [x] T012 [US2] Add atomic `bumpSecurityVersion` repository method in `src/modules/user/repositories/user.repository.ts`
- [x] T013 [US2] Implement global session invalidation orchestration method in `src/modules/session/services/session.service.ts`

**Checkpoint**: User Story 2 (Security-Critical Invalidation) is complete.

---

## Phase 5: User Story 3 - Logout All Devices During Password Change (Priority: P2)

**Goal**: Revoke all active sessions on other devices while minting a fresh session for the initiating device during password updates.

**Independent Test**: Change password with global session revocation enabled, verify old session IDs are deleted and a fresh active session is issued.

### Tests for User Story 3

- [x] T014 [P] [US3] Unit & Integration tests for password change session re-issuance in `src/modules/password/tests/password.service.spec.ts`
- [x] T015 [US3] Integrate `SessionService.revokeAllUserSessions` into password reset & change flows in `src/modules/password/services/password.service.ts`
- [x] T016 [US3] Ensure `authentication.sessions-revoked` and `authentication.password-changed` outbox events emit atomically in `src/modules/password/services/password.service.ts`

**Checkpoint**: User Story 3 (Logout All on Password Change) is functional and verified.

---

## Phase 6: User Story 4 - Administrator Force Logout (Priority: P2)

**Goal**: Enable tenant administrators to forcibly revoke all sessions for a target user via `POST /admin/users/:userId/force-logout`.

**Independent Test**: Admin calls force logout on target user in same tenant (sessions destroyed, returns 200 OK). Admin calls force logout across tenant (blocked, returns 404 Not Found).

### Tests for User Story 4

- [x] T017 [P] [US4] E2E test for `POST /admin/users/:userId/force-logout` (same-tenant success & cross-tenant 404 rejection) in `src/modules/session/tests/session.e2e-spec.ts`
- [x] T018 [US4] Implement `revokeAllUserSessions` method with tenant validation and outbox recording in `src/modules/session/services/session.service.ts`
- [x] T019 [US4] Expose `forceLogout` endpoint on `POST /admin/users/:userId/force-logout` with `@UseGuards(JwtAuthGuard, RolesGuard)` in `src/modules/session/controllers/session.controller.ts`

**Checkpoint**: User Story 4 (Admin Force Logout) is fully functional and independently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation validation, error handling verification, and system end-to-end testing

- [x] T020 [P] Validate Swagger/OpenAPI annotations on `SessionController` match `specs/011-session-management/contracts/api-spec.yaml`
- [x] T021 Run end-to-end quickstart scenarios in `specs/011-session-management/quickstart.md`
- [x] T022 Execute test suite and verify test coverage thresholds across `src/modules/session/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Can start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories.
- **User Stories (Phases 3-6)**: All depend on Foundational (Phase 2) completion.
- **Polish (Phase 7)**: Depends on completion of all user story phases.

### User Story Dependencies

- **US1 (Single Device Logout)**: Can start after Phase 2.
- **US2 (Security-Critical Invalidation)**: Can start after Phase 2.
- **US3 (Logout All on Password Change)**: Depends on US2 service orchestration.
- **US4 (Admin Force Logout)**: Can start after Phase 2 (uses US2 global purge logic).

---

## Implementation Strategy

### MVP First (User Story 1 Only)
1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (Single Device Logout)
4. Validate & deploy MVP.

### Incremental Delivery
1. Add Phase 4 & Phase 5 (Security-critical & Password change session revokes).
2. Add Phase 6 (Admin force-logout endpoint).
3. Complete Phase 7 (Polish & Verification).

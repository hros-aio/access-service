# Tasks: Account Lockout & Protection Mechanism

**Input**: Design documents from `specs/012-account-lockout/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/events.md`, `quickstart.md`)

**Prerequisites**: `plan.md`, `spec.md`

**Organization**: Tasks are grouped by user story (P1, P2, P3) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (`[US1]`, `[US2]`, `[US3]`)
- File paths are relative to workspace root `src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Redis script setup & foundation

- [x] T001 [P] Create atomic counter Lua script in `src/modules/lockout/scripts/incr-counter.lua`
- [x] T002 [P] Register Lua script loader in `src/modules/lockout/lockout.module.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core Redis lockout adapter and interface definitions

**⚠️ CRITICAL**: Must be completed before user story integrations begin

- [x] T003 [P] Implement Redis Lockout Adapter in `src/modules/lockout/adapters/redis-lockout.adapter.ts`
- [x] T004 Create unit tests for Redis Lockout Adapter in `src/modules/lockout/adapters/redis-lockout.adapter.spec.ts`

**Checkpoint**: Foundation ready - Lockout domain service logic can now begin

---

## Phase 3: User Story 1 - Lock Account After Repeated Credential Failures (Priority: P1) 🎯 MVP

**Goal**: Lock user accounts, bump security versions, revoke active sessions, and enqueue transactional outbox events when credential failure thresholds are breached.

**Independent Test**: Execute 5 failed password attempts for an active user. Verify `users.credential_status = 'locked'`, Redis session keys deleted, and `auth_security_events_outbox` entries generated.

### Implementation for User Story 1

- [x] T005 [P] [US1] Unit test for credential failure tracking in `src/modules/lockout/services/lockout.service.spec.ts`
- [x] T006 [US1] Implement `recordCredentialFailure` in `src/modules/lockout/services/lockout.service.ts`
- [x] T007 [P] [US1] Unit test for authentication lockout integration in `src/modules/authentication/services/authentication.service.spec.ts`
- [x] T008 [US1] Integrate atomic lock transaction, session revocation, and outbox event publishing in `src/modules/authentication/services/authentication.service.ts`

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 4: User Story 2 - Exclude Non-Existent and Inactive Accounts (Priority: P2)

**Goal**: Execute constant-time dummy verification for non-existent or inactive/suspended accounts, skipping Redis failure tracking and preventing enumeration.

**Independent Test**: Attempt logins with invalid email or suspended user. Verify generic 401 response and failure counter remaining unchanged at 0.

### Implementation for User Story 2

- [x] T009 [P] [US2] Unit test for non-existent/inactive account bypass logic in `src/modules/lockout/services/lockout.service.spec.ts`
- [x] T010 [US2] Implement account status validation and dummy hash comparison bypass in `src/modules/authentication/services/authentication.service.ts`

**Checkpoint**: User Stories 1 AND 2 functional and independently testable.

---

## Phase 5: User Story 3 - Separate IP Restriction Failure Tracking (Priority: P3)

**Goal**: Track unapproved IP access failures on an isolated counter (`auth:ip-failure`), triggering `authentication.security-alert-requested` when threshold is hit without locking the user account.

**Independent Test**: Attempt 10 logins from an unapproved IP. Verify `auth:ip-failure` increments, `auth:login-failure` remains 0, user remains active, and alert event is enqueued.

### Implementation for User Story 3

- [x] T011 [P] [US3] Unit test for IP restriction failure tracking in `src/modules/lockout/services/lockout.service.spec.ts`
- [x] T012 [US3] Implement `recordIpFailure` and alert event dispatch in `src/modules/lockout/services/lockout.service.ts`
- [x] T013 [US3] Integrate IP failure recording into `src/modules/ip-restriction/services/ip-restriction.service.ts`

**Checkpoint**: All user stories functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E validation and security check

- [x] T014 Execute quickstart validation scenarios in `specs/012-account-lockout/quickstart.md`
- [x] T015 Run security audit check on generic error code compliance across all failure branches

---

## Dependencies & Execution Order

### Phase Dependencies
- **Setup (Phase 1)** → **Foundational (Phase 2)** → **User Stories (Phase 3+)** → **Polish (Phase 6)**

### User Story Dependencies
- **US1 (P1)**: Independent after Phase 2.
- **US2 (P2)**: Independent after Phase 2.
- **US3 (P3)**: Independent after Phase 2.

### Parallel Opportunities
- T001 & T002 in Phase 1
- T003 in Phase 2
- Unit tests T005, T007, T009, T011 across US phases

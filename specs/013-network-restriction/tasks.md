# Tasks: Restrict Login to Approved Network Locations

**Input**: Design documents from `/specs/013-network-restriction/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (`[US1]`, `[US2]`, `[US3]`)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Infrastructure verification and module setup

- [x] T001 Verify module setup in `src/modules/ip-restriction/ip-restriction.module.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domain policies and Redis counter adapter required for network restriction checks

- [x] T002 [P] Implement `IpRangePolicy` domain helper in `src/modules/ip-restriction/domain/ip-range.policy.ts`
- [x] T003 [P] Implement `IpLockoutRedisAdapter` in `src/modules/ip-restriction/infrastructure/ip-lockout-redis.adapter.ts`

---

## Phase 3: User Story 1 - Approved Network Location Access (Priority: P1) 🎯 MVP

**Goal**: Permit authentication attempts (password login, MFA verification, SSO login) when IP restriction is disabled OR when client source IP falls within tenant allowed CIDR ranges.

**Independent Test**: Send login and MFA requests from an IP address within the allowed range and confirm authentication proceeds without blockage.

### Tests for User Story 1
- [x] T004 [P] [US1] Unit test for allowed IP validation in `src/modules/ip-restriction/domain/ip-range.policy.spec.ts`
- [x] T005 [P] [US1] Unit test for `IpRestrictionService.evaluate` with allowed IP in `src/modules/ip-restriction/services/ip-restriction.service.spec.ts`

### Implementation for User Story 1
- [x] T006 [US1] Implement `validateRequestLocation` method in `src/modules/ip-restriction/services/ip-restriction.service.ts`
- [x] T007 [US1] Integrate `IpRestrictionService` into password authentication in `src/modules/auth/services/auth.application.service.ts`
- [x] T008 [US1] Integrate `IpRestrictionService` into MFA challenge verification in `src/modules/mfa/services/mfa_admin_application.service.ts`

**Checkpoint**: User Story 1 functional - authentication from allowed network locations proceeds smoothly.

---

## Phase 4: User Story 2 - Unapproved Network Location Denial (Priority: P2)

**Goal**: Block access immediately when IP restriction is enabled and source IP is outside allowed ranges, incrementing IP failure Redis counter and publishing security outbox events.

**Independent Test**: Send authentication request from an unapproved source IP, verifying HTTP 401 response, Redis counter increment, and security outbox event creation.

### Tests for User Story 2
- [x] T009 [P] [US2] Integration test for IP failure counter in `src/modules/ip-restriction/infrastructure/ip-lockout-redis.adapter.spec.ts`
- [x] T010 [P] [US2] Unit test for IP denial outbox security event generation in `src/modules/ip-restriction/services/ip-restriction.service.spec.ts`

### Implementation for User Story 2
- [x] T011 [US2] Update `IpRestrictionService` to increment Redis IP failure counter (`auth:ip-failure:{tenantCode}:{userId}`) on denial in `src/modules/ip-restriction/services/ip-restriction.service.ts`
- [x] T012 [US2] Trigger `SecurityEventService.logLoginFailed` for `authentication.login-failed` (`IP_NOT_ALLOWED`) on denial in `src/modules/ip-restriction/services/ip-restriction.service.ts`
- [x] T013 [US2] Trigger security alert event when Redis failure count exceeds threshold in `src/modules/ip-restriction/services/ip-restriction.service.ts`

**Checkpoint**: User Story 2 functional - unauthorized IP attempts are blocked, logged, and alerted.

---

## Phase 5: User Story 3 - Network Restriction Exemptions (Priority: P3)

**Goal**: Exempt invitation validations and password reset requests from IP restriction enforcement.

**Independent Test**: Perform invitation setup or password reset request from an unapproved IP and confirm access is permitted.

### Tests for User Story 3
- [x] T014 [P] [US3] Unit test for action exemptions in `src/modules/ip-restriction/domain/ip-range.policy.spec.ts`

### Implementation for User Story 3
- [x] T015 [US3] Add exemption check logic for `AuthActionType.INVITATION_VALIDATION` and `AuthActionType.PASSWORD_RESET` in `src/modules/ip-restriction/services/ip-restriction.service.ts`

**Checkpoint**: All user stories functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and test execution

- [x] T016 Run full test suite for ip-restriction module in `src/modules/ip-restriction`
- [x] T017 Execute `quickstart.md` scenarios validation

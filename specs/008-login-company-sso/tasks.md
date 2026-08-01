# Tasks: Firebase SSO Login & External Identity Mapping

**Input**: Design documents from `/specs/008-login-company-sso/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Unit, integration, and contract tests are included per feature requirements.

**Organization**: Grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Exact file paths included in all descriptions.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Module structure initialization

- [x] T001 Create directory structure for `src/modules/firebase-sso/` (application, domain, infrastructure, presentation)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Ports, domain exceptions, and request DTOs required before implementing story handlers

- [x] T002 [P] Create Firebase Token Verifier Port interface in `src/modules/firebase-sso/domain/ports/firebase-verifier.port.ts`
- [x] T003 [P] Create domain exceptions (`InvalidFirebaseTokenException`, `FirebaseProviderUnavailableException`) in `src/modules/firebase-sso/domain/exceptions/`
- [x] T004 [P] Create `LoginWithFirebaseDto` with class-validator annotations in `src/modules/firebase-sso/presentation/dto/login-with-firebase.dto.ts`

**Checkpoint**: Foundational contracts and DTOs ready. User story implementation can begin.

---

## Phase 3: User Story 1 - Log In via Company Single Sign-On (Priority: P1) 🎯 MVP

**Goal**: Authenticate users via valid Firebase ID token, map identity, enforce security state, and issue appropriate active/restricted sessions.

**Independent Test**: Execute `POST /auth/login/firebase` with valid Firebase ID tokens for mapped active users, verifying active token response (or restricted setup / MFA challenge).

### Tests for User Story 1

- [x] T005 [P] [US1] Unit test for `LoginWithFirebaseDto` and `FirebaseSsoController` in `src/modules/firebase-sso/presentation/firebase-sso.controller.spec.ts`
- [x] T006 [P] [US1] Unit test for `FirebaseAdminAdapter` token verification & timeout in `src/modules/firebase-sso/infrastructure/adapters/firebase-admin.adapter.spec.ts`
- [x] T007 [P] [US1] Unit test for `FirebaseSsoApplicationService` session branching logic in `src/modules/firebase-sso/application/firebase-sso-application.service.spec.ts`
- [x] T008 [P] [US1] Integration test for successful SSO login flows in `test/firebase-sso-success.e2e-spec.ts`

### Implementation for User Story 1

- [x] T009 [P] [US1] Implement `FirebaseAdminAdapter` wrapping `firebase-admin` SDK with 5000ms circuit breaker timeout in `src/modules/firebase-sso/infrastructure/adapters/firebase-admin.adapter.ts`
- [x] T010 [US1] Implement `ExternalIdentityRepository.findMapping(tenantCode, provider, providerSubject)` query method in `src/modules/external-identity/infrastructure/persistence/external-identity.repository.ts`
- [x] T011 [US1] Implement core authentication and session branching logic in `src/modules/firebase-sso/application/firebase-sso-application.service.ts`
- [x] T012 [US1] Implement `FirebaseSsoController.loginWithFirebase` handler in `src/modules/firebase-sso/presentation/firebase-sso.controller.ts`
- [x] T013 [US1] Register providers, controllers, and exports in `src/modules/firebase-sso/firebase-sso.module.ts`

**Checkpoint**: User Story 1 (SSO login for mapped active users) complete and testable independently.

---

## Phase 4: User Story 2 - Hard Reject on Identity Mismatch & Ambiguity (Priority: P2)

**Goal**: Reject unmapped identities (401 Unauthorized) and ambiguous duplicate identity mappings (409 Conflict) with generic error payloads.

**Independent Test**: Call `POST /auth/login/firebase` with unmapped or duplicate external identity subjects and verify rejection responses and audit logs.

### Tests for User Story 2

- [x] T014 [P] [US2] Integration test for unmapped identity rejection and ambiguous mapping conflict in `test/firebase-sso-identity-mismatch.e2e-spec.ts`

### Implementation for User Story 2

- [x] T015 [US2] Add count & ambiguity validation checks in `ExternalIdentityRepository` and `FirebaseSsoApplicationService` in `src/modules/firebase-sso/application/firebase-sso-application.service.ts`
- [x] T016 [US2] Ensure generic 401 response masking in NestJS exception filter to prevent account enumeration in `src/modules/firebase-sso/presentation/firebase-sso.controller.ts`

**Checkpoint**: User Story 2 complete. Unmapped identities and identity conflicts safely blocked and audited.

---

## Phase 5: User Story 3 - Security Policy & Audit Event Integration (Priority: P3)

**Goal**: Enforce lockout/IP restrictions during SSO and persist sanitized security events to `auth_security_events_outbox`.

**Independent Test**: Attempt SSO login for locked user or restricted IP, verify rejection and check outbox JSON payload for sanitized fields.

### Tests for User Story 3

- [x] T017 [P] [US3] Unit test for outbox payload sanitization (ensuring zero raw tokens/credentials) in `src/modules/security-event/application/security-event.service.spec.ts`
- [x] T018 [P] [US3] Integration test for IP restriction and lockout checks on SSO login in `test/firebase-sso-security-policy.e2e-spec.ts`

### Implementation for User Story 3

- [x] T019 [US3] Integrate `LockoutService` and `IpRestrictionService` into `FirebaseSsoApplicationService.authenticateSso` in `src/modules/firebase-sso/application/firebase-sso-application.service.ts`
- [x] T020 [US3] Integrate transactional outbox event write using `SecurityEventService.append()` in `src/modules/firebase-sso/application/firebase-sso-application.service.ts`

**Checkpoint**: Security policy enforcement and sanitized transactional audit outbox logging complete.

---

## Phase 6: User Story 4 - Fallback to Password Login When Single Sign-On Is Unavailable (Priority: P4)

**Goal**: Handle Firebase SDK infrastructure timeouts and network failures gracefully by returning HTTP 503 Service Unavailable with password fallback messaging.

**Independent Test**: Simulate Firebase SDK timeout/outage, verify 503 response and user messaging.

### Tests for User Story 4

- [x] T021 [P] [US4] Integration test for Firebase service unavailable fallback in `test/firebase-sso-fallback.e2e-spec.ts`

### Implementation for User Story 4

- [x] T022 [US4] Update `FirebaseAdminAdapter` and exception filters to translate timeouts into HTTP 503 `AUTH_SSO_PROVIDER_UNAVAILABLE` in `src/modules/firebase-sso/infrastructure/adapters/firebase-admin.adapter.ts`

**Checkpoint**: Fallback handling for third-party outages verified.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and clean documentation

- [x] T023 [P] Execute end-to-end scenarios documented in `specs/008-login-company-sso/quickstart.md`
- [x] T024 Ensure zero lint/typecheck errors and verify test coverage thresholds across `src/modules/firebase-sso/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion. BLOCKS all user story implementation.
- **User Stories (Phase 3+)**: All depend on Foundational phase completion.
  - US1 (P1) -> US2 (P2) -> US3 (P3) -> US4 (P4)
- **Polish (Phase 7)**: Depends on completion of all user story tasks.

### Parallel Opportunities

- Foundational tasks T002, T003, T004 can run in parallel.
- Unit and integration tests (T005, T006, T007, T008, T014, T017, T018, T021) marked `[P]` can be written in parallel.
- Adapter implementations in `src/modules/firebase-sso/infrastructure/` marked `[P]` can run in parallel with DTOs.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational).
2. Complete Phase 3 (User Story 1 - SSO Login for mapped active users).
3. Validate User Story 1 against quickstart scenario 1.

### Incremental Delivery

1. Deliver US1 (Core active SSO login).
2. Add US2 (Hard rejection on unmapped/duplicate identities).
3. Add US3 (Lockout/IP security checks & audit outbox).
4. Add US4 (Service unavailable fallback).

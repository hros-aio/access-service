# Tasks: Log In With Email and Password

**Input**: Design documents from `/specs/007-login-password/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are requested and specified in the spec's testing matrix (TC-LOG-01 to TC-LOG-05).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project structure is assumed as configured in `plan.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Configure workspace dependencies for password logic in package.json
- [X] T002 [P] Configure Redis client namespace configurations for login lockout tracking in src/modules/authentication/authentication.module.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Create base payload verification logic helper in src/modules/credential/infrastructure/adapters/argon2-crypto.adapter.ts
- [X] T004 [P] Define database schemas and verify outbox entity in src/modules/security-event/entities/security-event-outbox.entity.ts
- [X] T005 [P] Configure validation configurations for requests in NestJS pipeline in src/main.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Log In with Email and Password (No MFA) (Priority: P1) 🎯 MVP

**Goal**: Core authentication path issuing a full session.

**Independent Test**: Call `POST /auth/login/password` with valid credentials from allowed IP when MFA is not required/enrolled, verify HTTP 200 and access/refresh tokens.

### Tests for User Story 1
> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T006 [P] [US1] Create unit test for password validation DTO in src/modules/authentication/presentation/dto/login-with-password.spec.ts
- [X] T007 [P] [US1] Create unit test for controller delegation in src/modules/authentication/presentation/authentication.controller.spec.ts
- [X] T008 [P] [US1] Create unit test for Argon2 crypto adapter in src/modules/credential/infrastructure/adapters/argon2-crypto.adapter.spec.ts
- [X] T009 [P] [US1] Create unit test for application service login logic in src/modules/authentication/application/authentication-application.service.spec.ts

### Implementation for User Story 1

- [X] T010 [P] [US1] Create DTO with validation decorators in src/modules/authentication/presentation/dto/login-with-password.dto.ts
- [X] T011 [US1] Implement controller endpoint `/auth/login/password` in src/modules/authentication/presentation/authentication.controller.ts
- [X] T012 [US1] Implement password verification in src/modules/credential/infrastructure/adapters/argon2-crypto.adapter.ts
- [X] T013 [US1] Implement core application service login orchestration in src/modules/authentication/application/authentication-application.service.ts
- [X] T014 [US1] Create E2E test verifying successful primary authentication in test/authentication.e2e-spec.ts

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Log In with MFA Challenge (Priority: P2)

**Goal**: Verify that active users with enrolled MFA are issued an MFA challenge instead of full tokens.

**Independent Test**: Call `POST /auth/login/password` for MFA-enrolled user, verify HTTP 200 with `authState: "MFA_REQUIRED"` and challenge ID.

### Tests for User Story 2

- [X] T015 [P] [US2] Create unit test for MFA branching logic in application service in src/modules/authentication/application/authentication-application.service.spec.ts

### Implementation for User Story 2

- [X] T016 [US2] Update application service to verify enrolled MFA methods and generate Redis-backed MFA challenge in src/modules/authentication/application/authentication-application.service.ts
- [X] T017 [US2] Create E2E test verifying MFA required status flow in test/authentication.e2e-spec.ts

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Security Enforcement & Account Lockout (Priority: P3)

**Goal**: Block logins from restricted IPs, lock accounts after too many failed attempts, and reject locked/suspended users.

**Independent Test**: Incorrect password attempts trigger lockout after N attempts. Restricted IPs are blocked.

### Tests for User Story 3

- [X] T018 [P] [US3] Create unit test for IP restriction logic in src/modules/ip-restriction/application/ip-restriction.service.spec.ts
- [X] T019 [P] [US3] Create unit test for Lockout counter evaluations and status updates in src/modules/lockout/application/lockout.service.spec.ts
- [X] T020 [P] [US3] Create unit test for audit log sanitization in src/modules/security-event/application/security-event.service.spec.ts

### Implementation for User Story 3

- [X] T021 [US3] Implement CIDR evaluation and validation in src/modules/ip-restriction/application/ip-restriction.service.ts
- [X] T022 [US3] Implement Redis atomic failure counter increment and database user lockout locking update in src/modules/lockout/application/lockout.service.ts
- [X] T023 [US3] Implement transactional outbox event insertion in src/modules/security-event/application/security-event.service.ts
- [X] T024 [US3] Integrate lockout, IP checks, and audit logging into the application service in src/modules/authentication/application/authentication-application.service.ts
- [X] T025 [US3] Create E2E tests verifying IP restriction, lockout triggers, and outbox serialization in test/authentication.e2e-spec.ts

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T026 [P] Add Swagger descriptions to controller endpoints and DTOs in src/modules/authentication/presentation/authentication.controller.ts
- [X] T027 Run verification suite defined in quickstart.md
- [X] T028 Verify code formatting and lint rules compliance on all modified files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Create unit test for password validation DTO in src/modules/authentication/presentation/dto/login-with-password.spec.ts"
Task: "Create unit test for controller delegation in src/modules/authentication/presentation/authentication.controller.spec.ts"
Task: "Create unit test for Argon2 crypto adapter in src/modules/credential/infrastructure/adapters/argon2-crypto.adapter.spec.ts"
Task: "Create unit test for application service login logic in src/modules/authentication/application/authentication-application.service.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

# Tasks: Password Setup via Company Single Sign-On (Fallback Path)

**Input**: Design documents from `/specs/006-setup-password-sso/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by setup, foundation, user story, and polish phases to support incremental development and independent testing.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Parallelizable task (independent files, can run concurrently)
- **[Story]**: Target user story (US1, US2) for traceability

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Modular scaffolding and routing registration

- [X] T001 Create password module scaffolding in `src/modules/password/password.module.ts`
- [X] T002 Register `PasswordModule` in the root app module imports in `src/app.module.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish base contracts, validation DTOs, and route-level request interceptors

**⚠️ CRITICAL**: Must complete before user story phases

- [X] T003 [P] Implement validation DTO `SetupPasswordViaSsoDto` in `src/modules/password/dto/setup-password-via-sso.dto.ts`
- [X] T004 Implement `RestrictedSessionGuard` checking Redis `auth:sso-setup:{flowId}` in `src/modules/password/guards/restricted-session.guard.ts`
- [X] T005 [P] Create initial route endpoint controller `PasswordController` in `src/modules/password/controllers/password.controller.ts`

**Checkpoint**: Presentation and security guards ready.

---

## Phase 3: User Story 1 - Set a Password After Logging In via Single Sign-On (Priority: P1) 🎯 MVP

**Goal**: Enable SSO authenticated users lacking password credentials to securely initialize their password, transition account state, and retrieve standard/MFA tokens.

**Independent Test**: Simulate a Redis restricted setup key, submit a valid password to `/auth/password/setup/firebase`, and verify:
1. User status transitions to `ACTIVE`.
2. Credential is saved as `active` with an Argon2id hash.
3. Access tokens are returned successfully.
4. Redis restricted setup key is deleted.

### Tests for User Story 1
- [X] T006 [P] [US1] Create controller unit test `password.controller.spec.ts` verifying routing and guard integration in `src/modules/password/controllers/password.controller.spec.ts`
- [X] T007 [P] [US1] Create guard unit test `restricted-session.guard.spec.ts` verifying Redis session lookup in `src/modules/password/guards/restricted-session.guard.spec.ts`
- [X] T008 [P] [US1] Create integration test `password.service.spec.ts` asserting transaction flow, row locking, and rollback in `src/modules/password/services/password.service.spec.ts`
 
### Implementation for User Story 1
- [X] T009 [P] [US1] Implement password complexity validations in `src/modules/password/services/credential.policy.ts`
- [X] T010 [US1] Implement orchestrator business logic `setupPasswordViaSsoFallback` inside the application service `src/modules/password/services/password.service.ts`
- [X] T011 [US1] Integrate application handler and Guard in controller endpoint in `src/modules/password/controllers/password.controller.ts`
- [X] T012 [US1] Configure and export providers in password module `src/modules/password/password.module.ts`

**Checkpoint**: User Story 1 is fully functional and testable independently.

---

## Phase 4: User Story 2 - Old Invitation Superseded by Single Sign-On Setup (Priority: P2)

**Goal**: Automatically cancel outstanding email invitations upon completion of password setup via SSO.

**Independent Test**: Create a user with a pending/sent invitation. Run the setup password flow, and assert the invitation status becomes `'cancelled'`.

### Tests for User Story 2
- [X] T013 [P] [US2] Add invitation cancellation assertions to integration test suite in `src/modules/password/services/password.service.spec.ts`

### Implementation for User Story 2
- [X] T014 [US2] Implement `cancelPendingInvitations` database query in `src/modules/invite/repositories/invitation.repository.ts`
- [X] T015 [US2] Integrate invitation cancellation call inside the PostgreSQL write transaction in `src/modules/password/services/password.service.ts`

**Checkpoint**: User Stories 1 and 2 are both fully functional and tested.

---

## Phase 5: Outbox Event Integration & Audit Logging

**Purpose**: Insert transactional outbox records for Kafka event dispatches.

- [X] T016 [P] Add outbox event creation and password sanitization checks to integration test suite in `src/modules/password/services/password.service.spec.ts`
- [X] T017 Append audit events (`authentication.password-changed` and `authentication.invitation-accepted`) to `auth_security_events_outbox` inside the PostgreSQL transaction in `src/modules/password/services/password.service.ts`

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verification and quality checks

- [X] T018 Run `quickstart.md` manual validation scenarios
- [X] T019 [P] Run linter and formatter tasks via `pnpm lint` and `pnpm format`
- [X] T020 Run full test suite and verify coverage gates via `pnpm test`

---

## Dependencies & Execution Order

### Phase Dependencies
- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup completion. Blocks user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational completion.
- **User Story 2 (Phase 4)**: Integrates with US1 flow.
- **Outbox Event (Phase 5)**: Integrates with the transaction flow in US1/US2.
- **Polish (Phase 6)**: Depends on all implementation phases.

### Parallel Opportunities
- T003 (DTO) and T005 (Controller routing) can be developed in parallel.
- All US1 test tasks (T006, T007, T008) and complexity policy (T009) can run in parallel.
- Invitation test tasks (T013) can be written in parallel with development.

---

## Implementation Strategy

### MVP First (User Story 1 Only)
1. Complete Setup and Foundational scaffolding.
2. Implement core password hashing, user activation, and session mapping in User Story 1.
3. Verify US1 works independently using `quickstart.md` guidelines.

### Incremental Delivery
1. Deliver MVP (US1) first.
2. Layer in US2 (Invitation cancellation).
3. Layer in Outbox events (Phase 5).
4. Run final regression testing and polish checklist.

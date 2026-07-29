# Tasks: Invitation & First-Time Access Setup

**Input**: Design documents from `/specs/005-invitation-setup/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included based on the spec's testing matrix.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Paths shown below assume a single project structure under the repository root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure.

- [X] T001 Create directories for controllers, services, and DTOs in src/modules/invite/
- [X] T002 Verify argon2 configuration in package.json and run build

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 [P] Implement CryptoAdapter in src/modules/invite/services/crypto.adapter.ts
- [X] T004 [P] Implement unit tests for CryptoAdapter in src/modules/invite/services/crypto.adapter.spec.ts
- [X] T005 [P] Implement CredentialDomainService in src/modules/auth/services/credential.domain.service.ts
- [X] T006 [P] Implement unit tests for CredentialDomainService in src/modules/auth/services/credential.domain.service.spec.ts
- [X] T007 Implement findPendingForUpdate and findActiveByUserId in src/modules/invite/repositories/invitation.repository.ts
- [X] T008 [P] Add invitation-related exceptions in src/modules/invite/exceptions/invitation.exception.ts

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Validate and Accept Invitation (Priority: P1) 🎯 MVP

**Goal**: Allow new employees to validate their invitation tokens and set their initial passwords to activate their accounts.

**Independent Test**: Call the validate endpoint with a valid token, then call the accept endpoint with a password, and verify the user's status shifts to ACTIVE and credentials are created.

### Tests for User Story 1

- [X] T009 [P] [US1] Create unit and integration tests in src/modules/invite/services/invitation.application.service.spec.ts

### Implementation for User Story 1

- [X] T010 [P] [US1] Implement invitation DTOs in src/modules/invite/dto/invitation.dto.ts
- [X] T011 [US1] Implement validateInvitation and acceptInvitation in src/modules/invite/services/invitation.application.service.ts
- [X] T012 [US1] Create InvitationController in src/modules/invite/controllers/invitation.controller.ts
- [X] T013 [P] [US1] Create controller tests in src/modules/invite/controllers/invitation.controller.spec.ts
- [X] T014 [US1] Export controllers and services in src/modules/invite/invite.module.ts

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently.

---

## Phase 4: User Story 2 - Admin Resend Invitation (Priority: P2)

**Goal**: Allow Administrators to resend invitation links to employees who have not set a password yet, revoking older pending invitations.

**Independent Test**: Admin calls resend endpoint for an INVITED employee. Verify old invitation is revoked, new invitation is created with incremented version, and event is written to outbox.

### Tests for User Story 2

- [X] T015 [P] [US2] Create integration tests for resendInvitation in src/modules/invite/services/invitation.application.service.spec.ts

### Implementation for User Story 2

- [X] T016 [US2] Implement resendInvitation in src/modules/invite/services/invitation.application.service.ts
- [X] T017 [US2] Create AdminInvitationController in src/modules/invite/controllers/admin-invitation.controller.ts
- [X] T018 [P] [US2] Create controller tests in src/modules/invite/controllers/admin-invitation.controller.spec.ts
- [X] T019 [US2] Register AdminInvitationController in src/modules/invite/invite.module.ts

**Checkpoint**: At this point, User Stories 1 AND 2 should both work.

---

## Phase 5: User Story 3 - Handle Invalid and Expired States (Priority: P2)

**Goal**: Securely handle all invalid token states (expired, already used, revoked, invalid hash) and throw `AUTH_INVITATION_INVALID`.

**Independent Test**: Attempt validation or acceptance with invalid, expired, or revoked tokens, and verify that HTTP 400 is returned with the correct error payload.

### Tests for User Story 3

- [X] T020 [P] [US3] Create tests for invalid/expired tokens in src/modules/invite/services/invitation.application.service.spec.ts

### Implementation for User Story 3

- [X] T021 [US3] Add validation checks in src/modules/invite/services/invitation.application.service.ts

**Checkpoint**: All invalid token states are securely handled.

---

## Phase 6: User Story 4 - E-mail Change Resilience (Priority: P3)

**Goal**: Ensure email changes (`employee.updated` event or administrative action) do not invalidate pending invitations.

**Independent Test**: Modify a user's email address and verify that their pending invitation can still be successfully validated and accepted.

### Tests for User Story 4

- [X] T022 [P] [US4] Create integration tests for email updating under pending invitation in src/modules/invite/services/invitation.application.service.spec.ts

### Implementation for User Story 4

- [X] T023 [US4] Verify email updates do not touch active invitations in src/modules/employee/repositories/employee-reference.repository.ts

**Checkpoint**: All user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories.

- [X] T024 Run end-to-end scenarios described in specs/005-invitation-setup/quickstart.md
- [X] T025 Run code formatting and linting scripts via package.json

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories.
- **User Stories (Phase 3+)**: All depend on Foundational phase completion.
  - User stories can then proceed in parallel (if staffed).
  - Or sequentially in priority order (P1 → P2 → P3).
- **Polish (Final Phase)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories.
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable.
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable.

### Within Each User Story

- Tests MUST be written and fail before implementation.
- Models before services.
- Services before endpoints.
- Core implementation before integration.
- Story complete before moving to next priority.

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel.
- All Foundational tasks marked [P] can run in parallel (within Phase 2).
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows).
- All tests for a user story marked [P] can run in parallel.
- Models within a story marked [P] can run in parallel.

---

## Parallel Example: User Story 1

```bash
# Launch both tests for User Story 1 together:
Task: "Create DTOs and test suite in src/modules/invite/services/invitation.application.service.spec.ts"

# Implement invitation logic and controller in parallel:
Task: "Implement DTOs in src/modules/invite/dto/invitation.dto.ts"
Task: "Create InvitationController in src/modules/invite/controllers/invitation.controller.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: Test User Story 1 independently.
5. Deploy/demo if ready.

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready.
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!).
3. Add User Story 2 → Test independently → Deploy/Demo.
4. Add User Story 3 → Test independently → Deploy/Demo.
5. Each story adds value without breaking previous stories.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- Each user story is independently completable and testable.
- Verify tests fail before implementing.
- Commit after each task or logical group.
- Stop at any checkpoint to validate story independently.

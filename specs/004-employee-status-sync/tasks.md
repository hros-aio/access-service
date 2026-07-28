# Tasks: Employee Status Synchronization

**Input**: Design documents from `/specs/004-employee-status-sync/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/` at repository root
- All paths are relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and registration of events

- [x] T001 Register event types in `src/enums/event-type.enum.ts`
- [x] T002 Import `EmployeeModule` and `InviteModule` in `src/modules/provisioning/provisioning.module.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Create `SessionApplicationService` in `src/modules/auth/services/session.application.service.ts`
- [x] T004 Create `SessionApplicationService` unit tests in `src/modules/auth/services/session.application.service.spec.ts`
- [x] T005 Register `SessionApplicationService` in `src/modules/auth/auth.module.ts`
- [x] T006 Create `EmployeeLifecycleEvent` interfaces in `src/kafka/interfaces/employee-lifecycle.interface.ts`
- [x] T007 Create `EmployeeLifecycleConsumer` class in `src/kafka/consumers/employee-lifecycle.consumer.ts`
- [x] T008 Register `EmployeeLifecycleConsumer` in `src/modules/provisioning/provisioning.module.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Revoke Access on Suspension (Priority: P1) 🎯 MVP

**Goal**: Immediate login block and session invalidation when employee status is set to suspended.

**Independent Test**: Trigger suspension event, verify database user status changes to `DISABLED`, security version increments, and Redis session keys are deleted.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US1] Write unit tests for `synchronizeEmployeeStatus` suspension path in `src/modules/provisioning/services/provisioning.application.service.spec.ts`
- [x] T010 [P] [US1] Write unit tests for `EmployeeLifecycleConsumer` suspension handling in `src/kafka/consumers/employee-lifecycle.consumer.spec.ts`

### Implementation for User Story 1

- [x] T011 [US1] Implement `synchronizeEmployeeStatus` in `src/modules/provisioning/services/provisioning.application.service.ts` for suspension (pessimistic lock, version check, status update to `disabled`, bump security version, write outbox `authentication.sessions-revoked`, write consumed event)
- [x] T012 [US1] Implement Redis session deletion inside `SessionApplicationService` in `src/modules/auth/services/session.application.service.ts` and call it post-commit
- [x] T013 [US1] Connect `employee.suspended` event pattern to application service status sync method in `src/kafka/consumers/employee-lifecycle.consumer.ts`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Terminate Employee Access (Priority: P1)

**Goal**: Permanent access revocation, cancellation of invitations, and purging of sessions on termination.

**Independent Test**: Trigger termination event, verify user status changes to `ARCHIVED`, pending invitations revoked, sessions cleared.

### Tests for User Story 2

- [x] T014 [P] [US2] Write unit tests for termination path in `src/modules/provisioning/services/provisioning.application.service.spec.ts`
- [x] T015 [P] [US2] Write unit tests for `EmployeeLifecycleConsumer` termination handling in `src/kafka/consumers/employee-lifecycle.consumer.spec.ts`

### Implementation for User Story 2

- [x] T016 [US2] Implement termination handling in `synchronizeEmployeeStatus` in `src/modules/provisioning/services/provisioning.application.service.ts` (status update to `archived`, bump security version, revoke active invitations, write outbox `authentication.sessions-revoked`, write consumed event)
- [x] T017 [US2] Connect `employee.terminated` event pattern to application service status sync method in `src/kafka/consumers/employee-lifecycle.consumer.ts`

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Reactivate Employee for Re-Onboarding (Priority: P2)

**Goal**: Transition reactivated user to invited status, revoke old credentials, and generate new onboarding invitation.

**Independent Test**: Trigger reactivation event, verify user status changes to `invited`, new invitation is created, outbox event is generated.

### Tests for User Story 3

- [x] T018 [P] [US3] Write unit tests for reactivation path in `src/modules/provisioning/services/provisioning.application.service.spec.ts`
- [x] T019 [P] [US3] Write unit tests for `EmployeeLifecycleConsumer` reactivation handling in `src/kafka/consumers/employee-lifecycle.consumer.spec.ts`

### Implementation for User Story 3

- [x] T020 [US3] Implement reactivation handling in `synchronizeEmployeeStatus` in `src/modules/provisioning/services/provisioning.application.service.ts` (status update to `invited`, bump security version, revoke old invitations, create new pending invitation with token hash, write outbox `authentication.user-invited`, write consumed event)
- [x] T021 [US3] Connect `employee.reactivated` event pattern to application service status sync method in `src/kafka/consumers/employee-lifecycle.consumer.ts`

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T022 Run complete unit and integration tests using `pnpm test`
- [x] T023 Run the quickstart validation scenarios defined in `specs/004-employee-status-sync/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories

---

## Parallel Example: User Story 1

```bash
# Launch tests for User Story 1:
Task: "Write unit tests for synchronizeEmployeeStatus suspension path in src/modules/provisioning/services/provisioning.application.service.spec.ts"
Task: "Write unit tests for EmployeeLifecycleConsumer suspension handling in src/kafka/consumers/employee-lifecycle.consumer.spec.ts"
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

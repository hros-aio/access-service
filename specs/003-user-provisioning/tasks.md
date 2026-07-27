# Tasks: Tenant Bootstrap Root Admin Provisioning

**Input**: Design documents from `/specs/003-user-provisioning/`

**Prerequisites**: [plan.md](plan.md) (required), [spec.md](spec.md) (required)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project dependency configuration and registry updates

- [X] T001 Add @new-hros/libs-events dependency to package.json
- [X] T002 Update pnpm-workspace.yaml overrides for @new-hros/libs-events
- [X] T003 [P] Register ProvisioningModule in src/app.module.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema migration, entities, and basic repositories setup

- [X] T004 Create database migration to define kafka_consumed_events table schema in src/migrations/1716710500000-AddIdempotencyAndRootAdminSupport.ts
- [X] T005 [P] Create ConsumedEvent entity in src/modules/provisioning/entities/consumed-event.entity.ts
- [X] T006 [P] Create ConsumedEventRepository extending BaseRepository in src/modules/provisioning/repositories/consumed-event.repository.ts
- [X] T007 Setup NestJS ProvisioningModule structure in src/modules/provisioning/provisioning.module.ts

---

## Phase 3: User Story 1 - Built-In Administrator Provisioning (Priority: P1) 🎯 MVP

**Goal**: Automatically create exactly one built-in administrator when a new tenant is set up via a consumed Kafka event.

**Independent Test**: Consume a valid `tenant.created` event and assert exactly one root admin user is created in database.

### Tests for User Story 1
- [X] T008 [P] [US1] Write unit tests for root admin provisioning in src/modules/provisioning/services/provisioning.application.service.spec.ts
- [X] T010 [P] [US1] Write unit tests for Kafka consumer in src/kafka/consumers/tenant-provisioning.consumer.spec.ts

### Implementation for User Story 1
- [X] T009 [US1] Implement root admin bootstrapping logic in src/modules/provisioning/services/provisioning.application.service.ts
- [X] T011 [US1] Implement TenantProvisioningConsumer in src/kafka/consumers/tenant-provisioning.consumer.ts
- [X] T012 [US1] Configure Kafka microservice listener in src/main.ts

---

## Phase 4: User Story 2 - Idempotent Event Consumption (Priority: P1)

**Goal**: Ensure duplicate Kafka events with identical eventIds are handled idempotently.

**Independent Test**: Send two identical event payloads and verify that the second is ignored cleanly as a no-op.

### Tests for User Story 2
- [X] T013 [P] [US2] Write unit tests for event idempotency checks in src/modules/provisioning/services/provisioning.application.service.spec.ts

### Implementation for User Story 2
- [X] T014 [US2] Update bootstrap service to enforce event idempotency checks in src/modules/provisioning/services/provisioning.application.service.ts

---

## Phase 5: User Story 3 - Outbox Security Event Relaying (Priority: P2)

**Goal**: Transactionally write an outbox record for downstream services when a root admin is provisioned.

**Independent Test**: Bootstrap a tenant and verify that a corresponding `authentication.user-provisioned` outbox event is successfully committed.

### Tests for User Story 3
- [X] T015 [P] [US3] Write unit tests for outbox logging in src/modules/provisioning/services/provisioning.application.service.spec.ts

### Implementation for User Story 3
- [X] T016 [US3] Update bootstrap service to write to outbox in src/modules/provisioning/services/provisioning.application.service.ts

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T017 [P] Run test suite coverage analysis in package.json
- [X] T018 [P] Validate system against quickstart scenarios in specs/003-user-provisioning/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories.
- **User Stories (Phase 3+)**: All depend on Foundational phase completion.
- **Polish (Final Phase)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories.
- **User Story 2 (P2)**: Extends User Story 1 but can be coded in parallel (different files/methods) or sequentially.
- **User Story 3 (P3)**: Extends User Story 1 but can be coded in parallel or sequentially.

---

## Parallel Example: User Story 1

```bash
# Launch test files concurrently
Task: "Write unit tests for root admin provisioning in src/modules/provisioning/services/provisioning.application.service.spec.ts"
Task: "Write unit tests for Kafka consumer in src/kafka/consumers/tenant-provisioning.consumer.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Verify that a valid Kafka event successfully provisions a root admin.

### Incremental Delivery

1. Setup + Foundation ready.
2. User Story 1 (MVP) → Test → Deploy/Demo.
3. User Story 2 (Idempotency) → Test → Deploy/Demo.
4. User Story 3 (Outbox Relaying) → Test → Deploy/Demo.
5. All verification scenarios pass.

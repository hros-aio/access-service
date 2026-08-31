# Tasks: Synchronization Status Visibility & Outcome Notifications

**Input**: Design documents from `specs/027-sync-status-notifications/` (`spec.md`, `plan.md`, `data-model.md`, `research.md`, `contracts/`, `quickstart.md`)

**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories), `research.md`, `data-model.md`, `contracts/`

**Tests**: Unit and integration tests are included in accordance with the project constitution (Constitution Principle V: TDD & Quality Gates).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story in priority order (P1 -> P2 -> P3 -> P4 -> P5).

## Format: `- [x] [TaskID] [P?] [Story?] Description with file path`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (`US1`, `US2`, `US3`, `US4`, `US5`)
- Descriptions include exact file paths.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Define response DTO contracts, enums, and shared classification constants for sync status and outcome notifications.

- [x] T001 [P] Create DTOs and enums for synchronization status in `src/modules/authorization/dto/sync-status-response.dto.ts`
- [x] T002 [P] Create DTO for tenant-wide synchronization summary in `src/modules/authorization/dto/sync-status-summary-response.dto.ts`
- [x] T003 [P] Define risk classification thresholds and sync notification constants in `src/modules/authorization/constants/sync-notification.constants.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core repository query helpers in `AuthorizationSyncJobRepository` required across projection queries, retry orchestration, and summaries.

- [x] T004 Implement `findLatestJobBySource`, `findLatestCompletedJobBySource`, and `findActiveJobBySource` query methods in `src/modules/authorization/repositories/authorization-sync-job.repository.ts`
- [x] T005 Add unit tests for new repository queries in `src/modules/authorization/repositories/authorization-sync-job.repository.spec.ts`

**Checkpoint**: Core queries available — User story implementations can proceed independently.

---

## Phase 3: User Story 1 - Real-Time Visibility of Synchronization Health and Progress (Priority: P1) 🎯 MVP

**Goal**: Deliver real-time status projection (`Pending`, `Processing`, `Completed`, `Failed`), metadata (`lastSuccessfulSyncAt`, `affectedUserCount`, `nextExpectedSyncMethod`), and active job progress inspection for Roles and User Groups.

**Independent Test**: Query `GET /authz/sync-status/:sourceType/:sourceId` for entities in various states (`Pending`, `Processing`, `Completed`, `Failed`) and verify accurate composite status, progress counters, and timestamps.

### Tests for User Story 1

- [x] T006 [P] [US1] Unit test for `SyncStatusProjectionService.getEntitySyncStatus` in `src/modules/authorization/services/sync-status-projection.service.spec.ts`
- [x] T007 [P] [US1] Controller unit and contract tests for `GET /authz/sync-status/:sourceType/:sourceId` in `src/modules/authorization/controllers/authorization-sync.controller.spec.ts`

### Implementation for User Story 1

- [x] T008 [US1] Implement `SyncStatusProjectionService.getEntitySyncStatus` with canonical state resolution in `src/modules/authorization/services/sync-status-projection.service.ts`
- [x] T009 [US1] Expose `GET /authz/sync-status/:sourceType/:sourceId` with `@RequirePermissions` in `src/modules/authorization/controllers/authorization-sync.controller.ts`

**Checkpoint**: User Story 1 is fully functional and delivers independent MVP value for entity-level synchronization visibility.

---

## Phase 4: User Story 2 - Tenant-Wide Synchronization Status Summary (Priority: P2)

**Goal**: Provide high-level dashboard aggregation showing counts of entities in `Completed`, `Pending`, `Processing`, and `Failed` states across all Roles and User Groups for a tenant.

**Independent Test**: Populate a tenant with known entity states and invoke `GET /authz/sync-status/summary` to verify matching aggregate counts (`totalEntities`, `completed`, `pending`, `processing`, `failed`).

### Tests for User Story 2

- [x] T010 [P] [US2] Unit test for `SyncStatusProjectionService.getTenantSummary` in `src/modules/authorization/services/sync-status-projection.service.spec.ts`
- [x] T011 [P] [US2] Controller unit test for `GET /authz/sync-status/summary` in `src/modules/authorization/controllers/authorization-sync.controller.spec.ts`

### Implementation for User Story 2

- [x] T012 [US2] Implement `SyncStatusProjectionService.getTenantSummary` with batch entity status aggregation in `src/modules/authorization/services/sync-status-projection.service.ts`
- [x] T013 [US2] Expose `GET /authz/sync-status/summary` with permission guards in `src/modules/authorization/controllers/authorization-sync.controller.ts`

**Checkpoint**: User Story 2 is functional and provides tenant-level authorization health summaries.

---

## Phase 5: User Story 3 - Event-Driven Outcome Notifications for High-Impact, Long-Running, and Failed Runs (Priority: P3)

**Goal**: Enrich synchronization completion and failure outbox events with classification metadata (`durationMs`, `isHighImpact`, `isLongRunning`, `requiresEmailNotification`) for downstream notification routing.

**Independent Test**: Run worker completion and failure scenarios and assert that generated `authorization.sync-completed` and `authorization.sync-failed` outbox rows contain accurate risk flags.

### Tests for User Story 3

- [x] T014 [P] [US3] Unit tests for event classification logic and duration calculation in `src/modules/authorization/services/authorization-reconciliation-worker.service.spec.ts`
- [x] T015 [P] [US3] Unit tests for enriched `AuthSecurityEventOutbox` factory methods in `src/modules/auth/entities/auth-security-event-outbox.entity.spec.ts`

### Implementation for User Story 3

- [x] T016 [US3] Update `AuthSecurityEventOutbox.fromAuthorizationSyncCompleted` and `fromAuthorizationSyncFailed` factory methods to include classification fields in `src/modules/auth/entities/auth-security-event-outbox.entity.ts`
- [x] T017 [US3] Update `AuthorizationReconciliationWorker` to calculate `durationMs`, evaluate `isHighImpact` and `isLongRunning`, and emit enriched outbox records on completion and failure in `src/modules/authorization/services/authorization-reconciliation-worker.service.ts`

**Checkpoint**: User Story 3 is functional; Kafka events are enriched with risk-based notification routing flags.

---

## Phase 6: User Story 4 - Actionable Recovery and Retry for Failed Synchronizations (Priority: P4)

**Goal**: Allow administrators to trigger an immediate retry for entities in `FAILED` status, resetting state to pending/processing, preventing duplicate in-flight retries, and recording audit records.

**Independent Test**: Call `POST /authz/sync-status/:sourceType/:sourceId/retry` on a failed entity and verify job enqueueing, rejection of already completed entities with 400 Bad Request, and conflict handling for active runs.

### Tests for User Story 4

- [x] T018 [P] [US4] Unit tests for `AuthorizationSyncService.retryFailedSync` in `src/modules/authorization/services/authorization-sync.service.spec.ts`
- [x] T019 [P] [US4] Controller tests for `POST /authz/sync-status/:sourceType/:sourceId/retry` in `src/modules/authorization/controllers/authorization-sync.controller.spec.ts`

### Implementation for User Story 4

- [x] T020 [US4] Implement `AuthorizationSyncService.retryFailedSync` with state verification and deduplication in `src/modules/authorization/services/authorization-sync.service.ts`
- [x] T021 [US4] Expose `POST /authz/sync-status/:sourceType/:sourceId/retry` protected by `@RequirePermissions('user_group.sync', 'role.sync')` in `src/modules/authorization/controllers/authorization-sync.controller.ts`

**Checkpoint**: User Story 4 is functional; failed synchronizations can be recovered with a single API call.

---

## Phase 7: User Story 5 - Multi-Tenant Authorization Isolation and Immutable Audit Trail (Priority: P5)

**Goal**: Guarantee strict tenant isolation and zero-secret audit logging across all status queries, summaries, retries, and event payloads.

**Independent Test**: Execute cross-tenant status and retry requests asserting 404 responses, and verify all outbox event payloads contain sanitized error reasons with zero credentials or PII.

### Tests for User Story 5

- [x] T022 [P] [US5] Integration and multi-tenant isolation tests for sync status and retry endpoints in `src/modules/authorization/controllers/authorization-sync.controller.spec.ts`

### Implementation for User Story 5

- [x] T023 [US5] Enforce tenant context validation and error sanitization in `src/modules/authorization/services/sync-status-projection.service.ts` and `src/modules/authorization/services/authorization-sync.service.ts`

**Checkpoint**: User Story 5 is verified; multi-tenant security and audit requirements are fully satisfied.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Observability metrics, module registration, documentation, and build validation.

- [x] T024 [P] Implement Prometheus metrics (`authz_sync_status_queries_duration_seconds`, `authz_sync_active_entities_gauge`, `authz_sync_retry_attempts_total`, `authz_sync_notifications_emitted_total`) in `src/modules/authorization/telemetry/sync-status.metrics.ts`
- [x] T025 Add unit tests for telemetry metrics in `src/modules/authorization/telemetry/sync-status.metrics.spec.ts`
- [x] T026 Register `SyncStatusProjectionService` and `AuthorizationSyncStatusMetrics` in `src/modules/authorization/authorization.module.ts`
- [x] T027 [P] Export new DTOs, services, and telemetry in `src/modules/authorization/index.ts`
- [x] T028 Run full test suite (`npm test -- src/modules/authorization/`) and build verification (`npm run build`)

---

## Dependencies & Execution Order

```
Phase 1: Setup (T001 - T003)
      │
      ▼
Phase 2: Foundational Repository Helpers (T004 - T005)
      │
      ├───────────────────────────────┬───────────────────────────────┐
      ▼                               ▼                               ▼
Phase 3: US1 Status Projection  Phase 5: US3 Event Enrichment   Phase 6: US4 Retry Flow
(T006 - T009)                   (T014 - T017)                   (T018 - T021)
      │
      ▼
Phase 4: US2 Summary Dashboard
(T010 - T013)
      │
      └───────────────────────────────┬───────────────────────────────┘
                                      ▼
                      Phase 7: US5 Multi-Tenant & Audit
                      (T022 - T023)
                                      │
                                      ▼
                      Phase 8: Polish & Telemetry
                      (T024 - T028)
```

---

## Parallel Execution Opportunities

- **Phase 1 (Setup)**: T001, T002, and T003 can be executed concurrently in parallel.
- **Phase 3 (US1)**: Test tasks T006 and T007 can be written concurrently.
- **Phase 4 (US2)**: Test tasks T010 and T011 can be written concurrently once T008 is complete.
- **Phase 5 (US3)** and **Phase 6 (US4)** can be implemented in parallel with **Phase 3 (US1)** once Phase 2 foundational tasks are complete.
- **Phase 8 (Polish)**: T024, T025, and T027 can be developed in parallel.

---

## Implementation Strategy

1. **MVP Scope**: Complete Phase 1 (Setup), Phase 2 (Foundational), and Phase 3 (User Story 1 - Real-Time Visibility). This immediately provides administrators with visibility into whether authorization changes are live, pending, processing, or failed.
2. **Incremental Delivery**:
   - Deliver US2 (Tenant Summary) for high-level monitoring.
   - Deliver US3 (Outcome Notification Events) to feed downstream alerts in `hros-notification-service`.
   - Deliver US4 (Failed Sync Retry) for self-service recovery.
   - Deliver US5 & Polish for complete multi-tenant security verification and Prometheus observability.

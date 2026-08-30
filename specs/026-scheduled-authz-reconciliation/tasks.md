# Tasks: Scheduled Authorization Reconciliation

**Input**: Design documents from `specs/026-scheduled-authz-reconciliation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. US1, US2, US3, US4)
- Include exact file paths in descriptions

---

### Phase 1: Setup (Infrastructure & Distributed Locking)

**Purpose**: Distributed locking adapter and scheduler configuration foundation

- [x] T001 [P] Implement `DistributedLockAdapter` interface and PostgreSQL session advisory lock implementation (`pg_try_advisory_lock` / `pg_advisory_unlock`) in `src/modules/authorization/services/distributed-lock.adapter.ts`
- [x] T002 [P] Implement unit tests for `DistributedLockAdapter` covering acquire, contention, release, and error handling in `src/modules/authorization/services/distributed-lock.adapter.spec.ts`
- [x] T003 Configure cron schedule constants and register `@nestjs/schedule` `ScheduleModule` support in `src/modules/authorization/authorization.module.ts`

---

## Phase 2: Foundational (Dirty Query & Orchestration Primitives)

**Purpose**: Core dirty entity scanner query and delegation to shared synchronization service

- [x] T004 Implement indexed dirty entity sweep query methods on `UserGroupRepository` and `RoleRepository` (`WHERE version <> projection_version AND deleted_at IS NULL`) in `src/modules/authorization/repositories/user-group.repository.ts` and `src/modules/authorization/repositories/role.repository.ts`
- [x] T005 [P] Implement unit tests for dirty query repository methods in `src/modules/authorization/repositories/user-group.repository.spec.ts`
- [x] T006 Ensure `AuthorizationSyncService.enqueueSyncJob(...)` supports invocation under `SYSTEM` context with `triggerType = SyncTriggerType.SCHEDULED` and `createdBy = 'SYSTEM'` in `src/modules/authorization/services/authorization-sync.service.ts`
- [x] T007 [P] Implement unit tests for `enqueueSyncJob` handling `SCHEDULED` triggers in `src/modules/authorization/services/authorization-sync.service.spec.ts`

**Checkpoint**: Distributed lock and dirty discovery primitives ready for scheduled workflow execution.

---

## Phase 3: User Story 1 - Automated Background Reconciliation of Unapplied Changes (Priority: P1) 🎯 MVP

**Goal**: Automatically scan all active tenants on a periodic schedule, discovering dirty configurations and enqueuing jobs for asynchronous convergence without requiring administrator action.

**Independent Test**: Seed dirty User Groups across multiple tenants, execute `ScheduledReconciliationScanner.triggerSweep()`, and assert jobs are enqueued with `trigger_type = 'SCHEDULED'` and converged to `COMPLETED` by the worker.

### Tests for User Story 1
- [x] T008 [P] [US1] Unit test suite for `ScheduledReconciliationScanner` in `src/modules/authorization/services/scheduled-reconciliation-scanner.service.spec.ts`

### Implementation for User Story 1
- [x] T009 [US1] Implement `ScheduledReconciliationScanner` cron job with configurable cadence (default: daily at 00:00 UTC) executing multi-tenant dirty entity scanning and batch delegation in `src/modules/authorization/services/scheduled-reconciliation-scanner.service.ts`
- [x] T010 [US1] Implement tenant batch iteration ensuring dirty entities for each tenant are enqueued independently with proper tenant boundary isolation in `src/modules/authorization/services/scheduled-reconciliation-scanner.service.ts`
- [x] T011 [US1] Register `ScheduledReconciliationScanner` and `DistributedLockAdapter` in `src/modules/authorization/authorization.module.ts`

**Checkpoint**: User Story 1 complete: automated scheduled sweeps discover dirty entities and queue them for projection convergence.

---

## Phase 4: User Story 2 - Cluster-Wide Single-Leader Sweep Execution (Priority: P2)

**Goal**: Coordinate scanner sweeps across multiple pod replicas so that exactly one node runs the sweep per cycle while others exit gracefully as no-ops.

**Independent Test**: Simulate concurrent executions across 3 simulated pod instances; assert only 1 instance acquires the advisory lock and runs the scan while 2 instances record contention no-ops.

### Tests for User Story 2
- [x] T012 [P] [US2] Concurrency test for multi-replica distributed lock acquisition in `src/modules/authorization/services/scheduled-reconciliation-scanner.service.spec.ts`

### Implementation for User Story 2
- [x] T013 [US2] Integrate `DistributedLockAdapter` lock acquisition and release within `finally` block in `ScheduledReconciliationScanner.handleCron()` in `src/modules/authorization/services/scheduled-reconciliation-scanner.service.ts`
- [x] T014 [US2] Handle graceful contention exit when lock is not acquired, logging informational status without throwing uncaught exceptions in `src/modules/authorization/services/scheduled-reconciliation-scanner.service.ts`

**Checkpoint**: User Story 2 complete: multi-replica cluster execution is safely serialized without duplicate sweeps.

---

## Phase 5: User Story 3 - Safe Coexistence with Manual Sync and Mid-Cycle Mutation (Priority: P3)

**Goal**: Prevent duplicate job creation when scheduled sweeps discover entities already in manual sync, and ensure mid-cycle configuration edits leave entities in dirty state for future cycles.

**Independent Test**: Trigger manual sync for an entity version and immediately run scheduled sweep on the same entity version; assert partial unique index catches collision without error.

### Tests for User Story 3
- [x] T015 [P] [US3] Concurrency and deduplication integration tests for manual vs scheduled collision in `src/modules/authorization/services/authorization-sync.service.spec.ts`

### Implementation for User Story 3
- [x] T016 [US3] Verify unique constraint collision handling (`uq_authz_sync_jobs_in_flight` / error `23505`) safely resolves as a no-op inside `AuthorizationSyncService.enqueueSyncJob` during scheduled sweeps in `src/modules/authorization/services/authorization-sync.service.ts`
- [x] T017 [US3] Verify that bumping configuration `version` during active scheduled worker processing preserves dirty state (`version > projection_version`) upon job completion in `src/modules/authorization/services/authorization-reconciliation-worker.service.ts`

**Checkpoint**: User Story 3 complete: safe coexistence between manual and scheduled reconciliation is validated.

---

## Phase 6: User Story 4 - Multi-Tenant Isolation, Failure Containment, Audit Logging & Telemetry (Priority: P4)

**Goal**: Ensure batch failures in one tenant do not block other tenants, emit `SCHEDULED` outbox audit events, and expose Prometheus scheduler metrics.

**Independent Test**: Run scheduled reconciliation across multiple tenants with one corrupted tenant; assert other tenants complete successfully, outbox events reflect `triggerType = 'SCHEDULED'`, and Prometheus metrics increment.

### Tests for User Story 4
- [x] T018 [P] [US4] Unit tests for scheduler Prometheus metrics in `src/modules/authorization/telemetry/scheduled-reconciliation.metrics.spec.ts`
- [x] T019 [P] [US4] Integration test verifying tenant failure containment and outbox event payload correctness in `test/integration/scheduled-reconciliation.e2e-spec.ts`

### Implementation for User Story 4
- [x] T020 [P] [US4] Implement `ScheduledReconciliationMetrics` defining `authz_scheduled_reconciliation_sweep_duration_seconds`, `authz_scheduled_reconciliation_dirty_entities_discovered_total`, `authz_scheduled_reconciliation_tenants_scanned_total`, and `authz_scheduled_reconciliation_lock_acquisitions_total` in `src/modules/authorization/telemetry/scheduled-reconciliation.metrics.ts`
- [x] T021 [US4] Instrument `ScheduledReconciliationScanner` with telemetry metrics and structured JSON logging in `src/modules/authorization/services/scheduled-reconciliation-scanner.service.ts`
- [x] T022 [US4] Ensure `SecurityEventModule` outbox messages for scheduled jobs persist `triggerType = 'SCHEDULED'` and `initiatedBy = 'SYSTEM'` across requested, completed, and failed events in `src/modules/authorization/services/authorization-sync.service.ts` and `src/modules/authorization/services/authorization-reconciliation-worker.service.ts`

**Checkpoint**: User Story 4 complete: multi-tenant resilience, observability, and audit emission are fully operational.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation, linting, and quickstart verification

- [x] T023 [P] Execute linter and TypeScript type check across project (`npm run lint`, `npx tsc --noEmit`)
- [x] T024 Run full test suite for authorization reconciliation (`npm test -- src/modules/authorization`)
- [x] T025 Execute quickstart validation scenarios defined in `specs/026-scheduled-authz-reconciliation/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies
- **Phase 1 (Setup)**: Can start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 completion (blocks user stories).
- **Phase 3 (US1 - Scheduled Scanner)**: Depends on Phase 2.
- **Phase 4 (US2 - Cluster Distributed Lock)**: Depends on Phase 1 & Phase 3.
- **Phase 5 (US3 - Collision Handling & Deduplication)**: Depends on Phase 3.
- **Phase 6 (US4 - Isolation, Telemetry & Audit)**: Can proceed in parallel with Phase 4/5.
- **Phase 7 (Polish)**: Depends on all user stories complete.

---

## Parallel Execution Opportunities

- T001, T002 can be implemented in parallel during Phase 1.
- T005, T007, T008, T012, T015, T018, T019 (unit, contract, and concurrency tests) can be written in parallel with service implementations.
- T020 (Metrics implementation) can proceed in parallel with US1 and US2.

---

## Implementation Strategy

### MVP Scope (User Story 1 Only)
1. Complete Phase 1 (Setup: DistributedLockAdapter) & Phase 2 (Foundational: Dirty query repository methods).
2. Complete Phase 3 (US1: `ScheduledReconciliationScanner` cron sweep and tenant batch iteration).
3. Validate dirty entities are automatically discovered and processed to `COMPLETED` without manual trigger.

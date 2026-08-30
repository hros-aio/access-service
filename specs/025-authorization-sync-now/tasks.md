# Tasks: Authorization Sync Now

**Input**: Design documents from `specs/025-authorization-sync-now/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database migrations and entity definitions for sync tracking

- [x] T001 Create TypeORM database migration for `authorization_sync_jobs` with indexes and partial unique constraints in `src/migrations/1724900000000-create-authorization-sync-jobs.ts`
- [x] T002 [P] Create `AuthorizationSyncJob` entity model in `src/modules/authorization/entities/authorization-sync-job.entity.ts`
- [x] T003 [P] Create DTOs `TriggerSyncNowDto` and `SyncJobResponseDto` in `src/modules/authorization/dto/trigger-sync-now.dto.ts` and `src/modules/authorization/dto/sync-job-response.dto.ts`
- [x] T004 Implement `AuthorizationSyncJobRepository` with atomic claim and status update methods in `src/modules/authorization/repositories/authorization-sync-job.repository.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core synchronization orchestration, outbox event publishing, and module wiring

- [x] T005 [P] Implement unit tests for `AuthorizationSyncJobRepository` in `src/modules/authorization/repositories/authorization-sync-job.repository.spec.ts`
- [x] T006 Implement `AuthorizationSyncService` with dirty-check (`version > projection_version`), in-flight idempotency handling, and no-op resolution in `src/modules/authorization/services/authorization-sync.service.ts`
- [x] T007 [P] Implement unit tests for `AuthorizationSyncService` in `src/modules/authorization/services/authorization-sync.service.spec.ts`
- [x] T008 Register entities, repository, and services in `src/modules/authorization/authorization.module.ts`

**Checkpoint**: Core foundation and entity persistence ready for user story implementations.

---

## Phase 3: User Story 1 - Trigger Immediate On-Demand Synchronization (Priority: P1) 🎯 MVP

**Goal**: Tenant administrators can trigger manual sync for dirty Roles and User Groups, queueing asynchronous recalculation without blocking HTTP requests.

**Independent Test**: Send `POST /authz/sync-now` on a dirty entity, receive `200 OK` with `jobId` and `status: PENDING`, while verified that already-synchronized entities return an idempotent no-op.

### Tests for User Story 1
- [x] T009 [P] [US1] Unit and controller test for `POST /authz/sync-now` in `src/modules/authorization/controllers/authorization-sync.controller.spec.ts`

### Implementation for User Story 1
- [x] T010 [US1] Create `AuthorizationSyncController` exposing `POST /authz/sync-now` with `@RequirePermissions('user_group.sync', 'role.sync')` guard in `src/modules/authorization/controllers/authorization-sync.controller.ts`
- [x] T011 [US1] Implement `AuthorizationReconciliationWorker` batch processor executing dynamic matching and effective role recalculations via `EffectiveRoleProjectionService` in `src/modules/authorization/services/authorization-reconciliation-worker.service.ts`
- [x] T012 [P] [US1] Implement unit tests for `AuthorizationReconciliationWorker` in `src/modules/authorization/services/authorization-reconciliation-worker.service.spec.ts`
- [x] T013 [US1] Update `projection_version = source_version` on source `UserGroup` or `Role` upon worker batch completion in `src/modules/authorization/services/authorization-reconciliation-worker.service.ts`

**Checkpoint**: User Story 1 is functional: manual sync jobs can be triggered and processed asynchronously.

---

## Phase 4: User Story 2 - Track Synchronization Progress and Job Transparency (Priority: P2)

**Goal**: Tenant administrators can query real-time execution status and user progress metrics (`processed_users` vs `total_users`).

**Independent Test**: Send `GET /authz/sync-jobs/:jobId` for in-flight and completed jobs to verify progress reporting and completion timestamps.

### Tests for User Story 2
- [x] T014 [P] [US2] Unit test for status query in `src/modules/authorization/controllers/authorization-sync.controller.spec.ts`

### Implementation for User Story 2
- [x] T015 [US2] Implement `getJobStatus(jobId)` in `src/modules/authorization/services/authorization-sync.service.ts`
- [x] T016 [US2] Expose `GET /authz/sync-jobs/:jobId` endpoint on `AuthorizationSyncController` with Swagger documentation in `src/modules/authorization/controllers/authorization-sync.controller.ts`
- [x] T017 [US2] Instrument batch progress updates to increment `processed_users` periodically during worker loop in `src/modules/authorization/services/authorization-reconciliation-worker.service.ts`

**Checkpoint**: User Story 2 is functional: real-time status and progress metrics can be polled by administrators.

---

## Phase 5: User Story 3 - Concurrency Deduplication and Batch Collision Safety (Priority: P3)

**Goal**: Concurrent manual or scheduled sync requests for the same entity version resolve idempotently to the same running job.

**Independent Test**: Issue concurrent requests for the same dirty version and verify PostgreSQL `23505` catch handles graceful deduplication.

### Tests for User Story 3
- [x] T018 [P] [US3] Concurrency and deduplication unit tests in `src/modules/authorization/services/authorization-sync.service.spec.ts`

### Implementation for User Story 3
- [x] T019 [US3] Implement conflict catch (`23505`) on partial unique index collision in `AuthorizationSyncService.requestSyncNow()` returning the active job in `src/modules/authorization/services/authorization-sync.service.ts`
- [x] T020 [US3] Ensure mid-sync configuration edits leave the entity dirty (`version > projection_version`) so subsequent updates trigger fresh syncs in `src/modules/authorization/services/authorization-reconciliation-worker.service.ts`

**Checkpoint**: User Story 3 is functional: concurrent races and mid-sync mutations are handled safely.

---

## Phase 6: User Story 4 - Multi-Tenant Isolation, Watchdog Recovery & Audit Events (Priority: P4)

**Goal**: Enforce strict tenant isolation, recover orphaned jobs via watchdog, and produce outbox audit events.

**Independent Test**: Verify cross-tenant requests yield 404, outbox contains event records, and stuck `PROCESSING` jobs are recovered.

### Tests for User Story 4
- [x] T021 [P] [US4] Unit tests for `SyncJobWatchdogService` in `src/modules/authorization/services/sync-job-watchdog.service.spec.ts`
- [x] T022 [P] [US4] Multi-tenant scoping and outbox generation tests in `src/modules/authorization/services/authorization-sync.service.spec.ts`

### Implementation for User Story 4
- [x] T023 [US4] Implement `SyncJobWatchdogService` to reclaim stalled jobs (`status = PROCESSING` past 10 minutes) and emit failure events if retries exceeded in `src/modules/authorization/services/sync-job-watchdog.service.ts`
- [x] T024 [US4] Append transactional outbox events (`authorization.sync-requested`, `authorization.sync-completed`, `authorization.sync-failed`) to `auth_security_events_outbox` in `src/modules/authorization/services/authorization-sync.service.ts` and `src/modules/authorization/services/authorization-reconciliation-worker.service.ts`
- [x] T025 [US4] Enforce tenant filter on all repository queries ensuring cross-tenant queries return 404 in `src/modules/authorization/repositories/authorization-sync-job.repository.ts`

**Checkpoint**: User Story 4 is functional: watchdog recovery, multi-tenant security, and audit outbox events are in place.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation, linting, and documentation verification

- [x] T026 [P] Execute linter and type-checker across newly added files (`npm run lint`, `npx tsc --noEmit`)
- [x] T027 Run full test suite covering authorization sync modules (`npm run test -- authorization`)
- [x] T028 Validate end-to-end scenarios against `specs/025-authorization-sync-now/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies
- **Phase 1 (Setup)**: Can start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 completion (blocks user stories).
- **Phase 3 (US1 - Trigger Sync)**: Depends on Phase 2.
- **Phase 4 (US2 - Status Polling)**: Depends on Phase 3.
- **Phase 5 (US3 - Deduplication & Concurrency)**: Can run in parallel or after Phase 3.
- **Phase 6 (US4 - Watchdog & Outbox Events)**: Depends on Phase 3 & 4.
- **Phase 7 (Polish)**: Depends on all user stories complete.

---

## Parallel Execution Opportunities

- T002, T003 can be built in parallel during Setup.
- T005, T007, T009, T012, T014, T018, T021, T022 (unit and contract tests) can be developed in parallel with service implementations.
- US2 (Status Polling) and US3 (Concurrency Deduplication) can proceed concurrently once US1 core worker lands.

---

## Implementation Strategy

### MVP Scope (User Story 1 Only)
1. Complete Phase 1 (Setup) & Phase 2 (Foundational).
2. Complete Phase 3 (US1 - Trigger Sync & Worker).
3. Validate `POST /authz/sync-now` initiates asynchronous projection recalculation.

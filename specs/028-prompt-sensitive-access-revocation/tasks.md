# Tasks: Prompt Revocation of Sensitive Access

**Input**: Design documents from `specs/028-prompt-sensitive-access-revocation/` (`spec.md`, `plan.md`, `data-model.md`, `research.md`, `contracts/`, `quickstart.md`)

**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories), `research.md`, `data-model.md`, `contracts/`

**Tests**: Unit and integration tests are included in accordance with the project constitution (Constitution Principle V: TDD & Quality Gates).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story in priority order (P1 -> P2 -> P3 -> P4).

## Format: `- [x] [TaskID] [P?] [Story?] Description with file path`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (`US1`, `US2`, `US3`, `US4`)
- Descriptions include exact file paths.

---

## Phase 1: Setup (Shared Infrastructure & Database Migration)

**Purpose**: Database schema migration for priority queueing and shared DTO/enum contracts.

- [x] T001 [P] Create TypeORM database migration adding `priority` enum (`URGENT`, `STANDARD`, `SCHEDULED`) and partial index on `authorization_sync_jobs` in `src/migrations/1756720000000-add-priority-to-authorization-sync-jobs.ts`
- [x] T002 [P] Update `AuthorizationSyncJob` entity and `SyncJobPriority` enum in `src/modules/authorization/entities/authorization-sync-job.entity.ts`
- [x] T003 [P] Create DTO contract for role permissions update in `src/modules/roles/dto/update-role-permissions.dto.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core priority-ordered job repository queries and base sync queue dispatch capabilities.

- [x] T004 Implement `claimNextPendingJob` in `AuthorizationSyncJobRepository` with `ORDER BY priority DESC, created_at ASC FOR UPDATE SKIP LOCKED` in `src/modules/authorization/repositories/authorization-sync-job.repository.ts`
- [x] T005 [P] Add unit tests for priority-ordered job claiming in `src/modules/authorization/repositories/authorization-sync-job.repository.spec.ts`
- [x] T006 Update `AuthorizationSyncService.enqueueSyncJob` to accept optional `priority: SyncJobPriority` in `src/modules/authorization/services/authorization-sync.service.ts`
- [x] T007 [P] Add unit tests for priority-aware enqueueing in `src/modules/authorization/services/authorization-sync.service.spec.ts`

**Checkpoint**: Core priority queueing and repository claiming are ready — User story implementations can proceed.

---

## Phase 3: User Story 1 - Prompt Direct Role Capability Revocation across Active User Sessions (Priority: P1) 🎯 MVP

**Goal**: Deliver immediate, prompt cutoff for permissions removed from a Role by synchronizing changes directly to PostgreSQL and the Redis runtime role cache in the save transaction, emitting `role.permissions-updated` to the outbox.

**Independent Test**: Revoke a capability from Role `R1` via API; verify that `authz:role:{tenant}:{roleId}` in Redis reflects the new permission set immediately without worker delay and subsequent authorization checks for users holding `R1` deny the capability.

### Tests for User Story 1

- [x] T008 [P] [US1] Unit tests for `RoleApplicationService.updatePermissions` verifying atomic DB write and Redis overwrite/eviction in `src/modules/roles/services/role.application.service.spec.ts`
- [x] T009 [P] [US1] Controller unit tests for role permission revocation in `src/modules/roles/controllers/role.controller.spec.ts`

### Implementation for User Story 1

- [x] T010 [US1] Implement atomic permission update, version increment, and synchronous Redis cache overwrite (`authz:role:{tenant}:{roleId}`) in `RoleApplicationService.updatePermissions` in `src/modules/roles/services/role.application.service.ts`
- [x] T011 [US1] Enforce system role inviolability check rejecting protected capability revocation in `src/modules/roles/services/role.application.service.ts`
- [x] T012 [US1] Append `role.permissions-updated` event to `auth_security_events_outbox` in `src/modules/roles/services/role.application.service.ts`
- [x] T013 [US1] Expose/update role permission endpoint in `src/modules/roles/controllers/role.controller.ts`

**Checkpoint**: User Story 1 is fully functional and delivers independent MVP value for synchronous Role permission cutoffs.

---

## Phase 4: User Story 2 - Expedited Priority Queueing for User Group Capability Revocation (Priority: P2)

**Goal**: Automatically route User Group access revocations into `authorization_sync_jobs` with `priority = 'URGENT'`, ensuring workers claim and process them ahead of routine scheduled batch jobs.

**Independent Test**: Place `SCHEDULED` jobs in the queue, trigger a User Group role unassignment, and assert that the synchronization worker claims and processes the `URGENT` group task before any `SCHEDULED` task.

### Tests for User Story 2

- [x] T014 [P] [US2] Unit tests for `UserGroupApplicationService` verifying `URGENT` priority dispatch on role unassignment in `src/modules/user-groups/services/user-group-role-assignment.service.spec.ts`
- [x] T015 [P] [US2] Integration test verifying `AuthorizationSyncWorker` claims `URGENT` jobs ahead of `SCHEDULED` jobs in `src/modules/authorization/services/authorization-reconciliation-worker.service.spec.ts`

### Implementation for User Story 2

- [x] T016 [US2] Update `UserGroupRoleAssignmentService.updateRoleAssignments` to detect role removals and enqueue sync jobs with `priority = 'URGENT'` via `AuthSecurityEventOutbox` in `src/modules/user-groups/services/user-group-role-assignment.service.ts`
- [x] T017 [US2] Update `UserGroupLifecycleService.updateUserGroup` to enqueue sync jobs with `priority = 'URGENT'` when criteria narrow membership in `src/modules/user-groups/services/user-group-lifecycle.service.ts`
- [x] T018 [US2] Update `AuthorizationReconciliationWorker` loop to poll tasks via `claimNextPendingJob` respecting priority ordering in `src/modules/authorization/services/authorization-reconciliation-worker.service.ts`

**Checkpoint**: User Story 2 is functional; urgent group revocations are automatically prioritized in the background worker queue.

---

## Phase 5: User Story 3 - Safe Recalculation Preserving Cumulative Independent Grants (Priority: P3)

**Goal**: Execute accelerated projection recalculations for affected populations, strictly enforcing cumulative multi-group union rules and updating `authz:user:{tenant}:{userId}` in Redis.

**Independent Test**: Assign a user to Group A and Group B (both granting Role R). Revoke Role R from Group A. Execute recalculation and assert that the user continues to retain Role R in `user_effective_roles` and Redis.

### Tests for User Story 3

- [x] T019 [P] [US3] Unit tests for `EffectiveRoleProjectionService` verifying cumulative multi-group union logic and scoped recalculation in `src/modules/authorization/services/effective-role-projection.service.spec.ts`
- [x] T020 [P] [US3] Unit tests for Redis user cache projection updates in `src/modules/authorization/services/effective-role-projection.service.spec.ts`

### Implementation for User Story 3

- [x] T021 [US3] Implement scoped user recalculation in `EffectiveRoleProjectionService.recomputeUserEffectiveRoles` preserving multi-group cumulative grants in `src/modules/authorization/services/effective-role-projection.service.ts`
- [x] T022 [US3] Synchronously update `user_effective_roles` in PostgreSQL and `authz:user:{tenant}:{userId}` in Redis upon recalculation completion in `src/modules/authorization/services/effective-role-projection.service.ts`
- [x] T023 [US3] Connect `AuthorizationReconciliationWorker` to invoke `EffectiveRoleProjectionService` for `USER_GROUP` sync tasks in `src/modules/authorization/services/authorization-reconciliation-worker.service.ts`

**Checkpoint**: User Story 3 is functional; group-level access recalculation correctly preserves overlapping independent grants and updates user cache promptly.

---

## Phase 6: User Story 4 - Urgent Revocation Failure Alerting & Immutable Audit Trail (Priority: P4)

**Goal**: If an urgent revocation task fails after retries, transition job status to `FAILED`, emit a critical alert event `authorization.sync-failed` (`urgency: CRITICAL`) via the transactional outbox, and record an immutable audit log.

**Independent Test**: Force an unrecoverable error during an `URGENT` sync job; assert that job status is `FAILED` and `auth_security_events_outbox` contains a critical failure event with sanitized error details.

### Tests for User Story 4

- [x] T024 [P] [US4] Unit tests for critical failure outbox emission in `src/modules/authorization/services/authorization-reconciliation-worker.service.spec.ts`
- [x] T025 [P] [US4] Unit tests for `AuthSecurityEventOutbox.fromAuthorizationSyncFailed` with `urgency = 'CRITICAL'` in `src/modules/auth/entities/auth-security-event-outbox.entity.ts`

### Implementation for User Story 4

- [x] T026 [US4] Implement `AuthSecurityEventOutbox.fromAuthorizationSyncFailed` to append `authorization.sync-failed` with `urgency = 'CRITICAL'` and sanitized error codes into `auth_security_events_outbox` in `src/modules/auth/entities/auth-security-event-outbox.entity.ts`
- [x] T027 [US4] Extend `AuthorizationReconciliationWorker` error handling to emit failure event with critical urgency when sync fails in `src/modules/authorization/services/authorization-reconciliation-worker.service.ts`
- [x] T028 [US4] Record immutable audit log entries for all urgent revocation dispatches and outcomes in `src/modules/auth/entities/auth-security-event-outbox.entity.ts`

**Checkpoint**: User Story 4 is functional; urgent failures trigger critical alerts without silent drops.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end integration tests, telemetry metrics, and documentation validation.

- [x] T029 [P] Create end-to-end validation test covering synchronous role cutoff, priority queueing, cumulative evaluation, and failure alerting in `test/authorization/prompt-revocation.e2e-spec.ts`
- [x] T030 [P] Add Prometheus metrics for urgent sync queue depth and execution duration in `src/modules/authorization/telemetry/authorization-sync.metrics.ts`
- [x] T031 Run quickstart.md validation scenarios and verify zero lint errors across modified files

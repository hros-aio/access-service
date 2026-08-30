# Feature Specification: Scheduled Authorization Reconciliation

**Feature Branch**: `026-scheduled-authz-reconciliation`

**Created**: 2026-08-30

**Status**: Ready for Planning

**Input**: User description: "Scheduled authorization reconciliation (FEAT-AUTHZ-12). Periodic background process to guarantee eventual consistency by scanning and reconciling unapplied authorization changes across all tenants."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automated Background Reconciliation of Unapplied Changes (Priority: P1)

Organizations require an automated background process that periodically scans all active tenants for unsynchronized authorization configurations (such as User Groups or Roles where modifications occurred but immediate sync was not run) and reconciles them into live access projections without requiring manual administrator intervention.

**Why this priority**: Core value of the feature — guarantees eventual consistency across all tenants and ensures authorization changes become active even if administrators do not manually trigger "Sync Now".

**Independent Test**: Can be tested by creating or updating a User Group or Role without triggering manual sync (`version > projection_version`), executing the scheduled reconciliation sweep, and verifying that dirty configurations are automatically enqueued, processed, and their `projection_version` converges to `version`.

**Acceptance Scenarios**:

1. **Given** one or more User Groups or Roles across active tenants have pending changes (`version > projection_version`), **When** the scheduled reconciliation sweep runs, **Then** the system discovers all dirty entities across tenants, enqueues background sync jobs with trigger type `SCHEDULED` under `SYSTEM` context, processes projection recalculations via the shared engine, and updates their status to `COMPLETED`.
2. **Given** all User Groups and Roles in a tenant are fully synchronized (`version == projection_version`), **When** the scheduled reconciliation sweep scans the tenant, **Then** the system skips all synchronized entities without generating sync jobs or invoking recomputation.

---

### User Story 2 - Cluster-Wide Single-Leader Sweep Execution (Priority: P2)

In multi-pod / multi-instance deployments, scheduled reconciliation triggers must coordinate across replicas so that only a single instance executes the scan during any given schedule cycle, preventing redundant load and database contention.

**Why this priority**: Ensures system scalability and prevents stampeding database load or duplicate job enqueue attempts when running multiple service replicas in cloud environments.

**Independent Test**: Can be tested by running multiple application replicas with simultaneous scheduler triggers and verifying that exactly one node acquires the cluster-wide distributed lock while other replicas skip the scan gracefully.

**Acceptance Scenarios**:

1. **Given** multiple running application replicas across a cluster, **When** the scheduled cycle trigger fires simultaneously on all pods, **Then** exactly one replica acquires the cluster distributed lock, executes the tenant sweep, and releases the lock upon completion.
2. **Given** a secondary pod attempts to execute a scheduled sweep while another pod holds the distributed lock, **When** lock acquisition is attempted, **Then** the secondary pod exits the scheduled cycle immediately as a non-blocking no-op and increments contention observability counters.
3. **Given** a pod holding the distributed lock terminates unexpectedly mid-sweep, **When** the underlying connection drops or lock lease expires, **Then** subsequent scheduled reconciliation cycles acquire the lock normally without deadlock.

---

### User Story 3 - Safe Coexistence with Manual Sync and Mid-Cycle Mutation (Priority: P3)

When scheduled reconciliation discovers a dirty entity that is already undergoing manual "Sync Now" processing, or when an administrator modifies an entity while a scheduled job is actively processing, the system must coordinate safely without state corruption or missed updates.

**Why this priority**: Maintains data integrity under real-world concurrency where manual administrator actions overlap with automated background sweeps.

**Independent Test**: Can be tested by starting a manual sync for an entity and running the scheduled sweep concurrently, and by updating an entity's version while a scheduled sync is mid-execution.

**Acceptance Scenarios**:

1. **Given** an active manual sync job is currently `PENDING` or `PROCESSING` for an entity version, **When** the scheduled sweep discovers the same entity version, **Then** the database unique constraint (`uq_authz_sync_jobs_in_flight`) deduplicates the enqueue request as a graceful no-op without creating duplicate work.
2. **Given** an entity has `version = 5` and a scheduled sync job is actively calculating projections, **When** an administrator modifies the entity configuration advancing it to `version = 6`, **Then** the active job finishes converging `projection_version = 5`, leaving the entity in a dirty state (`version > projection_version`) so that the next scheduled sweep or manual sync picks up the newer changes.

---

### User Story 4 - Multi-Tenant Isolation, Failure Containment, and Audit Logging (Priority: P4)

Scheduled reconciliation runs across all tenants in the platform, but processing must remain strictly isolated such that volume, heavy workloads, or failures in one tenant never affect the reconciliation of other tenants, while all actions produce comprehensive audit and telemetry records.

**Why this priority**: Ensures multi-tenant reliability, fault isolation, and enterprise compliance across large multi-tenant deployments.

**Independent Test**: Can be tested by simulating a failing/corrupted group configuration in Tenant A alongside valid configurations in Tenant B, verifying Tenant B completes successfully, and asserting audit log/outbox events reflect `trigger_type = 'SCHEDULED'`.

**Acceptance Scenarios**:

1. **Given** scheduled reconciliation processes dirty entities across Tenant A and Tenant B, **When** Tenant A encounters an unhandled evaluation error, **Then** Tenant A's job transitions to `FAILED` with error details recorded, while Tenant B's sync jobs continue processing to `COMPLETED` without degradation.
2. **Given** scheduled jobs are enqueued, completed, or failed, **When** state transitions occur, **Then** the system commits corresponding immutable audit entries and Transactional Outbox events (`authorization.sync-requested`, `authorization.sync-completed`, `authorization.sync-failed`) with `triggerType = 'SCHEDULED'` and `createdBy = 'SYSTEM'`.

---

### Edge Cases

- **Distributed Scheduler Lock Contention / Failure**: If a pod fails to acquire the distributed advisory/redis lock, it logs an informational event, updates metric counters, and exits without throwing uncaught errors or retrying aggressively.
- **Worker Crash Mid-Processing**: If a worker pod crashes while executing a scheduled job, the existing watchdog mechanism (`SyncJobWatchdogService`) detects the orphaned `PROCESSING` job and resets it to `PENDING` for recovery.
- **Zero Dirty Entities Found**: When all tenants are synchronized, the sweep completes rapidly in minimal time without acquiring entity-level table locks or writing unnecessary database rows.
- **High Multi-Tenant Volume**: Scanning hundreds or thousands of tenants evaluates entities in isolated, bounded query batches to avoid exhausting database connection pools or memory.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST execute a scheduled periodic reconciliation process (configurable cadence, default: at minimum daily at 00:00 UTC per tenant/environment configuration).
- **FR-002**: System MUST use a cluster-wide distributed locking mechanism to ensure only a single application instance executes the scheduled scanner sweep at any time across multi-pod deployments.
- **FR-003**: System MUST scan active tenants for unsynchronized authorization entities where `version <> projection_version` (restricted to `USER_GROUP` and defensively `ROLE`).
- **FR-004**: System MUST skip already synchronized configurations (`version == projection_version`) during the scheduled sweep without creating jobs or triggering projection recalculations.
- **FR-005**: System MUST execute the scheduled sweep under platform `SYSTEM` context (`trigger_type = 'SCHEDULED'`, `created_by = 'SYSTEM'`), bypassing interactive tenant-admin authentication/authorization checks.
- **FR-006**: System MUST delegate discovered dirty configurations to the shared synchronization orchestration primitive (`AuthorizationSyncService.enqueueSyncJob`), inheriting database-level deduplication (`uq_authz_sync_jobs_in_flight`) and transactional outbox event emission.
- **FR-007**: System MUST handle unique constraint collisions (`23505`) gracefully as a no-op when an in-flight manual or scheduled job already exists for the discovered entity version.
- **FR-008**: System MUST reuse the shared `AuthorizationReconciliationWorker` engine to claim, process, and converge scheduled reconciliation jobs without branching core worker recalculation logic (ADR-A14).
- **FR-009**: System MUST ensure multi-tenant isolation such that batch reconciliation errors in one tenant do not block or abort reconciliation in other tenants.
- **FR-010**: System MUST persist `authorization.sync-requested`, `authorization.sync-completed`, and `authorization.sync-failed` events to the Transactional Outbox table tagged with `triggerType = 'SCHEDULED'`.
- **FR-011**: System MUST expose dedicated scheduler telemetry and metrics (sweep duration, tenants evaluated, dirty entities found, and lock contention counts) without unbounded label cardinality.

### Key Entities *(include if feature involves data)*

- **Authorization Sync Job (`authorization_sync_jobs`)**: Reused shared entity tracking synchronization runs. For scheduled reconciliation, `trigger_type` is set to `SCHEDULED` and `created_by` is set to `SYSTEM`.
- **User Group (`user_groups`)**: Authorization entity with dynamic matching criteria. Contains `version` (modified version) and `projection_version` (last converged version).
- **Role (`roles`)**: Authorization entity with permission bindings. Contains `version` and `projection_version`.
- **User Effective Roles / Group Memberships (`user_group_memberships`, `user_effective_roles`)**: Projected authorization cache tables updated by the shared worker engine.
- **Security Events Outbox (`auth_security_events_outbox`)**: Transactional outbox table capturing `SCHEDULED` sync events for reliable Kafka publishing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of unsynchronized authorization entities (`version > projection_version`) across all active tenants are automatically identified and enqueued during the scheduled cycle.
- **SC-002**: 0 duplicate jobs are created when scheduled reconciliation encounters an entity already undergoing manual or scheduled synchronization.
- **SC-003**: Cluster distributed lock guarantees that exactly 1 pod replica executes the dirty configuration scan per scheduled cycle across any number of deployed replicas.
- **SC-004**: 100% of tenant reconciliation batches execute with strict multi-tenant isolation, ensuring a failure in any single tenant has 0 impact on other tenants.
- **SC-005**: 100% of scheduled sync lifecycles (requested, completed, failed) generate audit log records and transactional outbox events with `triggerType = 'SCHEDULED'`.

## Assumptions

- Reuses the shared persistence schema, indexes (`uq_authz_sync_jobs_in_flight`, `idx_authz_sync_jobs_poll`), and enums established by `FEAT-AUTHZ-11` (`BE-SYNC-001`) with zero new database schema migrations.
- Reuses the shared `AuthorizationSyncService.enqueueSyncJob(...)` primitive, `AuthorizationReconciliationWorker`, and `SyncJobWatchdogService` without introducing separate batch execution pipelines.
- Distributed locking utilizes PostgreSQL advisory locks or Redis distributed lock TTL conventions available in the deployment environment.
- The default reconciliation schedule is configurable via environment configuration (defaulting to daily at 00:00 UTC).

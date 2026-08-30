# Research & Technical Decisions: Scheduled Authorization Reconciliation

**Feature**: `026-scheduled-authz-reconciliation`
**Status**: Completed

## 1. Single-Leader Distributed Locking Strategy

### Context & Challenge
In a multi-replica Kubernetes deployment of `hros-access-service`, recurring cron timers fire on every replica at the scheduled cadence (e.g., midnight UTC). If all pods execute the dirty entity scan simultaneously, it causes redundant database queries, connection spikes, and duplicate enqueue attempts.

### Decision
- **DistributedLockAdapter with PostgreSQL Session Advisory Locks or Redis Key with TTL**:
  - Primary implementation uses PostgreSQL session advisory locks (`SELECT pg_try_advisory_lock(:lockKey)` / `SELECT pg_advisory_unlock(:lockKey)`) with fallback/alternative to Redis `SET lock:authz_reconciliation <pod_id> NX EX 3600`.
  - Advisory lock key is a deterministic 64-bit integer hashed from `authz:scheduled_reconciliation:scanner`.
  - If lock acquisition returns `false`, the pod skips the sweep immediately as a graceful no-op and increments `authz_scheduled_reconciliation_lock_acquisitions_total{status="contended_skipped"}`.
  - The lock is always released inside a `finally` block or automatically freed if the database connection drops.
- **Alternatives Considered**:
  - *Kubernetes CronJob calling an internal API*: Adds operational deployment complexity and requires exposing unauthenticated internal endpoints or complex mTLS ingress.
  - *Relying solely on DB Unique Constraints without a lock*: Causes all replicas to query dirty entities across all tenants and flood the DB with duplicate insert attempts that fail on `uq_authz_sync_jobs_in_flight`. Adding the distributed lock avoids unnecessary database load entirely.

## 2. Dirty Configuration Discovery & Query Optimization

### Context & Challenge
The scanner must identify all User Groups and Roles across all active tenants where changes were made but not synchronized (`version <> projection_version`).

### Decision
- Execute an indexed sweep query:
  ```sql
  SELECT tenant_code, 'USER_GROUP' AS source_type, id AS source_id, version
  FROM user_groups
  WHERE version <> projection_version AND deleted_at IS NULL;
  ```
  *(Along with a defensive query for `roles` where `version <> projection_version`.)*
- Group discovered records by `tenant_code` to process tenant batches independently with proper tenant boundary isolation.
- Delegate each dirty entity to `AuthorizationSyncService.enqueueSyncJob(...)` with `triggerType = SyncTriggerType.SCHEDULED` and `createdBy = 'SYSTEM'`.

## 3. Coexistence with Manual "Sync Now" & Concurrent Mutations

### Context & Challenge
- An administrator may click "Sync Now" right as the scheduled sweep begins.
- An administrator may edit a User Group while a scheduled job is in the middle of processing.

### Decision
- **In-flight Deduplication**:
  `AuthorizationSyncService.enqueueSyncJob` checks if a job is already in `PENDING` or `PROCESSING` for `(tenant_code, source_type, source_id, source_version)` and catches PostgreSQL unique violation error `23505` (`uq_authz_sync_jobs_in_flight`), treating it as a graceful no-op.
- **Concurrent Mutation Semantics**:
  The worker updates `projection_version = :sourceVersion` (the version recorded on the job). If the configuration was edited to `version = 6` while the job for `source_version = 5` was running, the worker sets `projection_version = 5`. The entity remains dirty (`6 > 5`) and will be picked up on the subsequent scheduled cycle or next manual sync.

## 4. Reusing Shared Worker & Watchdog Engine (ADR-A14)

### Context & Challenge
Ensuring scheduled jobs follow the exact same evaluation rules, batch sizes, cache invalidations, and crash recovery semantics as manual syncs without introducing code divergence.

### Decision
- `trigger_type` (`SCHEDULED` vs `MANUAL`) is purely metadata on `authorization_sync_jobs`.
- `AuthorizationReconciliationWorker` polls jobs using `SELECT ... FOR UPDATE SKIP LOCKED` agnostic of trigger type.
- `SyncJobWatchdogService` detects stalled jobs in `PROCESSING` past 10 minutes and re-enqueues or fails them regardless of trigger type.
- `SecurityEventModule` appends `authorization.sync-requested`, `authorization.sync-completed`, and `authorization.sync-failed` events to the outbox with `triggerType = 'SCHEDULED'`.

## 5. Telemetry & Observability Architecture

### Context & Challenge
Monitoring scheduler execution health, contention, and throughput without unbounded Prometheus metric label dimensions.

### Decision
- Expose Prometheus metrics:
  - `authz_scheduled_reconciliation_sweep_duration_seconds` (Histogram)
  - `authz_scheduled_reconciliation_dirty_entities_discovered_total` (Counter, labeled by `source_type`)
  - `authz_scheduled_reconciliation_tenants_scanned_total` (Counter)
  - `authz_scheduled_reconciliation_lock_acquisitions_total` (Counter, labeled by `status: [acquired, contended_skipped, failed]`)
- Emit structured JSON log summarizing each sweep execution: duration, tenants scanned, dirty entities found, and jobs enqueued.

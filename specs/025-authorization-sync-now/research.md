# Research & Technical Decisions: Authorization Sync Now

**Feature**: `025-authorization-sync-now`
**Status**: Completed

## 1. Concurrency Control & Idempotency Model

### Context & Challenge
When administrators click "Sync Now" rapidly or when scheduled reconciliation runs concurrently with manual sync requests for the same entity and version, duplicate executions must be prevented without failing valid requests.

### Decision
- **Partial Unique Index in PostgreSQL**:
  `CREATE UNIQUE INDEX uq_authz_sync_jobs_in_flight ON authorization_sync_jobs (tenant_code, source_type, source_id, source_version) WHERE status IN ('PENDING', 'PROCESSING');`
- **Database-Enforced Idempotency & Error Handling**:
  When inserting a new sync job inside `AuthorizationSyncService.requestSyncNow()`:
  - Check if target entity's `version == projection_version` (if so, return existing status or immediate no-op).
  - If dirty (`version > projection_version`), attempt inserting `authorization_sync_jobs` with status `PENDING` along with the `authorization.sync-requested` outbox event in the same transaction.
  - If a PostgreSQL Unique Violation (`23505`) occurs, catch it and fetch/return the existing in-flight job record.
- **Alternatives Considered**:
  - *Distributed Redis Locks (`Redlock`)*: Rejected because Redis locks do not provide transactional atomicity with the database outbox and job persistence.
  - *Table-level locks (`pg_advisory_lock`)*: Unnecessary operational overhead compared to declarative partial unique constraints.

## 2. Shared Rebuild & Projection Engine (ADR-A14)

### Context & Challenge
Both manual Sync Now and scheduled reconciliation must recalculate dynamic group memberships, employee effective roles, and cache invalidation identically to avoid logic drift.

### Decision
- Use the modular service pattern:
  - `UserGroupMatchingService` computes dynamic rule matching against employee demographic attributes.
  - `EffectiveRoleProjectionService` syncs `user_effective_roles` projections and refreshes Redis authorization caches.
  - `AuthorizationReconciliationWorker` acts as the job executor for both manual and scheduled batches. It claims jobs via `SELECT ... FOR UPDATE SKIP LOCKED`, runs the recalculation in bounded batches (default 500 users), updates `processed_users` / `total_users`, and upon completion sets `projection_version = source_version` on the source `user_groups` / `roles` entity.

## 3. Worker Crash Recovery & Watchdog Architecture

### Context & Challenge
If an application node crashes or is terminated mid-job, jobs in `PROCESSING` status could become permanently stuck without a recovery mechanism.

### Decision
- **`SyncJobWatchdogService`**:
  A scheduled cron task running at fixed intervals (e.g. every 2 minutes) queries `authorization_sync_jobs` where `status = 'PROCESSING'` and `updated_at < NOW() - INTERVAL '10 minutes'`.
- **Recovery Strategy**:
  - Increments a retry/recovery count.
  - If attempts are below threshold (e.g. max 3 retries), resets status back to `PENDING` for re-claiming.
  - If exceeded threshold, marks status as `FAILED` with `error_details` indicating watchdog timeout and emits an `authorization.sync-failed` outbox event.

## 4. Transactional Outbox & Notification Integration

### Context & Challenge
Sync operations must trigger downstream notifications (`hros-notification-service`) and audit trails (`SecurityEventModule`) reliably without distributed transactions or direct Kafka calls inside HTTP/worker request threads.

### Decision
- **Outbox Persistence**:
  Sync lifecycle events (`authorization.sync-requested`, `authorization.sync-completed`, `authorization.sync-failed`) are written to `auth_security_events_outbox` in the same database transaction that updates job status or source entity projection versions.
- **Payload Schema**:
  Contains `tenant_code`, `source_type`, `source_id`, `source_version`, `job_id`, `trigger_type`, `status`, `processed_users`, `total_users`, `initiated_by`, `error_details`, and `timestamp`.

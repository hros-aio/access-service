# Data Model: Scheduled Authorization Reconciliation

**Feature**: `026-scheduled-authz-reconciliation`
**Status**: Completed

## 1. Entity Model & Schema Reuse

This feature requires **zero new database schema migrations**. It reuses the persistence schema, indexes, and enums established by Manual Force Sync (`025-authorization-sync-now` / `FEAT-AUTHZ-11`).

### Reused Entities

```
┌────────────────────────────────────────────────────────┐
│               authorization_sync_jobs                  │
├────────────────────────────────────────────────────────┤
│ id: UUID (PK)                                          │
│ tenant_code: VARCHAR(50)                               │
│ source_type: ENUM ('USER_GROUP', 'ROLE')               │
│ source_id: UUID                                        │
│ source_version: INTEGER                                │
│ trigger_type: ENUM ('MANUAL', 'SCHEDULED', 'SYSTEM')   │  <-- 'SCHEDULED'
│ status: ENUM ('PENDING', 'PROCESSING', 'COMPLETED',    │
│              'FAILED')                                 │
│ total_users: INTEGER                                   │
│ processed_users: INTEGER                               │
│ error_details: JSONB                                   │
│ started_at: TIMESTAMPTZ                                │
│ completed_at: TIMESTAMPTZ                              │
│ created_by: VARCHAR(100)                               │  <-- 'SYSTEM'
│ created_at: TIMESTAMPTZ                                │
│ updated_at: TIMESTAMPTZ                                │
└────────────────────────────────────────────────────────┘
                       ▲
                       │
       ┌───────────────┴───────────────┐
       │                               │
┌──────────────┐              ┌───────────────────┐
│ user_groups  │              │       roles       │
├──────────────┤              ├───────────────────┤
│ id: UUID     │              │ id: UUID          │
│ version: INT │              │ version: INT      │
│ proj_ver: INT│              │ proj_ver: INT     │
└──────────────┘              └───────────────────┘
```

### Database Constraints & Indexes (Reused)

- **`uq_authz_sync_jobs_in_flight`**:
  ```sql
  CREATE UNIQUE INDEX uq_authz_sync_jobs_in_flight
  ON authorization_sync_jobs (tenant_code, source_type, source_id, source_version)
  WHERE status IN ('PENDING', 'PROCESSING');
  ```
- **`idx_authz_sync_jobs_poll`**:
  ```sql
  CREATE INDEX idx_authz_sync_jobs_poll
  ON authorization_sync_jobs (status, created_at)
  WHERE status = 'PENDING';
  ```

---

## 2. Synchronization Lifecycle & State Machine

```
[ Scheduled Scanner Fires ]
            │
            ▼
[ Acquire Distributed Lock ]
  ├── Lock Not Acquired ──> [ Skip Cycle (Contention No-op) ]
  └── Lock Acquired
            │
            ▼
[ Query Dirty Entities (version <> projection_version) ]
            │
            ├── No Dirty Entities ──> [ Release Lock & Complete ]
            │
            ▼
[ For Each Dirty Entity in Tenant Batches ]
            │
            ▼
[ enqueueSyncJob(...) under SYSTEM context ]
            │
            ├── In-flight job exists ──> [ uq constraint collision -> Graceful No-op ]
            │
            ▼
[ Job Inserted: status='PENDING', trigger_type='SCHEDULED', created_by='SYSTEM' ]
[ Outbox Event Appended: 'authorization.sync-requested' ]
            │
            ▼
[ Shared Reconciliation Worker Polls (SELECT ... FOR UPDATE SKIP LOCKED) ]
            │
            ▼
[ status -> 'PROCESSING', started_at = NOW() ]
            │
            ▼
[ Recompute Population & Update user_effective_roles / memberships in Batches ]
            │
            ├── Success ──> [ Set projection_version = source_version ]
            │               [ status -> 'COMPLETED', completed_at = NOW() ]
            │               [ Outbox: 'authorization.sync-completed' ]
            │
            └── Error   ──> [ status -> 'FAILED', error_details = {...} ]
                            [ Outbox: 'authorization.sync-failed' ]
```

---

## 3. Distributed Locking Model

### Advisory Lock Identifier
- **Namespace**: `authz_reconciliation_scanner`
- **Lock Key (64-bit int)**: Hash value derived from string token `authz:scheduled_reconciliation:scanner` (e.g., `4819284918237192`).
- **Acquire Command**: `SELECT pg_try_advisory_lock(4819284918237192);`
- **Release Command**: `SELECT pg_advisory_unlock(4819284918237192);`

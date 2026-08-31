# Data Model: Synchronization Status Visibility & Outcome Notifications

## 1. Entities & Projections

### 1.1 Synchronization Status Projection (`SyncStatusResponseDto`)
Virtual, read-only projection DTO representing the calculated synchronization health of an authorization entity.

| Field | Type | Description |
|---|---|---|
| `sourceType` | `SyncSourceType` (`USER_GROUP` \| `ROLE`) | Entity type being evaluated |
| `sourceId` | `string` (UUID) | Unique identifier of the entity |
| `status` | `SyncComputedStatus` (`PENDING` \| `PROCESSING` \| `COMPLETED` \| `FAILED`) | Composite calculated status |
| `lastSuccessfulSyncAt` | `string` (ISO 8601, nullable) | Timestamp of latest `COMPLETED` sync job |
| `affectedUserCount` | `number` | Total users impacted or processed |
| `nextExpectedSyncMethod` | `NextExpectedSyncMethod` (`MANUAL_IN_FLIGHT` \| `SCHEDULED_DAILY` \| `NONE`) | Next synchronization trigger expectation |
| `activeJob` | `ActiveJobDetailDto` (nullable) | Real-time progress and details if job is currently active or failed |

#### `ActiveJobDetailDto`
| Field | Type | Description |
|---|---|---|
| `jobId` | `string` (UUID) | ID of the active/latest sync job |
| `triggerType` | `SyncTriggerType` (`MANUAL` \| `SCHEDULED` \| `SYSTEM`) | Trigger mechanism of the job |
| `progress` | `{ processed: number; total: number }` | Real-time user reconciliation counters |
| `error` | `{ code: string; message: string }` (nullable) | Sanitized error details if job is `FAILED` |
| `retryable` | `boolean` | Flag indicating whether manual retry can be invoked |

---

### 1.2 Tenant Synchronization Summary (`SyncStatusSummaryResponseDto`)
Aggregated snapshot of synchronization states across all authorization entities within a tenant.

| Field | Type | Description |
|---|---|---|
| `tenantCode` | `string` | Tenant identifier |
| `totalEntities` | `number` | Total count of Roles + User Groups in tenant |
| `completed` | `number` | Count of entities in `COMPLETED` state |
| `pending` | `number` | Count of entities in `PENDING` state |
| `processing` | `number` | Count of entities in `PROCESSING` state |
| `failed` | `number` | Count of entities in `FAILED` state |
| `evaluatedAt` | `string` (ISO 8601) | Timestamp of summary computation |

---

### 1.3 Authorization Sync Job Entity (`authorization_sync_jobs` Table)
Existing persisted table, leveraged for status lookups, retry orchestration, and historical progress.

| Column | Type | Nullable | Constraints / Index | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | PK | Unique job identifier |
| `tenant_code` | `varchar(64)` | NO | Indexed | Multi-tenant partition key |
| `source_type` | `varchar(32)` | NO | Indexed | `USER_GROUP` or `ROLE` |
| `source_id` | `uuid` | NO | Indexed | Target entity ID |
| `source_version` | `int` | NO | | Version of configuration being applied |
| `trigger_type` | `varchar(32)` | NO | Default `'MANUAL'` | `MANUAL`, `SCHEDULED`, `SYSTEM` |
| `status` | `varchar(32)` | NO | Default `'PENDING'` | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` |
| `total_users` | `int` | YES | | Total user count in scope |
| `processed_users` | `int` | NO | Default `0` | Users processed so far |
| `retry_count` | `int` | NO | Default `0` | Watchdog/worker retry count |
| `error_details` | `jsonb` | YES | | Sanitized error object (code, message) |
| `started_at` | `timestamptz` | YES | | Execution start timestamp |
| `completed_at` | `timestamptz` | YES | | Completion/failure timestamp |
| `created_by` | `varchar(128)` | YES | | User ID or `'SYSTEM'` |
| `created_at` | `timestamptz` | NO | Indexed | Enqueue timestamp |
| `updated_at` | `timestamptz` | NO | | Record update timestamp |

**Indexes**:
- `idx_authz_sync_jobs_source_latest`: `(tenant_code, source_type, source_id, created_at DESC)`
- `uq_authz_sync_jobs_in_flight`: Partial Unique on `(tenant_code, source_type, source_id, source_version)` WHERE `status IN ('PENDING', 'PROCESSING')`

---

## 2. Event Payload Contracts

### 2.1 Enriched `authorization.sync-completed` Outbox Payload
```typescript
interface AuthorizationSyncCompletedPayload {
  jobId: string;
  tenantCode: string;
  sourceType: 'USER_GROUP' | 'ROLE';
  sourceId: string;
  sourceVersion: number;
  triggerType: 'MANUAL' | 'SCHEDULED' | 'SYSTEM';
  totalUsers: number;
  affectedUsers: number;
  durationMs: number;
  isHighImpact: boolean;
  isLongRunning: boolean;
  requiresEmailNotification: boolean;
  initiatedBy: string;
  timestamp: string; // ISO 8601
}
```

### 2.2 Enriched `authorization.sync-failed` Outbox Payload
```typescript
interface AuthorizationSyncFailedPayload {
  jobId: string;
  tenantCode: string;
  sourceType: 'USER_GROUP' | 'ROLE';
  sourceId: string;
  sourceVersion: number;
  triggerType: 'MANUAL' | 'SCHEDULED' | 'SYSTEM';
  totalUsers: number;
  processedUsers: number;
  durationMs: number;
  errorCode: string;
  errorMessage: string; // Sanitized, no stack traces or secrets
  requiresEmailNotification: true;
  initiatedBy: string;
  timestamp: string; // ISO 8601
}
```

---

## 3. State Transition Model

```
 ┌─────────────────────────────────────────────────────────┐
 │               Configuration Modified                   │
 │           (version > projection_version)                │
 └───────────────────────────┬─────────────────────────────┘
                             │
                             ▼
 ┌─────────────────────────────────────────────────────────┐
 │                        PENDING                          │
 │      (nextExpectedSyncMethod: SCHEDULED_DAILY)          │
 └───────────────────────────┬─────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            │ Trigger Sync                    │ Scheduled Sweep
            │ (MANUAL)                        │ (SCHEDULED)
            ▼                                 ▼
 ┌─────────────────────────────────────────────────────────┐
 │                       PROCESSING                        │
 │       (nextExpectedSyncMethod: MANUAL_IN_FLIGHT)        │
 └───────────────────────────┬─────────────────────────────┘
                             │
             ┌───────────────┴───────────────┐
             │ Reconciliation                │ Error
             │ Success                       │ Encountered
             ▼                               ▼
 ┌───────────────────────┐       ┌───────────────────────┐
 │       COMPLETED       │       │        FAILED         │
 │ (version == projection│       │ (Sanitized error msg, │
 │  next: NONE)          │       │  retryable: true)     │
 └───────────────────────┘       └───────────┬───────────┘
                                             │
                                             │ POST /retry
                                             ▼
                                 [Re-enqueues PENDING Job]
```

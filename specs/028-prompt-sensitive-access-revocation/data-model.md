# Data Model: Prompt Revocation of Sensitive Access

## Schema Updates

### 1. `authorization_sync_jobs` Table Extension

```sql
CREATE TYPE authorization_sync_priority_enum AS ENUM ('URGENT', 'STANDARD', 'SCHEDULED');

ALTER TABLE authorization_sync_jobs 
ADD COLUMN IF NOT EXISTS priority authorization_sync_priority_enum NOT NULL DEFAULT 'STANDARD';

CREATE INDEX IF NOT EXISTS idx_authz_sync_jobs_priority_claim 
ON authorization_sync_jobs (status, priority DESC, created_at ASC) 
WHERE status = 'PENDING';
```

### Entity Definition: `AuthorizationSyncJob`

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `UUID` | No | Primary Key |
| `tenant_id` | `VARCHAR(64)` | No | Multi-tenant isolation scope |
| `source_type` | `ENUM('USER_GROUP', 'ROLE', 'TENANT')` | No | Target entity type |
| `source_id` | `VARCHAR(64)` | No | Target entity ID |
| `trigger_type` | `ENUM('MANUAL', 'SCHEDULED', 'MEMBERSHIP_CHANGE', 'ROLE_REVOCATION')` | No | Trigger source |
| `priority` | `ENUM('URGENT', 'STANDARD', 'SCHEDULED')` | No | Priority level for worker job claiming |
| `status` | `ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')` | No | Current lifecycle state |
| `retry_count` | `INTEGER` | No | Number of retries executed (default 0) |
| `max_retries` | `INTEGER` | No | Maximum retry attempts (default 3) |
| `affected_users` | `INTEGER` | Yes | Count of users evaluated/updated |
| `error_code` | `VARCHAR(64)` | Yes | Sanitized error code if failed |
| `error_reason` | `TEXT` | Yes | High-level business failure reason |
| `started_at` | `TIMESTAMPTZ` | Yes | Job execution start timestamp |
| `completed_at` | `TIMESTAMPTZ` | Yes | Job execution completion timestamp |
| `created_at` | `TIMESTAMPTZ` | No | Job enqueue timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | Record update timestamp |

---

### 2. Runtime Caching Schema (Redis)

#### Role Capability Key: `authz:role:{tenant}:{roleId}`
- **Type**: String (JSON) / Hash
- **Payload**:
  ```json
  {
    "roleId": "role_sec_admin",
    "version": 4,
    "permissions": [
      "users.read",
      "roles.read"
    ],
    "updatedAt": 1756720800000
  }
  ```
- **TTL**: 86400 seconds (with active overwrite/invalidation on write).

#### User Effective Roles Key: `authz:user:{tenant}:{userId}`
- **Type**: String (JSON) / Hash
- **Payload**:
  ```json
  {
    "userId": "usr_10293",
    "version": 7,
    "directRoles": ["role_employee"],
    "groupRoles": ["role_dept_lead"],
    "effectiveRoles": ["role_employee", "role_dept_lead"],
    "effectivePermissions": ["profile.read", "team.read", "leave.approve"],
    "updatedAt": 1756720805000
  }
  ```
- **TTL**: 86400 seconds (updated promptly upon worker completion).

---

### 3. Outbox Security Event: `auth_security_events_outbox`

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `UUID` | No | Primary Key |
| `tenant_id` | `VARCHAR(64)` | No | Tenant identifier |
| `event_type` | `VARCHAR(128)` | No | e.g., `role.permissions-updated`, `authorization.sync-failed` |
| `urgency` | `VARCHAR(32)` | No | `CRITICAL` or `STANDARD` |
| `payload` | `JSONB` | No | Immutable structured payload (zero PII, zero secrets) |
| `status` | `VARCHAR(32)` | No | `PENDING`, `PUBLISHED`, `FAILED` |
| `created_at` | `TIMESTAMPTZ` | No | Enqueue timestamp |

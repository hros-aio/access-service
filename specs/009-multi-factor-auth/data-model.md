# Data Model: Multi-Factor Authentication (MFA)

## Entities & Database Schemas

### 1. `mfa_methods` Table

Stores registered user authentication factors.

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `UUID` | Primary Key, `DEFAULT gen_random_uuid()` | Unique factor identifier |
| `tenant_code` | `VARCHAR(64)` | NOT NULL | Tenant boundary code |
| `user_id` | `UUID` | NOT NULL, Foreign Key -> `users(id)` | Associated user |
| `factor_type` | `VARCHAR(32)` | NOT NULL (`'totp'`, `'email'`) | Factor type |
| `status` | `VARCHAR(32)` | NOT NULL (`'pending'`, `'active'`, `'disabled'`) | Factor lifecycle status |
| `encrypted_secret` | `TEXT` | NULLABLE | KMS Envelope-encrypted TOTP secret |
| `is_primary` | `BOOLEAN` | NOT NULL, `DEFAULT FALSE` | Indicates primary MFA factor |
| `last_used_at` | `TIMESTAMPTZ` | NULLABLE | Timestamp of last successful challenge |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, `DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, `DEFAULT NOW()` | Record update timestamp |

**Indexes & Constraints**:
- `uq_mfa_methods_one_primary_per_user`: Partial Unique Index `(tenant_code, user_id)` WHERE `is_primary = TRUE AND status = 'active'`

---

### 2. `auth_security_events_outbox` Table Update (Migration BE-001)

Outbox table for security events retry tracking.

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `UUID` | Primary Key | Event ID |
| `tenant_code` | `VARCHAR(64)` | NOT NULL | Tenant code |
| `user_id` | `UUID` | NOT NULL | Target user ID |
| `event_type` | `VARCHAR(128)` | NOT NULL | Event name (e.g. `authentication.mfa-enrolled`, `authentication.mfa-reset`) |
| `sanitized_payload` | `JSONB` | NOT NULL | Event payload |
| `publish_status` | `VARCHAR(32)` | NOT NULL (`'pending'`, `'published'`, `'failed'`) | Relay state |
| `attempt_count` | `INT` | NOT NULL, `DEFAULT 0` | Retry counter |
| `last_attempted_at` | `TIMESTAMPTZ` | NULLABLE | Last retry timestamp |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, `DEFAULT NOW()` | Creation timestamp |

---

## Cache & In-Memory Data Models (Redis)

### 1. MFA Challenge Hash
Key pattern: `auth:mfa-challenge:{tenantCode}:{userId}:{challengeId}`
- **TTL**: 300 seconds (5 minutes)
- **Structure**:
  ```json
  {
    "challengeId": "string (uuid)",
    "tenantCode": "string",
    "userId": "string (uuid)",
    "factorType": "totp | email",
    "codeHash": "string (hashed verification code)",
    "attemptsLeft": 5
  }
  ```

### 2. User Sessions Set & Hash Revocation
Key patterns:
- `auth:user-sessions:{tenantCode}:{userId}` (Set of session IDs)
- `auth:session:{sessionId}` (Session data hash)
- **Admin Reset Action**: All session IDs listed in `auth:user-sessions:...` are deleted alongside clearing the Set itself.

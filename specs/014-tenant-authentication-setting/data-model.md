# Data Model & Schema Design: Tenant Authentication Settings

## 1. Entities

### `AuthenticationSettings` Entity
Database Table: `authentication_settings`

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| `tenant_code` | `VARCHAR(64)` | `PRIMARY KEY` | Unique identifier for tenant scope |
| `mfa_required` | `BOOLEAN` | `NOT NULL, DEFAULT false` | Whether MFA is strictly required |
| `self_service_password_reset_enabled` | `BOOLEAN` | `NOT NULL, DEFAULT true` | Whether self-service password reset is permitted |
| `lockout_enabled` | `BOOLEAN` | `NOT NULL, DEFAULT true` | Whether account lockout is active |
| `lockout_threshold` | `INTEGER` | `NOT NULL, DEFAULT 5` | Max failed login attempts before lockout |
| `ip_restriction_enabled` | `BOOLEAN` | `NOT NULL, DEFAULT false` | Whether login IP allow-list filtering is active |
| `ip_allow_list` | `TEXT[]` / `JSONB` | `NOT NULL, DEFAULT '[]'` | Array of allowed IPv4/IPv6 CIDR ranges |
| `version` | `INTEGER` | `NOT NULL, DEFAULT 1` | Optimistic locking counter |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` | Timestamp of last update |

### `AuthSecurityEventsOutbox` Entity
Database Table: `auth_security_events_outbox`

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Unique outbox event identifier |
| `tenant_code` | `VARCHAR(64)` | `NOT NULL, INDEX` | Tenant scope |
| `event_type` | `VARCHAR(128)` | `NOT NULL` | Value: `'authentication.settings-updated'` |
| `sanitized_payload` | `JSONB` | `NOT NULL` | Event payload containing diff and metadata |
| `status` | `VARCHAR(32)` | `NOT NULL, DEFAULT 'pending', INDEX` | Outbox status (`pending`, `published`, `failed`) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` | Outbox entry creation time |

---

## 2. Validation & State Transition Rules

- **IP Allow-List Check**: If `ip_restriction_enabled == true`, `ip_allow_list` array MUST NOT be empty.
- **Lockout Threshold Check**: `lockout_threshold` MUST be an integer $> 0$.
- **Optimistic Locking**: Every update increments `version` by 1. Update fails if current DB version does not match expected version.

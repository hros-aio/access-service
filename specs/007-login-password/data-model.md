# Data Model & Storage Design: Log In With Email and Password

## Relational Tables (PostgreSQL)

### 1. `users` (Existing)
Represents the user identity and account status.
- `id`: `UUID` (Primary Key)
- `tenant_code`: `VARCHAR(16)` (Composite unique constraint with normalized_email, multi-tenant scope)
- `normalized_email`: `VARCHAR(255)` (The lower-cased email address used for login identity)
- `display_email`: `VARCHAR(255)` (The display email address)
- `status`: `VARCHAR(20)` (Enum: `'ACTIVE'`, `'SUSPENDED'`, `'LOCKED'`, `'PENDING'`)
- `security_version`: `INT` (Incremented on password change, lockout, or security state reset to invalidate old JWTs)
- `updated_at`: `TIMESTAMP`

### 2. `credentials` (Existing)
Stores credentials linked to a user.
- `id`: `UUID` (Primary Key)
- `tenant_code`: `VARCHAR(50)` (Multi-tenant partition)
- `user_id`: `UUID` (Foreign Key -> `users(id)`)
- `type`: `VARCHAR(20)` (e.g., `'password'`)
- `password_hash`: `VARCHAR(255)` (Argon2id password hash)
- `algorithm`: `VARCHAR(50)` (e.g., `'argon2id'`)
- `status`: `VARCHAR(20)` (Enum: `'active'`, `'revoked'`)
- `created_at`: `TIMESTAMP`
- `updated_at`: `TIMESTAMP`

### 3. `authentication_settings` (Existing)
Holds security policies for each tenant.
- `tenant_code`: `VARCHAR(50)` (Primary Key)
- `lockout_enabled`: `BOOLEAN`
- `lockout_threshold`: `INT` (Account locks when consecutive failures count >= this value)
- `ip_restriction_enabled`: `BOOLEAN`
- `allowed_ip_ranges`: `VARCHAR[]` (Array of CIDR formatted IP subnets)
- `mandatory_mfa_enabled`: `BOOLEAN`

### 4. `auth_security_events_outbox` (Existing)
Transactional outbox containing security and auditing events to publish.
- `id`: `UUID` (Primary Key)
- `tenant_code`: `VARCHAR(50)`
- `aggregate_type`: `VARCHAR(50)` (`'User'`)
- `aggregate_id`: `VARCHAR(255)` (`userId`)
- `event_type`: `VARCHAR(100)` (e.g., `'authentication.login-succeeded'`)
- `payload`: `JSONB` (Sanitized audit details)
- `publish_status`: `VARCHAR(20)` (Enum: `'pending'`, `'published'`, `'failed'`)
- `created_at`: `TIMESTAMP`

---

## NoSQL / Cache Keys (Redis)

## User Session Store
- **Key Pattern**: `auth:session:{sessionId}`
- **Type**: `Hash`
- **Fields**:
  - `userId`: UUID
  - `tenantCode`: String
  - `userType`: String
  - `securityVersion`: Integer
  - `authState`: `'AUTHENTICATED'`
- **TTL**: 15 minutes sliding window, or 30 days absolute cap if `rememberMe` is true.

## User Active Sessions Tracker
- **Key Pattern**: `auth:user-sessions:{tenantCode}:{userId}`
- **Type**: `Sorted Set (ZSET)`
- **Score**: Expiration timestamp (epoch milliseconds) of the session.
- **Value**: `sessionId`.
- **TTL**: Expiry matching maximum session TTL (30 days). Old/expired members are explicitly removed using ZREMRANGEBYSCORE before querying or adding members to track active sessions independently.

### 3. MFA Challenge Store
- **Key Pattern**: `auth:mfa-challenge:{challengeId}`
- **Type**: `Hash`
- **Fields**:
  - `userId`: UUID
  - `tenantCode`: String
  - `authState`: `'MFA_REQUIRED'`
- **TTL**: 5 minutes (strict expiry).

### 4. Login Failure Counter
- **Key Pattern**: `auth:login-failure:{tenantCode}:{userId}`
- **Type**: `String` (Integer counter)
- **TTL**: 15 minutes rolling expiry.

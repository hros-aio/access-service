# Data Model Specification

## 1. Relational Database Mapping (PostgreSQL)

### Table: `users`
Existing mapping representing the User aggregate.
- `id` (UUID, Primary Key)
- `tenant_code` (VARCHAR(50), Not Null)
- `employee_ref_id` (UUID, Nullable, Unique)
- `normalized_email` (VARCHAR(320), Not Null)
- `display_email` (VARCHAR(320), Not Null)
- `user_type` (VARCHAR(30), Not Null)
- `status` (VARCHAR(30), Not Null) - Status transitions: `INVITED` -> `ACTIVE` upon accepting invitation.
- `credential_status` (VARCHAR(30), Not Null)
- `security_version` (INTEGER, Not Null, Default 1) - Incremented upon key security updates (like password set/change).
- `protected_root_admin` (BOOLEAN, Not Null, Default False)

### Table: `invitations`
Existing mapping for user onboarding links.
- `id` (UUID, Primary Key)
- `user_id` (UUID, Not Null, Foreign Key to `users.id`)
- `token_hash` (TEXT, Not Null, Unique) - SHA-256 hash of the 32-byte hex token.
- `status` (VARCHAR(30), Not Null) - Values: `pending`, `sent`, `accepted`, `revoked`.
- `version` (INTEGER, Not Null, Default 1) - Incremented on every resend attempt.
- `expires_at` (TIMESTAMPTZ, Not Null) - 24 hours from generation.
- `issued_by` (UUID, Nullable, Foreign Key to `users.id`)
- `sent_at` (TIMESTAMPTZ, Nullable)
- `accepted_at` (TIMESTAMPTZ, Nullable)
- `revoked_at` (TIMESTAMPTZ, Nullable)

### Table: `credentials`
Existing mapping for login secrets.
- `id` (UUID, Primary Key)
- `user_id` (UUID, Not Null, Foreign Key to `users.id`)
- `password_hash` (TEXT, Not Null) - Argon2id password hash.
- `algorithm` (VARCHAR(50), Not Null) - `argon2id`.
- `status` (VARCHAR(30), Not Null) - `active`.
- `password_changed_at` (TIMESTAMPTZ, Nullable)

### Table: `auth_security_events_outbox`
Existing mapping for transactional auditing and event dispatching.
- `id` (UUID, Primary Key)
- `tenant_code` (VARCHAR(50), Not Null)
- `user_id` (UUID, Nullable, Foreign Key to `users.id`)
- `event_type` (VARCHAR(100), Not Null)
- `sanitized_payload` (JSONB, Not Null, Default '{}')
- `publish_status` (VARCHAR(30), Not Null, Default 'pending')
- `created_at` (TIMESTAMPTZ, Not Null, Default NOW())

## 2. Key Constraints & Database Backstops
- **uq_invitations_one_pending_per_user**: `CREATE UNIQUE INDEX uq_invitations_one_pending_per_user ON invitations (user_id) WHERE status IN ('pending', 'sent')`. Enforces that a user has at most one pending invitation at any time.
- **uq_credentials_one_active_per_user**: `CREATE UNIQUE INDEX uq_credentials_one_active_per_user ON credentials (user_id) WHERE status = 'active'`. Prevents duplicate active credentials per user.

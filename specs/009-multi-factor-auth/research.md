# Phase 0 Research: Multi-Factor Authentication (MFA)

## Research Summary

### 1. KMS Envelope Encryption Strategy for TOTP Secrets
- **Decision**: Use AES-256-GCM envelope encryption where a Master Key (KEK) encrypts data encryption keys (DEKs) which encrypt TOTP secrets.
- **Rationale**: Storing raw TOTP secrets in PostgreSQL is a severe security risk if the DB is compromised. Envelope encryption ensures that secrets are encrypted with dynamic DEKs, while KEK is securely managed via environment KMS providers (e.g. AWS KMS, Vault, or local AES-256 fallback in dev).
- **Alternatives Considered**: Direct DB symmetric encryption (rejected due to key rotation limitations and single key vulnerability).

### 2. Redis MFA Challenge & Rate-Limiting Protocol
- **Decision**: Store login challenges in Redis under `auth:mfa-challenge:{tenantCode}:{userId}:{challengeId}` as a Hash with fields `userId`, `tenantCode`, `factorType`, `codeHash`, `attemptsLeft`, and a 300-second TTL.
- **Rationale**: Provides fast, atomic, auto-expiring verification state with attempt counter decrementing via Redis operations.
- **Alternatives Considered**: In-memory Map in NestJS service (rejected due to stateless microservice horizontal scaling requirements).

### 3. PostgreSQL Transaction & Session Revocation Order during Admin Reset
- **Decision**: Atomically update DB (`mfa_methods` status to inactive/deleted, increment `users.security_version`, insert `auth_security_events_outbox` entry), then clear Redis keys `auth:session:{sessionId}` and `auth:user-sessions:{tenantCode}:{userId}`.
- **Rationale**: Guaranteed consistency between database security versioning and Redis session invalidation. Invalidation happens inside/immediately post DB transaction to ensure user access is revoked instantly.
- **Alternatives Considered**: Async message-driven session revocation (rejected because session revocation must take effect synchronously during the admin reset request).

### 4. Database Outbox Retries Migration
- **Decision**: Create TypeORM migration `1720000000000-AddOutboxRetryColumns.ts` adding `attempt_count INT DEFAULT 0` and `last_attempted_at TIMESTAMPTZ NULL` to `auth_security_events_outbox`.
- **Rationale**: Outbox relay workers require tracking attempt counts and last attempt timestamps to implement exponential backoff retry loops safely.

# Research Report: Password Reset Workflow (Self-Service & Admin-Initiated)

## Decision 1: Outbox Table Schema Enhancement & Migration
- **Decision**: Add `attempt_count` (`INT`, default `0`) and `last_attempted_at` (`TIMESTAMPTZ`, nullable) to `auth_security_events_outbox` table via a TypeORM migration in `src/database/migrations/1722500000000-AddOutboxRetryColumns.ts`.
- **Rationale**: Bounded retries for outbox relay require tracking attempt count and timestamp directly in the transaction boundary outbox table.
- **Alternatives Considered**: Storing retry state in Redis (rejected to maintain transaction atomicity with DB status updates).

## Decision 2: Atomic Verification Code State & Rate Limiting in Redis
- **Decision**: Implement `PasswordResetRedisAdapter` using `{tenantCode:userId}` cluster hash tags for keys `auth:password-reset:{challengeId}`. Use Lua script / Redis pipeline for atomic increment of failure attempts up to max 3.
- **Rationale**: Guarantees zero race conditions during rapid concurrent verification attempts and automatically expires state after 900 seconds (15 minutes).
- **Alternatives Considered**: Database-backed reset tokens (rejected due to unnecessary DB write traffic and storage cleanup overhead for short-lived OTP tokens).

## Decision 3: Anti-Enumeration & Constant-Time Response Policy
- **Decision**: `PasswordService.requestResetCode` returns `{ message: "If an active account exists, recovery instructions have been sent." }` regardless of whether the email/user exists or is active. If the user is missing/inactive, execute a dummy HMAC/Argon2 computation before returning.
- **Rationale**: Prevents timing attacks and account enumeration vulnerabilities.
- **Alternatives Considered**: Returning 404 for non-existent users (rejected due to OWASP security guidelines forbidding account enumeration).

## Decision 4: Global Session & Refresh Token Invalidation
- **Decision**: Upon password confirmation, `SessionService.revokeAllUserSessions(tenantCode, userId)` is invoked to purge all `auth:session:*` keys and invalidate refresh token family states in Redis, while incrementing `users.security_version`.
- **Rationale**: Guarantees all existing active JWT/session tokens become immediately unusable across all devices.
- **Alternatives Considered**: Invalidation upon next token expiration (rejected due to security compliance requiring immediate post-reset session termination).

# Quickstart Validation Guide: Multi-Factor Authentication (MFA)

## Prerequisites
- Node.js & npm installed
- PostgreSQL test database running locally or via Testcontainers
- Redis instance running locally or via Testcontainers

## Setup Commands
```bash
# Run database migrations (including outbox retry columns BE-001)
npm run typeorm migration:run

# Execute unit tests for MFA services and adapters
npm run test -- src/modules/mfa/

# Execute integration/E2E tests for MFA endpoints
npm run test:e2e -- test/mfa.e2e-spec.ts
```

## Scenario Validation Steps

### Scenario 1: Factor Enrollment & Activation
1. Perform restricted authentication as user `user-1`.
2. Post `POST /auth/mfa/enroll` with `factorType: "totp"`.
3. Submit verification code via `POST /auth/mfa/enroll/verify`.
4. Verify DB `mfa_methods` record has `status = 'active'` and `encrypted_secret` is populated using envelope encryption.
5. Verify `auth_security_events_outbox` contains an `authentication.mfa-enrolled` event.

### Scenario 2: Admin MFA Reset & Session Invalidation
1. Active user `user-1` has an active session in Redis.
2. Tenant administrator invokes `POST /admin/users/{user-1-id}/mfa/reset`.
3. Verify `mfa_methods` status for `user-1` is set to `disabled`.
4. Verify `users.security_version` is incremented.
5. Verify `auth:session:{sessionId}` for `user-1` is deleted from Redis.
6. Verify `auth_security_events_outbox` contains an `authentication.mfa-reset` event.

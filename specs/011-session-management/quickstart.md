# Quickstart & Verification Guide: Session Management & Logout Engine

**Feature Branch**: `011-session-management` | **Date**: 2026-08-04

## 1. Environment Setup & Prerequisites

Ensure the following tools and services are running locally before running verification:
- Node.js (v18+) & pnpm
- Docker / Testcontainers (PostgreSQL 15 & Redis 7 running)

```bash
# Start local containers if not using Testcontainers
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=auth_db postgres:15
docker run -d -p 6379:6379 redis:7-alpine
```

---

## 2. Test Execution Commands

### Unit Tests
Run unit tests for `SessionService` and `SessionController`:

```bash
pnpm test src/modules/session/tests/session.service.spec.ts
```

### Integration Tests
Run integration tests validating atomic Redis Lua script execution and PostgreSQL transaction management:

```bash
pnpm test:integration src/modules/session/tests/redis-session.adapter.spec.ts
```

### End-to-End (E2E) Verification
Run E2E HTTP pipeline tests covering `POST /auth/logout` and `POST /admin/users/:userId/force-logout`:

```bash
pnpm test:e2e src/modules/session/tests/session.e2e-spec.ts
```

---

## 3. End-to-End Manual Verification Scenarios

### Scenario A: Single Device Logout Verification

1. **Mint Session & Token**: Authenticate as User A and obtain Bearer JWT `JWT_A` and `sessionId_S1`.
2. **Execute Single Logout**:
   ```bash
   curl -X POST http://localhost:3000/auth/logout \
     -H "Authorization: Bearer JWT_A"
   ```
3. **Verify Outcomes**:
   - HTTP 200 OK returned: `{"success": true, "revokedSessionsCount": 1}`.
   - Redis key `auth:session:{S1}` is deleted.
   - `S1` is removed from Redis set `auth:user-sessions:{tenantCode}:{userId}`.
   - Row inserted into `auth_security_events_outbox` with `event_type = 'authentication.session-revoked'`.

### Scenario B: Admin Force Logout Verification

1. **Mint Active Sessions**: Create sessions `S1` and `S2` for target user `U2` in Tenant `TENANT_ACME`.
2. **Admin Force Logout Call**:
   ```bash
   curl -X POST http://localhost:3000/admin/users/U2/force-logout \
     -H "Authorization: Bearer ADMIN_JWT" \
     -H "Content-Type: application/json" \
     -d '{"reason": "SECURITY_AUDIT"}'
   ```
3. **Verify Outcomes**:
   - HTTP 200 OK returned.
   - Target user `security_version` incremented in `users` table.
   - All session keys (`S1`, `S2`) and index set deleted from Redis.
   - `authentication.sessions-revoked` event inserted in `auth_security_events_outbox`.
   - Subsequent calls using `JWT_A` or `JWT_B` fail token validation with 401 Unauthorized.

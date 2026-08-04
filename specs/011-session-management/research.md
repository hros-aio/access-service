# Research & Technical Decisions: Session Management & Logout Engine

**Feature Branch**: `011-session-management` | **Date**: 2026-08-04

## 1. Technical Decisions & Research Findings

### Decision 1: Session Store Operation Strategy (Redis Cluster Hash Tags & Lua Scripts)
- **Decision**: Use atomic Lua scripts executing on Redis session hash keys (`auth:session:{sessionId}`) and user session set index keys (`auth:user-sessions:{tenantCode}:{userId}`).
- **Rationale**: Single operations across multiple keys in Redis Cluster require hash tags `{tenantCode:userId}` to guarantee all keys map to the same hash slot. Atomic Lua script execution ensures session deletion and removal from the user session set happen without race conditions or orphan keys.
- **Alternatives Considered**: 
  - Non-scripted pipelines: Exposes potential inconsistency if `DEL` succeeds but `SREM` fails.
  - Secondary scanning: Scanning `auth:session:*` keys is $O(N)$ and forbidden in high-throughput production Redis instances.

### Decision 2: Immediate Multi-Node Token Invalidation Pipeline
- **Decision**: PostgreSQL `users.security_version` atomic increment combined with Redis session purge.
- **Rationale**: JWT authentication guards perform Step 14 token validation against the user's `securityVersion`. Incrementing `security_version` in PostgreSQL ensures that even if a JWT is unexpired, any token minted before the increment is immediately rejected by all application nodes upon DB/cache version check.
- **Alternatives Considered**:
  - Pure JWT Blacklisting in Redis: Requires storing individual blacklisted JWT IDs until expiration. High memory overhead compared to a single integer `security_version` increment on the user record.

### Decision 3: Single PostgreSQL Transaction for Security State and Outbox Events
- **Decision**: Execute user `security_version` increment and `auth_security_events_outbox` insertion within a single database transaction managed via TypeORM `EntityManager`.
- **Rationale**: Ensures strict transactional atomicity (SC-001). If the transaction rolls back, no outbox audit record is created and the security version remains unchanged. Redis purging occurs immediately after transaction commit.
- **Alternatives Considered**:
  - Direct Kafka event publishing before DB commit: Vulnerable to dual-write failures (event published but DB transaction fails).

### Decision 4: Idempotent Single Logout Handling
- **Decision**: `POST /auth/logout` returns HTTP 200 OK regardless of whether the session key existed in Redis prior to deletion.
- **Rationale**: Replayed or redundant logout requests should not throw errors or fail. Returning 200 OK idempotently matches RESTful standards and prevents client-side handling errors during concurrent logouts across browser tabs.

### Decision 5: Administrative Force Logout Scoping and Privacy
- **Decision**: Endpoint `POST /admin/users/:userId/force-logout` uses tenant isolation filter (`WHERE tenant_code = :tenantCode AND id = :targetUserId`). Non-existent users or users outside the admin's tenant return HTTP 404 Not Found.
- **Rationale**: Prevents cross-tenant administrative actions and prevents account enumeration attacks by refusing to distinguish between "user does not exist" and "user belongs to another tenant".

---

## 2. Technology & Architecture Choices

| Dimension | Selected Technology / Pattern | Justification |
|---|---|---|
| Framework | NestJS v10.x | Project standard, opinionated DI, Native TypeORM & Redis module support |
| Language | TypeScript 5.x (`strict: true`) | Enforces exact contract shapes and null-safety across transport and domain layers |
| Primary Database | PostgreSQL 15 | Relational ACID transaction guarantees for `users` and `auth_security_events_outbox` |
| Session Store | Redis (Cluster-compatible) | Fast key-value hash store with Lua script support and hash tagging |
| API Guards | `@UseGuards(JwtAuthGuard, RolesGuard)` | Standard `@hros/libs-apis` guards for JWT context extraction and RBAC permission checks |
| Transaction Management | TypeORM `EntityManager` | Wraps database queries and outbox inserts in explicit `READ COMMITTED` transactions |

---

## 3. Risk Assessment & Mitigations

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| Redis cluster slot mismatch during Lua execution | High (Redis error thrown) | Enforce hash tags `{tenantCode:userId}` on all key patterns to ensure single-slot mapping |
| Session store outage during logout operation | Medium (User unable to clear session) | Fail closed gracefully: catch connection errors, log audit failure, return HTTP 503 |
| Concurrent password reset and force logout | Medium (Race condition on `security_version`) | PostgreSQL row-level locks / atomic `security_version = security_version + 1` increment |

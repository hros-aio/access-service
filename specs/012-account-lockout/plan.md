# Implementation Plan: Account Lockout & Protection Mechanism

**User Spec**: [`specs/012-account-lockout/spec.md`](spec.md)
**Feature Directory**: [`specs/012-account-lockout`](./)
**Branch**: `012-account-lockout`

## Technical Context

- **Framework**: NestJS (v10+)
- **Language**: TypeScript (`strict: true`)
- **Database**: PostgreSQL (TypeORM, explicit transactions via `EntityManager`)
- **Cache**: Redis (`ioredis` cluster / standalone hash tags, atomic Lua scripts)
- **Messaging**: Kafka (via transactional outbox table `auth_security_events_outbox`)

## Constitution Check

- [x] **I. Clean Architecture & Layering**: Lockout domain encapsulated in `src/modules/lockout/` (`LockoutService` provider). Controllers handle transport, services handle business logic/transactions, repositories handle DB.
- [x] **II. Bounded Contexts**: Microservice schema ownership intact. Outbox pattern used for event publication to Kafka.
- [x] **III. Shared Library**: Uses `@hrms/libs-core` and `@hrms/libs-sql` abstractions.
- [x] **IV. Strict Type Safety**: No `any` types. Explicit return types on all methods.
- [x] **V. Quality Gates**: Unit & integration tests to guarantee 90%+ coverage.
- [x] **Security**: Asymmetric token validation intact, no timing enumeration side-channels for non-existent accounts, weaponized lockout protection for IP restrictions.

## Architecture & Design Artifacts

- **Research**: [`research.md`](research.md) - Decisions on Redis Lua scripts, DB transactions, constant-time dummy verifications, and separate IP failure tracking.
- **Data Model**: [`data-model.md`](data-model.md) - Schemas for Redis counters, DB status updates, and transactional outbox entries.
- **Contracts**: [`contracts/events.md`](contracts/events.md) - Event envelope contracts for `account-locked`, `sessions-revoked`, and `security-alert-requested`.
- **Quickstart**: [`quickstart.md`](quickstart.md) - Validation scenarios and execution guides.

## Implementation Phases & Deliverables

### Phase 0: Research & Foundation
- Complete architectural decisions in `research.md`.

### Phase 1: Lockout Infrastructure & Domain Logic (BE-001 & BE-002)
- Atomic Lua script for Redis failure counters with TTL (`src/modules/lockout/scripts/incr-counter.lua`).
- Redis lockout adapter (`src/modules/lockout/adapters/redis-lockout.adapter.ts`).
- `LockoutService` implementation for threshold evaluation, non-existent/inactive account bypass, and IP-restriction separation (`src/modules/lockout/services/lockout.service.ts`).

### Phase 2: Authentication Flow Integration (BE-003)
- Integrate `LockoutService` into `AuthenticationApplicationService`.
- Implement DB transactional account locking (`credential_status = 'locked'`, `security_version` bump).
- Revoke active Redis sessions upon lockout.
- Enqueue transactional outbox security events.

### Phase 3: Validation & Quality Verification
- Execute unit and E2E integration tests against PostgreSQL & Redis.
- Verify generic 401 response enforcement and constant-time dummy checks.

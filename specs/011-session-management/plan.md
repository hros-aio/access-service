# Implementation Plan: Session Management & Logout Engine

**Branch**: `011-session-management` | **Date**: 2026-08-04 | **Spec**: [`specs/011-session-management/spec.md`](file:///home/ren0503/new-hros/admin-module/auth-svc/specs/011-session-management/spec.md)

**Input**: Feature specification from `/specs/011-session-management/spec.md`

## Summary

Implement robust session invalidation mechanisms covering single-device logout (`POST /auth/logout`), cross-device logout during security updates / password changes, and administrator force-logout (`POST /admin/users/:userId/force-logout`). The solution uses PostgreSQL transactions to increment `users.security_version` and insert secret-free event payloads into `auth_security_events_outbox`, combined with atomic Redis Lua scripts (`DEL` & `SREM`) using `{tenantCode:userId}` cluster hash tags to purge session hashes and sets without race conditions or orphan keys.

## Technical Context

**Language/Version**: TypeScript 5.x (`strict: true`), Node.js 18+  
**Primary Dependencies**: NestJS v10.x, `@hros/libs-apis`, `@hros/libs-sql`, `@hros/libs-core`, TypeORM, ioredis / Redis  
**Storage**: PostgreSQL 15 (`users`, `auth_security_events_outbox`), Redis 7 (Session Hash & User Session Index Set)  
**Testing**: Jest (Unit), Testcontainers (Integration), Supertest (E2E)  
**Target Platform**: Linux Server (NestJS Microservice Container)  
**Project Type**: NestJS Web Service / Microservice (`hros-access-service`)  
**Performance Goals**: Session deletion execution < 15ms p95; immediate token invalidation on next request across all nodes.  
**Constraints**: Zero cross-tenant data leakage; zero secrets in audit/outbox payloads; atomic session cleanup in Redis Cluster.  
**Scale/Scope**: Multi-tenant Enterprise HRMS (scalable active session storage).  

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Clean Architecture & Layering**: PASS (`SessionController` [transport] -> `SessionService` [application] -> `UserRepositoryAdapter` / `RedisSessionAdapter` [infrastructure]).
- **Bounded Context & Schema Ownership**: PASS (Owns `users`, `auth_security_events_outbox`, and `auth:session:*` keys exclusively).
- **Shared Library First**: PASS (Uses `@hros/libs-apis` for guards/context, `@hros/libs-sql` for base types, `@hros/libs-core` for logging/cache).
- **Type Safety & Code Cleanliness**: PASS (`strict: true`, explicit return types on all service methods, DTO validation via class-validator).
- **Security & Data Protection**: PASS (Secret-free outbox event payloads, tenant isolation filters on all queries, HttpOnly/Secure session standards).

## Project Structure

### Documentation (this feature)

```text
specs/011-session-management/
├── plan.md              # Implementation plan
├── research.md          # Phase 0 technical decisions
├── data-model.md        # Entity definitions & Lua scripts
├── quickstart.md        # Verification scenarios
└── contracts/           # API and Event schema contracts
    ├── api-spec.yaml
    └── event-contracts.md
```

### Source Code (repository root)

```text
src/modules/session/
├── controllers/
│   └── session.controller.ts           # REST endpoints (/auth/logout, /admin/users/:userId/force-logout)
├── services/
│   └── session.service.ts              # Session orchestration & outbox event generation
├── adapters/
│   └── redis-session.adapter.ts        # Atomic Lua scripts for session hash & index deletion
├── dto/
│   ├── force-logout-request.dto.ts     # Input DTO with class-validator rules
│   └── logout-response.dto.ts          # Standardized response DTO
├── interfaces/
│   └── session.interface.ts            # Service contracts & data interfaces
└── tests/
    ├── session.service.spec.ts         # Unit tests
    ├── redis-session.adapter.spec.ts   # Redis Lua script integration tests
    └── session.e2e-spec.ts             # E2E controller tests
```

**Structure Decision**: Polyrepo NestJS domain module structure inside `src/modules/session/` following Clean Architecture and HRMS Backend Constitution guidelines.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*No violations. All architectural gates passed cleanly.*

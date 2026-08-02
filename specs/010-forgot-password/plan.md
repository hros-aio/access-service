# Implementation Plan: Forgot Password Workflow

**Branch**: `010-forgot-password` | **Date**: 2026-08-02 | **Spec**: [specs/010-forgot-password/spec.md](file:///home/ren0503/new-hros/admin-module/auth-svc/specs/010-forgot-password/spec.md)

**Input**: Feature specification from `/specs/010-forgot-password/spec.md`

## Summary

Implement self-service and administrator-initiated password reset workflows for `hrms-access-service`. The technical approach uses NestJS services orchestrating PostgreSQL atomic transactions (`READ COMMITTED` + `FOR UPDATE`) for credential updates, Argon2id hashing, user security version increments, transactional outbox record insertions, and Redis cluster-hash-tagged keys (`{tenantCode:userId}`) for rate-limited OTP challenge management and global session invalidation.

## Technical Context

**Language/Version**: TypeScript 5.3.3 / Node.js >=22  
**Primary Dependencies**: NestJS v10.3, TypeORM v0.3.17, Argon2 v0.45.1, ioredis v5.3.2, `@new-hros/libs-core`, `@new-hros/libs-sql`, `@new-hros/libs-apis`  
**Storage**: PostgreSQL (v15+) for credentials, users, settings, and outbox tables; Redis for reset challenges and session invalidation  
**Testing**: Jest v29.7, Supertest  
**Target Platform**: Linux server (Docker/Kubernetes containerized microservice)  
**Project Type**: NestJS Web Microservice (REST API + Kafka Outbox)  
**Performance Goals**: <100ms request latency p95 for request/verify/confirm endpoints; immediate global session invalidation  
**Constraints**: Zero user enumeration vulnerability (constant-time dummy operations); strict 3-attempt lockout per OTP challenge  
**Scale/Scope**: Multi-tenant HRMS authentication service  

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Clean Architecture & Layering**: Compliant (`PasswordController` -> `PasswordService` -> `PasswordResetRedisAdapter` / `UserRepository` / `CredentialRepository`).
- **Bounded Contexts & Bounded Databases**: Compliant (All changes contained within `hrms-access-service` private schema and Redis keyspace).
- **Shared Library-First**: Compliant (Uses `@new-hros/libs-core`, `@new-hros/libs-sql`, `@new-hros/libs-apis`).
- **Strict Type Safety**: Compliant (TypeScript `strict: true`, explicit return types, typed DTOs with `class-validator`).
- **Test-Driven Development**: Compliant (Unit & E2E tests covering service branches, transactions, and Redis Lua rate limiting).

## Project Structure

### Documentation (this feature)

```text
specs/010-forgot-password/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/           # Phase 1 output
    └── openapi.yaml
```

### Source Code (repository root)

```text
src/
├── database/
│   └── migrations/
│       └── 1722500000000-AddOutboxRetryColumns.ts
├── modules/
│   └── password/
│       ├── adapters/
│       │   └── password-reset-redis.adapter.ts
│       ├── controllers/
│       │   └── password.controller.ts
│       ├── dto/
│       │   ├── admin-initiate-password-reset.dto.ts
│       │   ├── confirm-password-reset.dto.ts
│       │   ├── request-password-reset.dto.ts
│       │   └── verify-reset-code.dto.ts
│       ├── exceptions/
│       │   └── password-reset.exception.ts
│       ├── services/
│       │   └── password.service.ts
│       └── password.module.ts
```

**Structure Decision**: Standard NestJS domain module layout inside `src/modules/password/`, following project architecture conventions.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*No violations. All design choices comply strictly with the project Constitution.*

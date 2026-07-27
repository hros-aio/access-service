# Implementation Plan: Tenant Bootstrap Root Admin Provisioning

**Branch**: `003-user-provisioning` | **Date**: 2026-07-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-user-provisioning/spec.md`

## Summary

Implement an event-driven tenant bootstrapping mechanism in the access/authentication microservice. The service will consume `tenant.created` events from the `tenant.lifecycle-events` topic using `@new-hros/libs-events`. To prevent duplicate processing, event IDs will be recorded in a new `kafka_consumed_events` database table. The bootstrapping logic will run inside a single transaction: it will apply a database lock scoped to the tenant, verify that no root admin exists, create the user record with `protected_root_admin = TRUE`, and insert an outbox event of type `authentication.user-provisioned` to the `auth_security_events_outbox` table.

## Technical Context

**Language/Version**: TypeScript (v5.x+) on Node.js (v22+)

**Primary Dependencies**: NestJS (v10+), TypeORM (v0.3.x+), `@new-hros/libs-sql`, `@new-hros/libs-core`, `@new-hros/libs-apis`, `@new-hros/libs-events`, class-validator, class-transformer

**Storage**: PostgreSQL (v15+), Redis

**Testing**: Jest, TypeORM Repository Mocking, Testcontainers (for database integration testing)

**Target Platform**: Docker, Kubernetes

**Project Type**: Microservice Web Service

**Performance Goals**: Event processing latency < 200ms, database query and transaction commit < 15ms.

**Constraints**: Must adhere strictly to Clean Architecture. Outbox writes must be atomic with the database transaction.

**Scale/Scope**: Bootstrapping capability for all incoming platform tenants.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Layering Compliance Gate**: Transport (Consumer) -> Application Service -> Repository. Thin transport layer, business logic in application services. (Passed)
- **Shared Library Gate**: Reuse `@new-hros/libs-sql`'s `BaseEntity`/`BaseRepository`, `@new-hros/libs-core`'s `RequestContextService`, and `@new-hros/libs-events`'s `setupKafkaMicroservice`. (Passed)
- **Strict Type Safety Gate**: `strict: true` TS compiler setup, named exports, explicit return types. (Passed)
- **Coverage Gate**: 90% Statements/Functions and 85% Branches coverage for new codebase. (Passed)

## Project Structure

### Documentation (this feature)

```text
specs/003-user-provisioning/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/           # Phase 1 output
    ├── tenant.created.json
    └── authentication.user-provisioned.json
```

### Source Code (repository root)

```text
src/
├── kafka/
│   └── consumers/
│       └── tenant-provisioning.consumer.ts
├── migrations/
│   └── 1716710500000-AddIdempotencyAndRootAdminSupport.ts
└── modules/
    └── provisioning/
        ├── provisioning.module.ts
        ├── services/
        │   └── provisioning.application.service.ts
        ├── entities/
        │   └── consumed-event.entity.ts
        └── repositories/
            └── consumed-event.repository.ts
```

**Structure Decision**: Place the consumer under `src/kafka/consumers` as specified by the repository organization guidelines in the Constitution, and separate database-related provisioning logic into a clean `provisioning` NestJS module under `src/modules`.

## Complexity Tracking

*No violations detected.*

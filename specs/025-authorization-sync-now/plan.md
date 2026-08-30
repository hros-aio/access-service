# Implementation Plan: Authorization Sync Now

**Branch**: `025-authorization-sync-now` | **Date**: 2026-08-30 | **Spec**: [specs/025-authorization-sync-now/spec.md](spec.md)

**Input**: Feature specification from `specs/025-authorization-sync-now/spec.md`

## Summary

Implement on-demand, manual synchronization for Roles and User Groups with unapplied changes (`version > projection_version`), allowing tenant administrators to trigger immediate asynchronous recalculation via `POST /authz/sync-now`, track progress via `GET /authz/sync-jobs/:jobId`, enforce deduplication through PostgreSQL partial unique indexes, recover stuck jobs via a watchdog service, and emit transactional outbox events for downstream notifications.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js (NestJS latest stable)

**Primary Dependencies**: `@nestjs/common`, `@nestjs/core`, `@nestjs/typeorm`, `typeorm`, `class-validator`, `class-transformer`, `@hrms/libs-core`, `@hrms/libs-sql`, `@hrms/libs-apis`

**Storage**: PostgreSQL 15+ (`authorization_sync_jobs`, `user_groups`, `roles`, `user_effective_roles`, `user_group_memberships`, `auth_security_events_outbox`), Redis (user authorization cache)

**Testing**: Jest (Unit tests), Testcontainers / Supertest (Integration and E2E tests)

**Target Platform**: Linux container / NestJS Microservice (`hrms-access-service` / `auth-svc`)

**Project Type**: Backend REST Web Service & Asynchronous Queue/Outbox Worker

**Performance Goals**: `<200ms` HTTP response for sync triggers; batched processing (500 users/batch) without long table locks

**Constraints**: Multi-tenant isolation strictly enforced via `RequestContext`; zero direct Kafka/email calls from HTTP layer; all outbox writes atomic with state changes; shared rebuild engine across manual and scheduled reconciliation (ADR-A14)

**Scale/Scope**: Support multi-tenant recalculations across 50k+ user populations per tenant

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Rule | Compliance Status | Rationale |
|---|---|---|
| I. Clean Architecture & Layering | PASS | Controllers remain thin; `AuthorizationSyncService` and `AuthorizationReconciliationWorker` orchestrate business logic; repositories handle persistence. |
| II. Bounded Contexts & Bounded Databases | PASS | Operates strictly within `hrms-access-service` schema. Downstream notifications handled via Outbox -> Kafka. |
| III. Shared Library-First Approach | PASS | Consumes `@hrms/libs-core`, `@hrms/libs-sql`, and `@hrms/libs-apis`. |
| IV. Strict Type Safety | PASS | Fully typed DTOs, interfaces, and explicit return types without `any`. |
| V. Test-Driven Development & Quality Gates | PASS | Comprehensive unit and integration test coverage for orchestration, concurrency dedup, and worker recovery. |
| VII. Database Rules (Transactions & Idempotency) | PASS | Database partial unique constraints for in-flight dedup; atomic outbox appends within transactions. |

## Project Structure

### Documentation (this feature)

```text
specs/025-authorization-sync-now/
├── plan.md              # Implementation plan
├── research.md          # Architecture & technical decisions
├── data-model.md        # DB schemas, entities, state transitions
├── quickstart.md        # Runnable verification guide
├── contracts/           # API and Outbox event contracts
│   ├── sync-api.contract.md
│   └── events.contract.md
└── checklists/          # Validation checklists
    └── requirements.md
```

### Source Code (repository root)

```text
src/
├── database/migrations/
│   └── 1724900000000-create-authorization-sync-jobs.ts
├── modules/
│   └── authorization/
│       ├── controllers/
│       │   ├── authorization-sync.controller.ts
│       │   └── authorization-sync.controller.spec.ts
│       ├── dto/
│       │   ├── trigger-sync-now.dto.ts
│       │   └── sync-job-response.dto.ts
│       ├── entities/
│       │   └── authorization-sync-job.entity.ts
│       ├── repositories/
│       │   ├── authorization-sync-job.repository.ts
│       │   └── authorization-sync-job.repository.spec.ts
│       ├── services/
│       │   ├── authorization-sync.service.ts
│       │   ├── authorization-sync.service.spec.ts
│       │   ├── authorization-reconciliation-worker.service.ts
│       │   ├── authorization-reconciliation-worker.service.spec.ts
│       │   ├── sync-job-watchdog.service.ts
│       │   └── sync-job-watchdog.service.spec.ts
│       └── authorization.module.ts
```

**Structure Decision**: Integrated directly into the existing `authorization` domain module in accordance with the Constitution repository organization guidelines.

## Complexity Tracking

*No constitutional violations identified.*

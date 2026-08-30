# Implementation Plan: Scheduled Authorization Reconciliation

**Branch**: `026-scheduled-authz-reconciliation` | **Date**: 2026-08-30 | **Spec**: [specs/026-scheduled-authz-reconciliation/spec.md](spec.md)

**Input**: Feature specification for Scheduled Authorization Reconciliation (`FEAT-AUTHZ-12`)

## Summary

Implement the periodic background reconciliation scanner for unapplied authorization changes (`version > projection_version`) across all tenants in `hros-access-service`. The scanner coordinates across cluster replicas using a distributed lock (`DistributedLockAdapter`), queries unsynchronized User Groups (and defensively Roles) across active tenants, and delegates to the shared `AuthorizationSyncService.enqueueSyncJob(...)` primitive under `SYSTEM` context with `triggerType = 'SCHEDULED'`. Jobs are processed by the shared `AuthorizationReconciliationWorker`, recovered by `SyncJobWatchdogService`, and monitored via dedicated Prometheus scheduler metrics.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js (NestJS latest stable)

**Primary Dependencies**: `@nestjs/common`, `@nestjs/core`, `@nestjs/schedule`, `@nestjs/typeorm`, `typeorm`, `ioredis` / `@hrms/libs-core`, `@hrms/libs-sql`, `@hrms/libs-apis`, `prom-client`

**Storage**: PostgreSQL 15+ (`authorization_sync_jobs`, `user_groups`, `roles`, `auth_security_events_outbox`), Redis (user authorization cache & optional distributed lock)

**Testing**: Jest (Unit tests), Testcontainers / Supertest (Integration and Concurrency tests)

**Target Platform**: Linux container / NestJS Microservice (`hros-access-service` / `auth-svc`)

**Project Type**: Background Scheduled Cron Scanner, Distributed Locking, and Asynchronous Worker Integration

**Performance Goals**: Fast, indexed dirty entity queries (`WHERE version <> projection_version`); zero locks on hot path; bounded memory overhead during multi-tenant iteration

**Constraints**: Multi-tenant isolation strictly preserved across batch runs; cluster single-leader execution guaranteed via distributed lock; reuse shared rebuild engine and watchdog without code branching (ADR-A14); zero secrets in logs/metrics

**Scale/Scope**: Periodic sweep across hundreds of tenants and tens of thousands of authorization entities

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Rule | Compliance Status | Rationale |
|---|---|---|
| I. Clean Architecture & Layering | PASS | Background scanner (`ScheduledReconciliationScanner`) coordinates jobs through `AuthorizationSyncService` and repositories; distributed lock abstracted via `DistributedLockAdapter`. |
| II. Bounded Contexts & Bounded Databases | PASS | Operates strictly within `hros-access-service` authorization schema. Emits outbox events for downstream notification consumption. |
| III. Shared Library-First Approach | PASS | Consumes `@hrms/libs-core` for logging/metrics, `@hrms/libs-sql` for TypeORM base classes, and `@hrms/libs-apis`. |
| IV. Strict Type Safety | PASS | Fully typed DTOs, interfaces, explicit return types without `any`. |
| V. Test-Driven Development & Quality Gates | PASS | Multi-replica lock contention, sweep iteration, and shared worker integration fully tested. |
| VII. Database Rules (Transactions & Idempotency) | PASS | Database partial unique constraints (`uq_authz_sync_jobs_in_flight`) deduplicate overlapping runs; outbox writes are transactional. |

## Project Structure

### Documentation (this feature)

```text
specs/026-scheduled-authz-reconciliation/
├── plan.md              # Implementation plan
├── research.md          # Architecture & technical decisions
├── data-model.md        # DB schemas, entities, state transitions
├── quickstart.md        # Runnable verification guide
├── contracts/           # Event schemas and telemetry contracts
│   ├── events.contract.md
│   └── telemetry.contract.md
└── checklists/          # Validation checklists
    └── requirements.md
```

### Source Code (repository root)

```text
src/
└── modules/
    └── authorization/
        ├── services/
        │   ├── scheduled-reconciliation-scanner.service.ts
        │   ├── scheduled-reconciliation-scanner.service.spec.ts
        │   ├── distributed-lock.adapter.ts
        │   ├── distributed-lock.adapter.spec.ts
        │   ├── authorization-sync.service.ts         # [REUSED]
        │   ├── authorization-reconciliation-worker.service.ts # [REUSED]
        │   └── sync-job-watchdog.service.ts          # [REUSED]
        ├── telemetry/
        │   ├── scheduled-reconciliation.metrics.ts
        │   └── scheduled-reconciliation.metrics.spec.ts
        └── authorization.module.ts
```

**Structure Decision**: Implemented directly within `src/modules/authorization/` to cleanly extend `AuthorizationSyncModule` alongside the shared sync orchestration components.

## Complexity Tracking

*No constitutional violations identified.*

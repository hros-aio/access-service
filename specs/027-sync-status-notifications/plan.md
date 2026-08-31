# Implementation Plan: Synchronization Status Visibility & Outcome Notifications

**Branch**: `027-sync-status-notifications` | **Date**: 2026-08-31 | **Spec**: [specs/027-sync-status-notifications/spec.md](spec.md)

**Input**: Feature specification from `specs/027-sync-status-notifications/spec.md`

## Summary

Implement real-time synchronization status visibility and outcome notifications for Role and User Group authorization changes. This includes the `SyncStatusProjectionService` for composite status calculation (`Pending`, `Processing`, `Completed`, `Failed`), metadata derivation (`lastSuccessfulSyncAt`, `affectedUserCount`, `nextExpectedSyncMethod`), tenant summary dashboard aggregation, REST endpoints (`GET /authz/sync-status/:sourceType/:sourceId`, `GET /authz/sync-status/summary`, `POST /authz/sync-status/:sourceType/:sourceId/retry`), outbox outcome event enrichment (`authorization.sync-completed` and `authorization.sync-failed` with `isHighImpact`, `isLongRunning`, `requiresEmailNotification`), and telemetry metrics.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20 LTS
**Primary Dependencies**: NestJS 10.x, TypeORM 0.3.x, `@new-hros/libs-core`, `@new-hros/libs-sql`, `@new-hros/libs-apis`, `class-validator`, `class-transformer`, `prom-client`
**Storage**: PostgreSQL 15+ (`authorization_sync_jobs`, `user_groups`, `roles`, `auth_security_events_outbox`)
**Testing**: Jest (Unit & Integration tests)
**Target Platform**: Linux / Kubernetes Microservice (`hros-access-service`)
**Project Type**: Backend REST Web Service & Event-Driven Outbox Producer
**Performance Goals**:
- Entity status query latency < 50ms (p95)
- Tenant summary dashboard query latency < 100ms (p95)
- Zero N+1 queries during summary aggregation
**Constraints**:
- Strictly bounded by caller `tenant_code`
- Read-only status checks must never mutate database state or trigger recalculations
- Zero direct outbound email/push calls; all notification delivery is delegated to `hros-notification-service` via Kafka outbox events (ADR-17)
- Zero secrets or raw stack traces in error details and event payloads
**Scale/Scope**: Multi-tenant enterprise platform supporting thousands of tenants, up to 1,000 User Groups/Roles per tenant, and millions of employee authorization evaluations.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Clean Architecture & Layering**: Controller -> Service -> Repository. Controllers only handle HTTP/DTO transformation and delegate to services. Services handle business rules and transactions.
- [x] **II. Bounded Contexts & Bounded Databases**: `hros-access-service` exclusively owns its authorization schemas and tables; no cross-service database access.
- [x] **III. Shared Library-First Approach**: Leverages `@new-hros/libs-core` for RequestContext and Logger, `@new-hros/libs-sql` for BaseRepository and TransactionService, and `@new-hros/libs-apis` for guards and decorators.
- [x] **IV. Strict Type Safety & Code Cleanliness**: No `any` types; explicit return types on all functions and DTOs; `strict: true` TypeScript configuration maintained.
- [x] **V. Test-Driven Development & Quality Gates**: 100% test coverage planned for projection logic, retry validation, outbox event enrichment, and API controller endpoints.
- [x] **Zero Secrets in Audit Logs**: Sanitized error reasons, zero credentials/tokens logged or included in outbox events.

## Project Structure

### Documentation (this feature)

```text
specs/027-sync-status-notifications/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── checklists/
│   └── requirements.md  # Specification quality checklist
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── sync-status-response.contract.json
│   ├── sync-status-summary-response.contract.json
│   ├── retry-failed-sync.contract.json
│   ├── authorization.sync-completed.event.json
│   └── authorization.sync-failed.event.json
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
src/modules/authorization/
├── controllers/
│   ├── authorization-sync.controller.ts            # Extend with status & retry endpoints
│   └── authorization-sync.controller.spec.ts
├── services/
│   ├── sync-status-projection.service.ts           # Core status derivation & summary service
│   ├── sync-status-projection.service.spec.ts
│   ├── authorization-sync.service.ts               # Extend with retryFailedSync method
│   ├── authorization-sync.service.spec.ts
│   ├── authorization-reconciliation-worker.service.ts # Enrich completion & failure events
│   └── authorization-reconciliation-worker.service.spec.ts
├── repositories/
│   ├── authorization-sync-job.repository.ts        # Extend with latest & completed job queries
│   └── authorization-sync-job.repository.spec.ts
├── dto/
│   ├── sync-status-response.dto.ts                 # Granular entity status DTO
│   ├── sync-status-summary-response.dto.ts         # Tenant summary aggregate DTO
│   └── retry-sync-response.dto.ts                  # Retry operation result DTO
├── telemetry/
│   ├── sync-status.metrics.ts                      # Prometheus metrics for queries & retries
│   └── sync-status.metrics.spec.ts
└── authorization.module.ts                         # Register new services and telemetry
```

**Structure Decision**: Single modular NestJS service (`hrms-access-service`), encapsulating status projection, retry orchestration, and event enrichment within `src/modules/authorization/` and leveraging `src/modules/auth/` for outbox event generation.

## Complexity Tracking

> **No violations identified.** Pure Clean Architecture extension within existing NestJS modules adhering fully to the Constitution.

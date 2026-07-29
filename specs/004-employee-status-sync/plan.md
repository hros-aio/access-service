# Implementation Plan: Employee Status Synchronization

**Branch**: `004-employee-status-sync` | **Date**: 2026-07-28 | **Spec**: [spec.md](file:///home/ren0503/new-hros/admin-module/auth-svc/specs/004-employee-status-sync/spec.md)

**Input**: Feature specification from `/specs/004-employee-status-sync/spec.md`

## Summary

The Employee Status Synchronization feature integrates the HRMS access service with the employment lifecycle. When an employee is suspended, terminated, or reactivated in the Directory/HR domain, corresponding events are consumed via Kafka. The service:
1. Revokes user access and sessions immediately for suspensions and terminations.
2. Revokes active invitations and generates a brand-new onboarding invitation for reactivations.
3. Performs strict version checking for ordering and idempotency.

---

## Technical Context

**Language/Version**: TypeScript 5.3.3 (Node.js >= 22)

**Primary Dependencies**: NestJS 10.3.0, TypeORM 0.3.17, ioredis 5.3.2, pg 8.11.3, `@new-hros/libs-events` 1.0.0, `@new-hros/libs-sql` 1.1.1, `@new-hros/libs-core` 1.1.1

**Storage**: PostgreSQL 15, Redis

**Testing**: Jest 29.7.0, ts-jest, supertest

**Target Platform**: Linux server (Docker/Kubernetes)

**Project Type**: Web Service (REST API + Kafka Consumer)

**Performance Goals**: Active session revocation in Redis < 1 second post PostgreSQL transaction commit.

**Constraints**: Row-level pessimistic locking (`SELECT FOR UPDATE`) on status updates, monotonic `sourceVersion` ordering checks, transactional outbox updates.

**Scale/Scope**: Enterprise-grade HRMS access service handling tenant-scoped user authentication.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Clean Architecture & Layering**: **Passed**. The flow is structured as: Kafka Consumer (Controller) -> ProvisioningApplicationService (Application Layer) -> Repositories & Entities (Data Access Layer). Dependencies point strictly inward.
- **Bounded Contexts & Databases**: **Passed**. The logic operates strictly within the authentication microservice's database tables (`users`, `employee_references`, `invitations`, `auth_security_events_outbox`). No cross-service tables are referenced or modified.
- **Shared Library-First Approach**: **Passed**. Leverages `@new-hros/libs-sql` for transaction management and database helpers, `@new-hros/libs-core` for RequestContext and structured logging, and `@new-hros/libs-events` for standard event envelopes.
- **Strict Type Safety**: **Passed**. TypeScript `strict` configuration is adhered to. Explicit parameter and return types are enforced across new files and classes.
- **TDD & Quality Gates**: **Passed**. New implementation flows will be covered by unit tests (in `src/**/*.spec.ts`) and integration tests to ensure 90%+ statements/functions coverage.

---

## Project Structure

### Documentation (this feature)

```text
specs/004-employee-status-sync/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: Research and architectural decisions
├── data-model.md        # Phase 1: Database schemas and transitions
├── quickstart.md        # Phase 1: Verification scenarios
└── contracts/           # Phase 1: Event schema JSON contracts
    ├── consumed-employee-lifecycle-events.json
    ├── published-sessions-revoked-event.json
    └── published-user-invited-event.json
```

### Source Code

```text
src/
├── enums/
│   └── event-type.enum.ts                 # Register new lifecycle event types
├── kafka/
│   └── consumers/
│       └── employee-lifecycle.consumer.ts # Kafka consumer controller
├── modules/
│   ├── provisioning/
│   │   ├── services/
│   │   │   └── provisioning.application.service.ts # Synchronize method implementation
│   │   └── provisioning.module.ts         # Module setup and controller registration
│   ├── employee/
│   │   └── employee.module.ts             # Exports EmployeeReferenceRepository
│   └── invite/
│       └── invite.module.ts               # Exports InvitationRepository
```

**Structure Decision**: Single project layout. The consumer is registered within the `ProvisioningModule` and orchestrates states using `ProvisioningApplicationService`.

---

## Complexity Tracking

*No violations identified. Architecture conforms fully to backend constitution guidelines.*

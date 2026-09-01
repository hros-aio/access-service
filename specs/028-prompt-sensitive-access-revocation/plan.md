# Implementation Plan: Prompt Revocation of Sensitive Access

**Branch**: `028-prompt-sensitive-access-revocation` | **Date**: 2026-09-01 | **Spec**: [specs/028-prompt-sensitive-access-revocation/spec.md](spec.md)

**Input**: Feature specification from `specs/028-prompt-sensitive-access-revocation/spec.md`

## Summary

Implement prompt, immediate cutoff of security-critical access without waiting for background scheduled reconciliation cycles. This encompasses synchronous Role permission removal with atomic Redis runtime eviction/overwrite, priority-ordered authorization sync job queueing (`URGENT` vs `STANDARD`/`SCHEDULED`) using PostgreSQL `SKIP LOCKED`, expedited population recalculation with cumulative independent grant preservation, and critical failure alerting through the transactional security events outbox.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20 LTS
**Primary Dependencies**: NestJS 10.x, TypeORM 0.3.x, `@hros/libs-core`, `@hros/libs-sql`, `@hros/libs-apis`, `ioredis` (via CacheManager), `class-validator`, `class-transformer`
**Storage**: PostgreSQL 15+ (`roles`, `role_permissions`, `user_groups`, `user_effective_roles`, `authorization_sync_jobs`, `auth_security_events_outbox`), Redis 7+ (`authz:role:*`, `authz:user:*`)
**Testing**: Jest (Unit & Integration tests)
**Target Platform**: Linux / Kubernetes Microservice (`hros-access-service`)
**Project Type**: Backend REST Web Service & Event-Driven Outbox Producer
**Performance Goals**:
- Synchronous Role permission cutoff latency < 30ms (p95)
- Priority job claim latency < 20ms (p95)
- Expedited User Group recalculation < 5s for populations up to 1,000 users
**Constraints**:
- Strictly bounded by caller `tenant_id`
- Access-service is the sole writer to `authz:role:{tenant}:{roleId}` and `authz:user:{tenant}:{userId}`
- Inviolable protected capabilities on built-in System Roles must never be stripped
- Zero direct external notification calls; alerts dispatch asynchronously through Kafka via Transactional Outbox
**Scale/Scope**: Multi-tenant enterprise platform supporting thousands of tenants, up to 1,000 User Groups/Roles per tenant, and millions of employee authorization evaluations.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Clean Architecture & Layering**: Strict Controller -> Service -> Repository hierarchy. Controllers validate incoming requests and call services. Repositories handle database and query operations.
- [x] **II. Bounded Contexts & Bounded Databases**: `hros-access-service` exclusively owns its authorization tables; no cross-service database access.
- [x] **III. Shared Library-First Approach**: Utilizes `@hros/libs-core`, `@hros/libs-sql`, and `@hros/libs-apis` for caching, data access, transactions, and guards.
- [x] **IV. Strict Type Safety & Code Cleanliness**: No `any` types; explicit return types on all functions and DTOs; `strict: true` TypeScript configuration maintained.
- [x] **V. Test-Driven Development & Quality Gates**: Full unit and integration test coverage for synchronous cache updates, expedited queue claiming, cumulative recalculation, and outbox failure logging.
- [x] **Zero Secrets in Audit Logs**: Sanitized error codes and safe failure reasons; zero credentials/tokens in outbox events.

## Project Structure

### Documentation (this feature)

```text
specs/028-prompt-sensitive-access-revocation/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── checklists/
│   └── requirements.md  # Specification quality checklist
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── update-role-permissions.contract.json
│   └── authorization.sync-failed.event.json
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
src/modules/
├── roles/
│   ├── services/
│   │   ├── role-application.service.ts             # Synchronous role update & Redis eviction
│   │   └── role-application.service.spec.ts
│   └── controllers/
│       └── role.controller.ts                      # Role permission endpoints
├── user-groups/
│   ├── services/
│   │   ├── user-group-application.service.ts       # Enqueue URGENT sync jobs on revocation
│   │   └── user-group-application.service.spec.ts
│   └── controllers/
│       └── user-group.controller.ts
├── authorization/
│   ├── services/
│   │   ├── authorization-sync.service.ts           # Priority-aware job enqueueing
│   │   ├── authorization-sync.service.spec.ts
│   │   ├── authorization-sync-worker.service.ts    # Priority claiming & critical failure alerting
│   │   ├── authorization-sync-worker.service.spec.ts
│   │   ├── membership-reconciler.service.ts        # Scoped membership evaluation
│   │   ├── effective-role-reconciler.service.ts    # Cumulative multi-group projection engine
│   │   └── effective-role-reconciler.service.spec.ts
│   ├── repositories/
│   │   ├── authorization-sync-job.repository.ts    # Priority-ordered SKIP LOCKED claim queries
│   │   └── authorization-sync-job.repository.spec.ts
│   └── entities/
│       └── authorization-sync-job.entity.ts        # Priority enum column & indexes
└── audit/
    └── services/
        └── security-event.service.ts               # Transactional outbox failure logger
```

**Structure Decision**: Single modular NestJS service (`hros-access-service`), implementing synchronous role cache updates in `src/modules/roles/`, priority-aware job queueing and reconcilers in `src/modules/authorization/`, and outbox auditing in `src/modules/audit/`.

## Complexity Tracking

> **No violations identified.** Full Clean Architecture adherence with zero unnecessary abstractions.

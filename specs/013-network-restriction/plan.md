# Implementation Plan: Restrict Login to Approved Network Locations

**Branch**: `013-network-restriction` | **Date**: 2026-08-05 | **Spec**: [spec.md](file:///home/ren0503/new-hros/admin-module/auth-svc/specs/013-network-restriction/spec.md)

**Input**: Feature specification from `/specs/013-network-restriction/spec.md`

## Summary

Restrict user authentication (password login, MFA challenge verification, SSO) based on tenant IP allow-list configuration. Requests from unapproved network locations are denied immediately, triggering an atomic Redis counter increment (`auth:ip-failure:{tenantCode}:{userId}`) and PostgreSQL security outbox event audit logging without locking standard password credentials. Specific actions (invitation setup, password reset requests) are explicitly exempted.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js (NestJS microservice)

**Primary Dependencies**: NestJS, TypeORM, `ipaddr.js`, ioredis, PostgreSQL, Kafka outbox

**Storage**: PostgreSQL (`authentication_settings` schema, `auth_security_events_outbox`), Redis (`auth:ip-failure` counters)

**Testing**: Jest unit tests & Testcontainers integration tests

**Target Platform**: Linux container (Docker/Kubernetes)

**Project Type**: Microservice / Web API (`hros-access-service`)

**Performance Goals**: IP location check evaluation latency < 10ms overhead

**Constraints**: < 200ms authentication P95 latency; denial before credential evaluation; zero global password lockouts on IP rejection

**Scale/Scope**: Multi-tenant isolation; high-concurrency authentication protection

## Constitution Check

*GATE: Passed*

1. **Clean Architecture & Layering**: Controller -> Application Service (`IpRestrictionService`) -> Repository / Redis Adapter -> Domain Policy (`IpRangePolicy`). Passes.
2. **Bounded Contexts**: `authentication_settings` and `auth_security_events_outbox` belong exclusively to `auth-svc` bounded context. Passes.
3. **Strict Type Safety**: Full TypeScript interfaces for request context and evaluation results. Passes.
4. **Security & Audit**: Explicit outbox pattern logging for security events and atomic Redis key tracking. Passes.

## Project Structure

### Documentation (this feature)

```text
specs/013-network-restriction/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── ip-restriction-contract.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── modules/
│   ├── ip-restriction/
│   │   ├── domain/
│   │   │   ├── ip-range.policy.ts
│   │   │   └── ip-range.policy.spec.ts
│   │   ├── application/
│   │   │   └── ip-restriction.service.ts
│   │   ├── infrastructure/
│   │   │   └── ip-lockout-redis.adapter.ts
│   │   ├── ip-restriction.module.ts
│   │   └── services/
│   │       ├── ip-restriction.service.ts
│   │       └── ip-restriction.service.spec.ts
│   ├── authentication/
│   │   └── application/
│   │       └── authentication.service.ts
│   ├── mfa/
│   │   └── application/
│   │       └── mfa.service.ts
│   └── tenant/
│       └── entities/
│           └── authentication-settings.entity.ts
```

**Structure Decision**: Standard NestJS domain module structure adhering to polyrepo layout and clean architecture principles.

## Complexity Tracking

*No violations.*

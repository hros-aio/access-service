# Implementation Plan: Tenant Authentication Settings

**Branch**: `014-tenant-auth-setting` | **Date**: 2026-08-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/014-tenant-authentication-setting/spec.md`

## Summary

Implement endpoints and domain services for viewing (`GET /admin/settings/authentication`) and updating (`PATCH /admin/settings/authentication`) tenant authentication settings. Enforce optimistic concurrency control (`version` counter), validate input DTOs (IP CIDR formats & positive lockout thresholds), and transactionally commit domain updates alongside outbox audit log entries (`authentication.settings-updated`) for asynchronous Kafka publication via `@hros/libs-events`.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js (NestJS v10+)

**Primary Dependencies**: `@nestjs/common`, `typeorm`, `class-validator`, `class-transformer`, `@hros/libs-apis`, `@hros/libs-events`, `@hros/libs-sql`

**Storage**: PostgreSQL (`authentication_settings`, `auth_security_events_outbox`), Redis

**Testing**: Jest (Unit & Integration tests)

**Target Platform**: Linux server (Microservice container)

**Project Type**: Web-service (NestJS REST API microservice)

**Performance Goals**: <200ms p95 response time for settings read/update requests

**Constraints**: <200ms response, strict tenant isolation (`tenant_code`), atomic outbox write

**Scale/Scope**: Multi-tenant HRMS administration module

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Clean Architecture & Layering**: Controller -> Application Service -> Repository -> Entity. (Passed)
- **Bounded Context & Schema**: Operates strictly within `auth-svc` bounded schema. (Passed)
- **Shared Library Usage**: Uses `@hros/libs-apis` for `RequestContext`, `@hros/libs-sql` for `BaseRepository`/`BaseEntity`. (Passed)
- **Strict Type Safety**: `strict: true` enabled, explicit return types on all methods. (Passed)
- **Optimistic Locking**: Enforced via `@VersionColumn()` and version check query. (Passed)
- **Security & PII**: Outbox payloads sanitized; no sensitive credentials logged. (Passed)

## Project Structure

### Documentation (this feature)

```text
specs/014-tenant-authentication-setting/
├── plan.md              # Implementation plan
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 validation guide
├── contracts/           # Phase 1 REST & Event contracts
│   └── authentication-settings-contracts.md
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
src/
└── modules/
    └── authentication-settings/
        ├── application/
        │   └── authentication-settings.service.ts
        ├── domain/
        │   └── authentication-settings.entity.ts
        ├── dto/
        │   ├── update-authentication-settings.dto.ts
        │   └── authentication-settings-response.dto.ts
        ├── infrastructure/
        │   └── authentication-settings.repository.ts
        └── transport/
            └── authentication-settings.controller.ts
```

**Structure Decision**: Standard NestJS domain module layout complying with project Clean Architecture guidelines.

## Complexity Tracking

*No constitution violations.*

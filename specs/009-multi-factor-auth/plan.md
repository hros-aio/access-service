# Implementation Plan: Multi-Factor Authentication (MFA)

**Branch**: `009-multi-factor-auth` | **Date**: 2026-08-02 | **Spec**: [spec.md](file:///home/ren0503/new-hros/admin-module/auth-svc/specs/009-multi-factor-auth/spec.md)

**Input**: Feature specification from `/specs/009-multi-factor-auth/spec.md`

## Summary

Implement Multi-Factor Authentication (MFA) within `hros-access-service`, covering factor enrollment (TOTP and Email OTP), mandatory MFA login gating, Redis-backed login challenge verification, and administrator MFA reset with session revocation and transactional outbox event publishing (`authentication.mfa-enrolled` and `authentication.mfa-reset`). Envelope encryption (KMS) will be used to encrypt stored secrets.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js (NestJS)

**Primary Dependencies**: `@nestjs/core`, `typeorm`, `ioredis`, `class-validator`, `kms-sdk`

**Storage**: PostgreSQL (`mfa_methods`, `users`, `auth_security_events_outbox`), Redis (`auth:mfa-challenge:*`, `auth:session:*`)

**Testing**: Jest (Unit & Integration tests)

**Target Platform**: Linux / Containerized Web Service

**Project Type**: Microservice (NestJS Web Service)

**Performance Goals**: MFA challenge code verification <200ms p95; immediate session revocation on admin reset.

**Constraints**: Strict Clean Architecture, zero raw plaintext secret storage, failure-closed Redis isolation (503 Service Unavailable).

**Scale/Scope**: Enterprise HRMS multi-tenant auth module.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Layering Compliance**: Controllers -> Services -> Repositories. Checked ✅
- **Bounded DB Compliance**: Exclusively touches `hros-access-service` schema. Checked ✅
- **Shared Library Use**: `@hrms/libs-core`, `@hrms/libs-sql`, `@hrms/libs-apis`. Checked ✅
- **Type Safety**: Explicit return types and `strict: true`. Checked ✅
- **Testing Gate**: Unit, integration, and E2E coverage. Checked ✅

## Project Structure

### Documentation (this feature)

```text
specs/009-multi-factor-auth/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── mfa-api.md
│   └── mfa-events.md
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
src/
├── database/
│   └── migrations/
│       └── 1720000000000-AddOutboxRetryColumns.ts
└── modules/
    └── mfa/
        ├── adapters/
        │   ├── kms-crypto.adapter.ts
        │   └── redis_mfa_challenge.adapter.ts
        ├── controllers/
        │   ├── mfa.controller.ts
        │   └── mfa_admin.controller.ts
        ├── repositories/
        │   └── mfa_method.repository.ts
        ├── services/
        │   ├── mfa_application.service.ts
        │   └── mfa_admin_application.service.ts
        └── mfa.module.ts

test/
└── mfa.e2e-spec.ts
```

**Structure Decision**: Standard NestJS microservice layout adhering strictly to Clean Architecture layering as mandated by the Enterprise HRMS Backend Constitution.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*No violations. All design choices fully satisfy the constitution.*

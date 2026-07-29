# Implementation Plan: Invitation & First-Time Access Setup

**Branch**: `005-invitation-setup` | **Date**: 2026-07-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-invitation-setup/spec.md`

## Summary
Implement invitation validation, password initialization (acceptance), and admin resending of invitation links. Secure the endpoints using pessimistic locking on the `User` aggregate, handle session/challenge revocation in Redis, and emit transactional outbox events matching the required payloads.

## Technical Context

**Language/Version**: Node.js (>=22), TypeScript (v5.9.3), packageManager: pnpm (v11.2.2)

**Primary Dependencies**: `@new-hros/libs-apis`, `@new-hros/libs-core`, `@new-hros/libs-events`, `@new-hros/libs-sql`, NestJS, TypeORM, ioredis, pg, argon2

**Storage**: PostgreSQL (users, credentials, invitations, auth_security_events_outbox), Redis (revoking restricted sessions/challenges)

**Testing**: Jest, supertest, `@nestjs/testing`

**Target Platform**: Linux server

**Project Type**: web-service

**Performance Goals**: 99.9% of valid invitation acceptances complete within 500ms

**Constraints**: Argon2id password hashing; no raw secrets logged; transactional outbox matching.

**Scale/Scope**: Onboarding flow for all multi-tenant employees.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Gate 1: Clean Architecture & Layering**
  - Verification: Business logic in services; controllers only handle request mapping and Swagger; repositories handle custom query operations.
  - Status: PASS
- **Gate 2: Bounded Contexts & Bounded Databases**
  - Verification: Schema and queries restricted only to tables owned by the `access-service`.
  - Status: PASS
- **Gate 3: Shared Library-First Approach**
  - Verification: Reuse `@new-hros/libs-core` for Redis Caching, `@new-hros/libs-sql` for TransactionService/BaseRepository, and `@new-hros/libs-apis` for Api contract/filters.
  - Status: PASS
- **Gate 4: Strict Type Safety & Code Cleanliness**
  - Verification: `strict: true` enabled. No `any`. Explicit return types on all methods.
  - Status: PASS
- **Gate 5: Test-Driven Development & Quality Gates**
  - Verification: Unit tests for services and repositories. Integration tests for transactional database writes. Strict coverage targets.
  - Status: PASS
- **Gate 6: Security Standards**
  - Verification: Enforce `access.user.resend-invitation` permission on resend. Do not log `rawToken` or password hashes. Mask PII in response payloads.
  - Status: PASS

## Project Structure

### Documentation (this feature)

```text
specs/005-invitation-setup/
├── plan.md              # This file
├── research.md          # Cryptography and concurrency research
├── data-model.md        # DB Entity definitions
├── quickstart.md        # End-to-end verification guides
└── contracts/
    └── api.md           # API HTTP contract specification
```

### Source Code (repository root)

```text
src/
├── modules/
│   ├── invite/
│   │   ├── controllers/
│   │   │   ├── invitation.controller.ts
│   │   │   └── admin-invitation.controller.ts
│   │   ├── services/
│   │   │   ├── invitation.application.service.ts
│   │   │   └── crypto.adapter.ts
│   │   ├── repositories/
│   │   │   └── invitation.repository.ts
│   │   ├── entities/
│   │   │   └── invitation.entity.ts
│   │   └── invite.module.ts
│   └── auth/
│       ├── services/
│       │   └── credential.domain.service.ts
│       └── repositories/
│           └── credential.repository.ts
```

**Structure Decision**: Added controllers and application services inside `src/modules/invite/` directory. Added `credential.domain.service.ts` inside `src/modules/auth/services/`.

## Complexity Tracking

*No violations to track. Fully compliant with Constitution.*

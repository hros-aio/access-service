# Implementation Plan: Log In With Email and Password

**Branch**: `007-login-password` | **Date**: 2026-07-31 | **Spec**: [spec.md](specs/007-login-password/spec.md)

**Input**: Feature specification from `/specs/007-login-password/spec.md`

## Summary

- **Primary Requirement**: Provide a secure and robust primary authentication path using email and password that enforces multi-tenant IP restrictions, lockout threshold evaluation, MFA challenges, outbox auditing, and prevents account enumeration.
- **Technical Approach**: Authenticate users via REST API `POST /auth/login/password`. Scoped by `tenantCode`, evaluate IP restrictions, query the user row with a database lock, verify the hashed credential via Argon2id, check the rolling failure counter in Redis, branch user session generation (either standard access tokens or an MFA challenge session), and transactionally commit audit events to the outbox table.

## Technical Context

**Language/Version**: TypeScript v5.3.3 / Node.js >=22

**Primary Dependencies**: NestJS v10.3.0, TypeORM v0.3.17, `@new-hros/libs-apis`, `@new-hros/libs-core`, `@new-hros/libs-sql`, `argon2`

**Storage**: PostgreSQL (users, credentials, authentication_settings, auth_security_events_outbox tables), Redis (session and lockout caching)

**Testing**: Jest v29.7.0, ts-jest, supertest

**Target Platform**: Linux container (Node.js runtime environment)

**Project Type**: Web service (REST API backend)

**Performance Goals**: Argon2id password verification under 300ms, DB transaction and outbox insertion under 200ms

**Constraints**: Row-level user locking on password evaluation, strict tenant isolation on all queries, generic 401 response payloads to prevent account enumeration, no logging of credentials.

**Scale/Scope**: Primary authentication flow handling concurrent login attempts.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Gate 1: Layered Architecture**: PASS. Implementation routes through Controller -> Application Service -> Domain Policies -> Relational/Cache Adapters. Thin controllers are maintained.
- **Gate 2: Database Ownership**: PASS. Only reads/writes tables owned by `access-service`.
- **Gate 3: Shared Library Reuse**: PASS. Reuses cache manager and base database utilities from `@new-hros/libs-core` and `@new-hros/libs-sql`.
- **Gate 4: TypeScript Strictness**: PASS. Implemented with strict compiler rules and explicit return types.
- **Gate 5: Database Transactions**: PASS. Audit outbox writes and user lockout updates are bundled in a TypeORM transaction.
- **Gate 6: API Formatting & Error Mapping**: PASS. Uses standard DTOs and global exception handling.
- **Gate 7: Security Guarding**: PASS. Strict IP validation, lockout triggers, and generic unauthorized responses.

## Project Structure

### Documentation (this feature)

```text
specs/007-login-password/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/
    └── login-password-api.yaml # Phase 1 output
```

### Source Code (repository root)

```text
src/
└── modules/
    ├── authentication/
    │   ├── controllers/
    │   │   └── authentication.controller.ts            # Mapped to POST /auth/login/password
    │   ├── dto/
    │   │   └── login-with-password.dto.ts              # Payload validation DTO
    │   └── services/
    │       └── authentication-application.service.ts   # Core orchestrator
    ├── credential/
    │   ├── domain/
    │   │   └── credential-policy.domain.ts             # Password strength validations
    │   └── infrastructure/
    │       └── adapters/
    │           └── argon2-crypto.adapter.ts            # Argon2id hashing & verification
    ├── lockout/
    │   └── services/
    │       └── lockout.service.ts                      # Failure tracking & lockout evaluations
    ├── ip-restriction/
    │   └── services/
    │       └── ip-restriction.service.ts               # CIDR validation policy
    └── security-event/
        └── services/
            └── security-event.service.ts               # Transactional event outbox publisher
```

**Structure Decision**: Single project NestJS layout. Business login logic resides inside the modular `authentication` domain, while specialized subsystems like `lockout`, `ip-restriction`, `credential`, and `security-event` handle their respective policies.

## Complexity Tracking

*No violations of the Constitution identified.*

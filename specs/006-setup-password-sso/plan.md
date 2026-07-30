# Implementation Plan: Password Setup via Company Single Sign-On (Fallback Path)

**Branch**: `006-setup-password-sso` | **Date**: 2026-07-30 | **Spec**: [spec.md](specs/006-setup-password-sso/spec.md)

**Input**: Feature specification from `specs/006-setup-password-sso/spec.md`

## Summary

- **Primary Requirement**: Provide a secure fallback mechanism for employees logging in via company SSO who do not have an active password credential or completed invitation.
- **Technical Approach**: Establish a restricted session state (verified using a `sso-setup-pending` token in Redis), validate password strength, hash password via Argon2id, and execute a database transaction that inserts-if-absent the active credential (throwing a 409 CREDENTIAL_ALREADY_EXISTS error if it already exists), transitions the user to ACTIVE, cancels pending invitations, and writes event audit records into the transactional outbox.

## Technical Context

- **Language/Version**: TypeScript v5.3.3 / Node.js >=22
- **Primary Dependencies**: NestJS v10.3.0, TypeORM v0.3.17, `@new-hros/libs-apis`, `@new-hros/libs-core`, `@new-hros/libs-sql`, `argon2`
- **Storage**: PostgreSQL (users, credentials, invitations, outbox tables), Redis (session caching via `RedisCacheProvider`)
- **Testing**: Jest v29.7.0, ts-jest, supertest for E2E routing verification
- **Target Platform**: Linux container (Node.js runtime environment)
- **Project Type**: Web service (REST API backend)
- **Performance Goals**: Argon2id password hashing under 300ms, overall database transaction commit under 200ms
- **Constraints**: Strict multi-tenant isolation (tenant_code required on all filters); the password may be sent in the HTTPS request body but must never be logged, persisted unencrypted, returned, or included in errors or audit payloads.

- **Scale/Scope**: Fallback authentication API endpoint, concurrent safety handling simultaneous updates via row-level locking

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Gate 1: Layered Architecture**: PASS. Thick controllers are avoided; presentation layer (`PasswordController`) only forwards requests to the application layer (`PasswordService`).
- **Gate 2: Database Ownership**: PASS. Only reads/writes database tables owned exclusively by the `access-service`.
- **Gate 3: Shared Library Reuse**: PASS. Reuses core cache and database transaction utilities from `@new-hros/libs-core` and `@new-hros/libs-sql`.
- **Gate 4: TypeScript Strictness**: PASS. Implemented with strict compile-time types, explicit return types on public methods, and no `any` usages.
- **Gate 5: Database Transactions**: PASS. Multiple updates (`credentials`, `users`, `invitations`, `outbox`) are bundled in a TypeORM-managed transaction.
- **Gate 6: API Formatting & Error Mapping**: PASS. Return payload utilizes standard DTO patterns, and errors translate into structured REST responses via exception filters.
- **Gate 7: Security Guarding**: PASS. Path `/auth/password/setup/firebase` is restricted using a NestJS Guard checking temporary setup tokens in Redis.

## Project Structure

### Documentation (this feature)

```text
specs/006-setup-password-sso/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md  # Specification Quality Checklist
```

### Source Code (repository root)

```text
src/
├── enums/
│   └── index.ts                                 # Enums for statuses
├── modules/
│   ├── auth/
│   │   ├── entities/
│   │   │   └── credential.entity.ts             # Credential model
│   │   ├── repositories/
│   │   │   └── credential.repository.ts         # Add active check logic
│   │   └── services/
│   │       ├── credential.domain.service.ts     # Hashing wrapper
│   │       └── session.application.service.ts    # Session revokes
│   ├── invite/
│   │   ├── entities/
│   │   │   └── invitation.entity.ts
│   │   └── repositories/
│   │       └── invitation.repository.ts         # Add cancellation updates
│   └── password/
│       ├── controllers/
│       │   └── password.controller.ts           # Receives HTTP POST setup request
│       ├── dto/
│       │   └── setup-password-via-sso.dto.ts    # Setup payload validation DTO
│       ├── guards/
│       │   └── restricted-session.guard.ts      # Guard verifying Redis flow session
│       ├── services/
│       │   ├── password.service.ts              # Business process orchestrator
│       │   └── credential.policy.ts             # Complexity checking service
│       └── password.module.ts                   # Module bootstrapping password folder
```

**Structure Decision**: Single project NestJS layout. Core password handlers are enclosed in a modular `password` domain folder, and shared updates to existing user, invitation, or auth credentials are implemented inside their respective modules.

## Complexity Tracking

*No violations of the Constitution identified.*

# Implementation Plan: Define Identity Models

**Branch**: `002-define-identity-models` | **Date**: 2026-07-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-define-identity-models/spec.md`

## Summary

Implement the database entity models, custom repositories, and data mapping layer for the authentication/access microservice based on the relational schema defined in `schema.sql`. This feature establishes the complete physical data layer for Tenants, Employee References, Users, Credentials, External SSO Identities, Account Invitations, Multi-Factor Authentication (MFA) Methods, Authentication Settings, and the Security Audit Event Outbox. The implementation will maximize reuse of `@new-hros/libs-sql` base classes and ensure compile-time and runtime type safety.

## Technical Context

**Language/Version**: TypeScript (v5.x+) on Node.js (v22+)

**Primary Dependencies**: NestJS (v10+), TypeORM (v0.3.x+), `@new-hros/libs-sql`, `@new-hros/libs-core`, `@new-hros/libs-apis`, class-validator, class-transformer

**Storage**: PostgreSQL (v15+), Redis (via `@new-hros/libs-core` CacheManager)

**Testing**: Jest, TypeORM Repository Mocking, Testcontainers (for database integration testing)

**Target Platform**: Docker, Kubernetes

**Project Type**: Microservice Web Service

**Performance Goals**: Entity instantiation overhead < 1ms, query latency < 10ms for single-row operations, transaction rollback under failure < 5ms.

**Constraints**:
- Relational mapping MUST strictly match PostgreSQL schema constraints from `schema.sql`.
- Maximize reuse of `@new-hros/libs-sql`'s `BaseEntity` and `BaseRepository`.
- Avoid duplication of shared core libraries.
- No business logic inside TypeORM entities or custom repositories.

**Scale/Scope**: Core data model foundation for auth service. Handles up to 100k user accounts and millions of security outbox events.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Layering Compliance Gate**: Entities must reside in their respective module folder `src/modules/<module>/entities/` (e.g. `user/entities/`, `mfa/entities/`, etc.) and repositories in `src/modules/<module>/repositories/`. No database queries or entity manipulation are allowed in controllers. (Passed)
- **Shared Library Gate**: Reuses `@new-hros/libs-sql`'s `BaseEntity` for all standard entities and `BaseRepository` for all standard repositories. (Passed)
- **Asymmetric Encryption Gate**: Passwords will be securely hashed, and external identities will map federated logins. Asymmetric validation remains handled at the authentication token exchange boundaries. (Passed)
- **Coverage Gate**: All repository methods and custom entities must have 90% Statements/Functions and 85% Branches test coverage. (Passed)

## Project Structure

### Documentation (this feature)

```text
specs/002-define-identity-models/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md  # Spec checklist
```

### Source Code (repository root)

```text
src/
└── modules/
    ├── tenant/
    │   ├── tenant.module.ts
    │   ├── entities/
    │   │   ├── tenant.entity.ts
    │   │   └── authentication-settings.entity.ts
    │   └── repositories/
    │       ├── tenant.repository.ts
    │       └── authentication-settings.repository.ts
    ├── employee/
    │   ├── employee.module.ts
    │   ├── entities/
    │   │   └── employee-reference.entity.ts
    │   └── repositories/
    │       └── employee-reference.repository.ts
    ├── user/
    │   ├── user.module.ts
    │   ├── entities/
    │   │   └── user.entity.ts
    │   └── repositories/
    │       └── user.repository.ts
    ├── auth/
    │   ├── auth.module.ts
    │   ├── entities/
    │   │   ├── credential.entity.ts
    │   │   ├── external-identity.entity.ts
    │   │   └── auth-security-event-outbox.entity.ts
    │   └── repositories/
    │       ├── credential.repository.ts
    │       ├── external-identity.repository.ts
    │       └── auth-security-event-outbox.repository.ts
    ├── invite/
    │   ├── invite.module.ts
    │   ├── entities/
    │   │   └── invitation.entity.ts
    │   └── repositories/
    │       └── invitation.repository.ts
    └── mfa/
        ├── mfa.module.ts
        ├── entities/
        │   └── mfa-method.entity.ts
        └── repositories/
            └── mfa-method.repository.ts
```

**Structure Decision**: Place entities and repositories in their respective domain modules under `src/modules/` (such as `tenant`, `employee`, `user`, `auth`, `invite`, and `mfa`) instead of grouping them in a single monolithic `identity` module. Each module houses its corresponding entities and repositories.

## Complexity Tracking

*No violations detected.*

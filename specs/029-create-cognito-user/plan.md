# Implementation Plan: AWS Cognito Account Provisioning on User Creation

**Branch**: `029-create-cognito-user` | **Date**: 2026-10-16 | **Spec**: [specs/029-create-cognito-user/spec.md](spec.md)

**Input**: Feature specification from `specs/029-create-cognito-user/spec.md`

## Summary

Implement automatic cloud identity provisioning in AWS Cognito User Pool immediately after an internal user account is created. This includes creating a dedicated `CognitoUserProvisioningService` that encapsulates attribute mapping (`normalizedEmail`, `displayEmail`, `tenantCode`), idempotent linking when a Cognito user already exists (`CognitoUserAlreadyExistsException`), configurable welcome message suppression (`messageAction: 'SUPPRESS'`), exponential backoff retry for transient network disruptions, transactional updating of `user.externalIdentityId` with the Cognito `sub`, and security audit logging through the transactional outbox (`auth_security_events_outbox`).

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js >= 22  
**Primary Dependencies**: NestJS 10.x, TypeORM 0.3.x, `@new-hros/libs-aws` (CognitoService), `@new-hros/libs-sql`, `@new-hros/libs-core`, `@new-hros/libs-events`, `@new-hros/libs-apis`  
**Storage**: PostgreSQL 15+ (`users`, `auth_security_events_outbox`), AWS Cognito User Pool (external cloud identity provider)  
**Testing**: Jest (Unit & Integration tests)  
**Target Platform**: Linux / Kubernetes Microservice (`hrms-access-service`)  
**Project Type**: Backend REST Web Service & Event-Driven Outbox Producer  
**Performance Goals**:  
- Cloud identity provisioning and linking < 3s (p95) under normal network conditions  
- 100% idempotent resolution of duplicate/pre-existing Cognito accounts without uncaught exceptions  
**Constraints**:  
- Multi-tenant isolation: All Cognito user attributes include `custom:tenant_code`  
- Security: Zero secrets, plain passwords, or temporary tokens written to logs or audit tables  
- Reliability: Transient AWS errors retried with exponential backoff; unrecoverable errors emit audit events  
**Scale/Scope**: Multi-tenant enterprise platform supporting thousands of tenants and millions of employee identity records.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Clean Architecture & Layering**: Strict Controller -> Service -> Repository hierarchy. Low-level AWS SDK wrapped by `@new-hros/libs-aws` `CognitoService`, domain orchestration encapsulated in `CognitoUserProvisioningService`.
- [x] **II. Bounded Contexts & Bounded Databases**: `hrms-access-service` owns its user tables; external communication strictly through versioned SDKs and transactional outbox.
- [x] **III. Shared Library-First Approach**: Leverages `@new-hros/libs-aws` for Cognito integration, `@new-hros/libs-sql` for transactions/repositories, and `@new-hros/libs-core` for logging and base exceptions.
- [x] **IV. Strict Type Safety & Code Cleanliness**: No `any` types; explicit return types on all functions and DTOs; `strict: true` TypeScript configuration maintained.
- [x] **V. Test-Driven Development & Quality Gates**: Full unit and integration test coverage for successful provisioning, idempotent existing user linking, backoff retries, and failure event logging.
- [x] **Zero Secrets in Audit Logs**: Sanitized error codes and safe failure reasons; zero credentials/tokens in outbox events or logs.

## Project Structure

### Documentation (this feature)

```text
specs/029-create-cognito-user/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── checklists/
│   └── requirements.md  # Specification quality checklist
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── cognito-provisioning.contract.json
│   ├── authentication.cognito-user-provisioned.event.json
│   └── authentication.cognito-provisioning-failed.event.json
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── app.module.ts                                   # Configures CognitoModule.forRootAsync
├── modules/
│   ├── user/
│   │   ├── user.module.ts                          # Imports CognitoModule and exports provisioning services
│   │   ├── entities/
│   │   │   └── user.entity.ts                      # Holds externalIdentityId column
│   │   ├── repositories/
│   │   │   ├── user.repository.ts                  # Provides findByTenantAndExternalIdentity
│   │   │   └── user.repository.spec.ts
│   │   └── services/
│   │       ├── cognito-user-provisioning.service.ts # Core Cognito user creation & idempotency logic
│   │       └── cognito-user-provisioning.service.spec.ts
│   ├── provisioning/
│   │   ├── provisioning.module.ts                  # Orchestrates root admin & workforce lifecycle
│   │   └── services/
│   │       ├── provisioning.application.service.ts # Calls cognito provisioning on bootstrapRootAdmin
│   │       └── provisioning.application.service.spec.ts
│   └── security-event/
│       └── services/
│           ├── security-event.service.ts           # Logs cognito-user-provisioned & failed outbox events
│           └── security-event.service.spec.ts
```

**Structure Decision**: Single modular NestJS service (`hrms-access-service`). Low-level Cognito interaction is provided by `@new-hros/libs-aws`. The domain logic for provisioning is located in `src/modules/user/services/cognito-user-provisioning.service.ts`, consumed by `ProvisioningApplicationService` and any future administrative user creation handlers.

## Complexity Tracking

> **No violations identified.** Strict adherence to Clean Architecture, SOLID principles, and constitutional security rules.

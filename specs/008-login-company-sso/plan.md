# Implementation Plan: Firebase SSO Login & External Identity Mapping

**Branch**: `008-login-company-sso` | **Date**: 2026-08-01 | **Spec**: [spec.md](file:///home/ren0503/new-hros/admin-module/auth-svc/specs/008-login-company-sso/spec.md)

**Input**: Feature specification from `/specs/008-login-company-sso/spec.md`

## Summary

Authenticate users via company Single Sign-On (federated via Firebase Admin SDK ID Token verification) and map verified external identities strictly to internal user accounts. Enforce account status, lockout rules, IP restriction allow-lists, and session state branching (Active HRMS session, Password Setup Pending session, or MFA Challenge session) without auto-creating accounts or guessing identities.

## Technical Context

**Language/Version**: TypeScript v5.x+ (NestJS v10.x)

**Primary Dependencies**: NestJS, TypeORM, `firebase-admin`, `@hrms/libs-core`, `@hrms/libs-sql`, `@hrms/libs-apis`

**Storage**: PostgreSQL v15+ (relational user & identity mappings, outbox), Redis v7+ (sessions & lockout counters)

**Testing**: Jest (Unit / Integration), Testcontainers (PostgreSQL / Redis integration)

**Target Platform**: Linux server (Containerized Node.js microservice)

**Project Type**: Web service / REST API microservice (`hros-access-service`)

**Performance Goals**: <500ms p95 response time for active SSO authentication (excluding external network latency)

**Constraints**: Strict isolation via circuit breaker (5000ms timeout on Firebase Admin SDK), fail-closed session creation, zero token leakage in audit logs

**Scale/Scope**: Multi-tenant architecture supporting high concurrent enterprise user logins

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Clean Architecture & Layering**: Controller -> Application Service -> Domain/Adapters -> Repositories. Direct DB access from Controller is forbidden.
- [x] **II. Bounded Contexts & Bounded Databases**: Service owns schema exclusively; no cross-service DB calls.
- [x] **III. Shared Library-First Approach**: Core utilities, SQL base patterns, and standard APIs reuse `@hrms/libs-*`.
- [x] **IV. Strict Type Safety**: TypeScript `strict: true` enabled; no `any`. Explicit return types on exported API functions.
- [x] **V. Security & Audit**: No raw credential/token logging; explicit transactional security event outbox entry; asymmetric key session token issuing.

## Project Structure

### Documentation (this feature)

```text
specs/008-login-company-sso/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── firebase-sso-api.json
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── modules/
│   ├── firebase-sso/
│   │   ├── application/
│   │   │   └── firebase-sso-application.service.ts
│   │   ├── domain/
│   │   │   ├── ports/
│   │   │   │   └── firebase-verifier.port.ts
│   │   │   └── exceptions/
│   │   │       ├── invalid-firebase-token.exception.ts
│   │   │       └── firebase-provider-unavailable.exception.ts
│   │   ├── infrastructure/
│   │   │   └── adapters/
│   │   │       └── firebase-admin.adapter.ts
│   │   ├── presentation/
│   │   │   ├── dto/
│   │   │   │   └── login-with-firebase.dto.ts
│   │   │   └── firebase-sso.controller.ts
│   │   └── firebase-sso.module.ts
│   ├── external-identity/
│   │   └── infrastructure/
│   │       └── persistence/
│   │           └── external-identity.repository.ts
│   └── security-event/
│       └── application/
│           └── security-event.service.ts
```

**Structure Decision**: Standard NestJS Polyrepo Modular Clean Architecture within `src/modules/`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*No constitution violations identified.*

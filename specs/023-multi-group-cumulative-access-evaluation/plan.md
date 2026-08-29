# Implementation Plan: Multi-Group Cumulative Access Evaluation

**Branch**: `023-multi-group-cumulative-access-evaluation` | **Spec**: [spec.md](specs/023-multi-group-cumulative-access-evaluation/spec.md)

## Summary

Resolve and enforce effective permissions and scopes for employees holding multiple responsibilities across different User Groups as the strictly cumulative (additive) union of all assigned Roles and Scopes. This includes materializing role-scope associations in PostgreSQL (`user_effective_roles`), caching un-flattened user authorization profiles in Redis (`authz:user:*`) with monotonic versioning, evaluating cumulative scope unions via pure in-memory evaluators in runtime guards (`@hros/libs-apis` / `AuthorizationGuard`), and exposing a post-login bootstrap endpoint for cumulative capabilities.

## Technical Context

- **Language/Version**: TypeScript (v5.x), NestJS (latest stable)
- **Primary Dependencies**: TypeORM, Redis / `@hrms/libs-core` CacheManager, `@hrms/libs-apis`
- **Storage**: PostgreSQL (`user_effective_roles`), Redis (`authz:user:*`, `authz:role:*`)
- **Testing**: Jest (Unit tests), Testcontainers (PostgreSQL & Redis integration tests)
- **Target Platform**: Linux / Node.js
- **Project Type**: Web service / Backend Microservice
- **Performance Goals**: Guard access evaluation < 5ms p95; Pure domain evaluation < 0.1ms; Bootstrap capabilities < 20ms
- **Constraints**: In-process runtime evaluation; Zero cross-service network calls on authz check; Fail-closed on store outage (HTTP 503)
- **Scale/Scope**: Multi-tenant, multi-group users with overlapping scopes (`SELF`, `DIRECT_REPORTEES`, `COMPANY`, `LOCATION`, `DEPARTMENT`, `TENANT`)

## Constitution Check

- [x] **Clean Architecture & Layering**: Strict Controller -> Service -> Repository separation. Pure evaluation logic in domain service (`CumulativeAccessEvaluator`).
- [x] **Bounded Contexts & Databases**: `hrms-access-service` exclusively owns `user_effective_roles` and `authz:*` keys.
- [x] **Strict Type Safety**: Strict TypeScript, explicit return types, no `any`.
- [x] **Strict Multi-Tenancy**: All DB queries, Redis keys, and evaluation contexts scoped by `tenant_code`.
- [x] **Test Coverage Gates**: 90% Statements, 90% Functions, 85% Branches across unit and integration tests.
- [x] **Fail-Closed Security**: Rejects unauthorized access with 403; surfaces 503 on store unavailability; no leakage of sensitive data in logs.

## Project Structure

### Documentation (this feature)

```text
specs/023-multi-group-cumulative-access-evaluation/
├── spec.md                  # Feature specification
├── plan.md                  # Implementation plan
├── research.md              # Phase 0 research decisions
├── data-model.md            # Data models and cache schema
├── quickstart.md            # Validation scenarios and quickstart guide
├── contracts/               # API & Guard interface contracts
│   └── bootstrap-capabilities.contract.md
└── checklists/
    └── requirements.md      # Spec quality checklist
```

### Source Code Organization

```text
src/
├── modules/
│   ├── authorization/
│   │   ├── controllers/
│   │   │   └── bootstrap-authorization.controller.ts
│   │   ├── services/
│   │   │   ├── cumulative-access-evaluator.service.ts
│   │   │   ├── effective-role-projection.service.ts
│   │   │   ├── user-authorization-cache.service.ts
│   │   │   └── bootstrap-authorization.service.ts
│   │   ├── repositories/
│   │   │   └── user-effective-role.repository.ts
│   │   ├── entities/
│   │   │   └── user-effective-role.entity.ts
│   │   ├── dto/
│   │   │   └── bootstrap-capabilities-response.dto.ts
│   │   └── interfaces/
│   │       ├── effective-user-role.interface.ts
│   │       ├── scope-constraint.interface.ts
│   │       └── resource-context.interface.ts
│   └── guards/
│       └── authorization.guard.ts
```

## Design Artifacts

- **Phase 0 Research**: [research.md](specs/023-multi-group-cumulative-access-evaluation/research.md)
- **Phase 1 Data Model**: [data-model.md](specs/023-multi-group-cumulative-access-evaluation/data-model.md)
- **Phase 1 API Contracts**: [contracts/bootstrap-capabilities.contract.md](specs/023-multi-group-cumulative-access-evaluation/contracts/bootstrap-capabilities.contract.md)
- **Phase 1 Quickstart**: [quickstart.md](specs/023-multi-group-cumulative-access-evaluation/quickstart.md)

## Implementation Tasks (Overview)

1. **BE-AUTHZ-091**: User Effective Role Projection & Materialization Engine (`EffectiveRoleProjectionService`, `user_effective_roles` repository & entity).
2. **BE-AUTHZ-092**: Redis User Authorization Cache Writer & Monotonic Versioning (`UserAuthorizationCacheService`, miss recovery).
3. **BE-AUTHZ-093**: Pure In-Memory Cumulative Permission Resolution & Scope Union Evaluator (`CumulativeAccessEvaluator`).
4. **BE-AUTHZ-094**: Runtime Authorization Guard & In-Process Pipeline Integration (`AuthorizationGuard`).
5. **BE-AUTHZ-095**: Session Bootstrap Cumulative Capabilities Endpoint (`GET /auth/bootstrap/capabilities`).

# Implementation Plan: Role Assignment to User Groups

**Branch**: `021-role-assignment-user-groups` | **Date**: 2026-08-29 | **Spec**: [specs/021-role-assignment-user-groups/spec.md](spec.md)

**Input**: Feature specification from `/specs/021-role-assignment-user-groups/spec.md`

## Summary

Enable tenant administrators to assign, unassign, and replace platform Roles on a User Group in a many-to-many relationship. The solution implements domain-level aggregate methods for role delta tracking, optimistic concurrency control (`user_groups.version`), pre-commit blast radius estimation (`RoleAssignmentImpactService`) with high-impact confirmation gating, and transactional persistence with outbox events (`user_group.roles_assigned`, `user_group.role_unassigned`, `authorization.user-group-updated`). Role assignment persistence marks the group dirty (`version > projection_version`) and strictly defers user-effective role recomputation to asynchronous reconciliation (ADR-A13).

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: NestJS (v10+), TypeORM, `@new-hros/libs-core`, `@new-hros/libs-sql`, `@new-hros/libs-apis`, `class-validator`, `class-transformer`  
**Storage**: PostgreSQL 15+ (`user_groups`, `user_group_roles`, `roles`, `user_group_memberships`, `auth_security_events_outbox`)  
**Testing**: Jest, Supertest, Testcontainers  
**Target Platform**: Linux container (NestJS microservice)  
**Project Type**: Backend REST microservice (`hrms-access-service` / `auth-svc`)  
**Performance Goals**: Role assignment persistence < 300ms; impact estimation < 500ms for groups with up to 10,000 members  
**Constraints**: Zero synchronous modification to `user_effective_roles` or Redis caches (ADR-A13); strict tenant isolation via `RequestContextService`; atomic outbox event persistence  
**Scale/Scope**: Multi-tenant HRMS supporting up to 100,000 users per tenant  

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Layering**: Controller -> Application/Domain Service -> Repository -> Entity. (PASSED)
- **Bounded Context**: Access Service exclusively owns `user_groups`, `user_group_roles`, `roles`, `auth_security_events_outbox`. (PASSED)
- **Shared Libraries**: Uses `@new-hros/libs-core` (`RequestContextService`, `BaseException`), `@new-hros/libs-sql` (`BaseRepository`, `TransactionService`), `@new-hros/libs-apis` (`JwtAuthGuard`, `PermissionGuard`). (PASSED)
- **Strict Type Safety**: `strict: true` enabled, no `any`, explicit return types on all methods. (PASSED)
- **Security & Multi-Tenancy**: All DB queries and mutations scoped by `tenantCode` from `RequestContextService`. Inviolable system roles protected. (PASSED)
- **Asynchronous Reconciliation**: Role mutations mark aggregate dirty (`version > projection_version`); access materialization deferred to async sync worker. (PASSED)

## Project Structure

### Documentation (this feature)

```text
specs/021-role-assignment-user-groups/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── roles-assignment.contract.json
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
└── modules/
    └── user-groups/
        ├── controllers/
        │   ├── user-group-role.controller.ts            # REST endpoints for GET/PUT/Impact
        │   └── user-group-role.controller.spec.ts
        ├── domain/
        │   ├── aggregates/
        │   │   └── user-group.aggregate.ts              # assignRoles, unassignRoles, replaceRoles methods
        │   └── exceptions/
        │       └── user-group.exceptions.ts             # HighImpactConfirmationRequiredError, etc.
        ├── dto/
        │   ├── update-user-group-roles.dto.ts           # DTO for PUT /user-groups/:id/roles
        │   ├── estimate-role-assignment-impact.dto.ts   # DTO for POST /user-groups/:id/roles/impact-estimate
        │   └── assigned-role-item.dto.ts                # DTO for GET /user-groups/:id/roles response
        ├── repositories/
        │   ├── user-group-role.repository.ts            # Query & bulk update user_group_roles
        │   └── user-group.repository.ts                 # Version bump & optimistic locking
        └── services/
            ├── role-assignment-impact.service.ts        # Pre-commit blast radius & zero-role estimation
            ├── role-assignment-impact.service.spec.ts
            ├── user-group-role-assignment.service.ts    # Transaction orchestration & outbox
            └── user-group-role-assignment.service.spec.ts
```

**Structure Decision**: Integrated within existing `src/modules/user-groups` following Clean Architecture and domain layering standards.

## Complexity Tracking

*No constitution violations or unjustified architectural patterns.*

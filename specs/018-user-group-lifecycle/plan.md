# Implementation Plan: User Group Definition & Lifecycle

**Branch**: `018-user-group-lifecycle` | **Date**: 2026-08-27 | **Spec**: [spec.md](file:///home/ren0503/new-hros/admin-module/auth-svc/specs/018-user-group-lifecycle/spec.md)

**Input**: Feature specification from `/specs/018-user-group-lifecycle/spec.md`

## Summary

Implement complete lifecycle management for tenant-defined User Groups in `hros-access-service` (`UserGroupModule`). This includes creating dynamic user groups with closed allow-list rule validation and attribute key indexing (`rule_attribute_keys`), scope configuration (`ScopeType`), role associations with zero-role draft support, optimistic concurrency protection on mutations, lifecycle state transitions (`ACTIVE` <-> `INACTIVE`), dirty-state synchronization tracking (`version > projection_version`), outbox event publishing, and tenant-isolated admin REST endpoints.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: NestJS, TypeORM, `@new-hros/libs-core`, `@new-hros/libs-sql`, `@new-hros/libs-apis`, `class-validator`, `class-transformer`  
**Storage**: PostgreSQL 15+ (`user_groups`, `user_group_roles`, `auth_security_events_outbox`)  
**Testing**: Jest (Unit, Integration & E2E tests)  
**Target Platform**: Linux / Containerized Node.js Microservice  
**Project Type**: Web Service (`hros-access-service` / `auth-svc`)  
**Performance Goals**: Sub-50ms API responses; zero inline evaluation of matching rules on mutation/query paths; atomic PostgreSQL transactions for persistence and outbox event publishing  
**Constraints**: Zero hard deletions of user groups; strict tenant isolation via `RequestContext`; optimistic locking on `user_groups.version`  
**Scale/Scope**: Multi-tenant enterprise SaaS supporting dynamic employee group definitions and role assignments  

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Clean Architecture & Layering**: Controller (`UserGroupAdminController`) -> Service (`UserGroupLifecycleService`, `UserGroupQueryService`) -> Repository (`UserGroupRepository`, `UserGroupRoleRepository`). Controllers are thin; business rules reside strictly in domain aggregate and services. **[PASS]**
- **Bounded Contexts**: Schema and tables (`user_groups`, `user_group_roles`) owned exclusively by `hros-access-service`. **[PASS]**
- **Shared Library-First**: Reuses `RequestContextService` (`@new-hros/libs-core`), `TransactionService` & `BaseEntity` (`@new-hros/libs-sql`), and standard response decorators (`@new-hros/libs-apis`). **[PASS]**
- **Type Safety & Code Quality**: Strict typing with class-validator DTOs, domain value objects, and explicit return types. **[PASS]**
- **Security & Immutability**: All mutations write to `auth_security_events_outbox` within the primary database transaction. **[PASS]**
- **Optimistic Locking**: Enforced via `user_groups.version` to prevent concurrent overwrite collisions. **[PASS]**
- **Asynchronous Membership Rebuild**: Inline dynamic rule evaluation is forbidden during HTTP mutations (ADR-A11, ADR-A13); state changes reliably set dirty flag (`version > projection_version`). **[PASS]**

## Project Structure

### Documentation (this feature)

```text
specs/018-user-group-lifecycle/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── user-groups.openapi.yaml
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
└── modules/
    └── user-groups/
        ├── controllers/
        │   └── user-group-admin.controller.ts
        ├── domain/
        │   ├── aggregates/
        │   │   └── user-group.aggregate.ts
        │   ├── enums/
        │   │   ├── user-group-status.enum.ts
        │   │   └── scope-type.enum.ts
        │   ├── exceptions/
        │   │   └── user-group.exceptions.ts
        │   ├── validators/
        │   │   └── matching-rule.validator.ts
        │   └── value-objects/
        │       └── matching-rule.vo.ts
        ├── dto/
        │   ├── create-user-group.dto.ts
        │   ├── update-user-group.dto.ts
        │   ├── lifecycle-transition.dto.ts
        │   ├── user-group-details.dto.ts
        │   └── user-group-query.dto.ts
        ├── entities/
        │   ├── user-group.entity.ts
        │   └── user-group-role.entity.ts
        ├── repositories/
        │   ├── user-group.repository.ts
        │   └── user-group-role.repository.ts
        ├── services/
        │   ├── user-group-lifecycle.service.ts
        │   ├── user-group-query.service.ts
        │   ├── user-group-lifecycle.service.spec.ts
        │   └── matching-rule.validator.spec.ts
        └── user-group.module.ts
```

**Structure Decision**: Standard NestJS domain module organization conforming to Constitution Section 4.

## Complexity Tracking

> *No violations found. Clean standard layering, domain validation engine, and platform library reuse.*

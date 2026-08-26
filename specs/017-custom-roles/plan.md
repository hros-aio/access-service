# Implementation Plan: Custom Role Lifecycle Management

**Branch**: `017-custom-roles` | **Date**: 2026-08-26 | **Spec**: [spec.md](file:///home/ren0503/new-hros/admin-module/auth-svc/specs/017-custom-roles/spec.md)

**Input**: Feature specification from `/specs/017-custom-roles/spec.md`

## Summary

Implement complete lifecycle management for tenant-defined Custom Roles in `hros-access-service` (`RoleModule`). This includes creating custom roles from scratch with DAG permission dependency validation, copying existing System/Custom roles with automatic capability protection reset (`is_protected = FALSE`), updating metadata and permissions with optimistic concurrency locking and pre-commit reach estimation, soft-deactivation with multi-group impact warnings, reactivation, unassigned indicator badging, transactional outbox security event logging, and synchronous Redis cache propagation.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: NestJS, TypeORM, `@new-hros/libs-core`, `@new-hros/libs-sql`, `@new-hros/libs-apis`, `class-validator`, `class-transformer`  
**Storage**: PostgreSQL 15+ (`roles`, `role_permissions`, `auth_security_events_outbox`, `user_group_roles`, `user_effective_roles`), Redis (`authz:role:{tenant}:{roleId}`)  
**Testing**: Jest (Unit & Integration tests)  
**Target Platform**: Linux / Containerized Node.js Microservice  
**Project Type**: Web Service (`hros-access-service` / `auth-svc`)  
**Performance Goals**: Sub-50ms query responses; synchronous Redis cache propagation under 500ms; atomic PostgreSQL transactions for multi-row writes  
**Constraints**: Zero hard deletions of assigned roles; tenant isolation via `RequestContext`; optimistic locking on `roles.version`  
**Scale/Scope**: Multi-tenant enterprise SaaS supporting thousands of custom roles and dynamic user group mappings  

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Clean Architecture & Layering**: Controller (`RoleController`) -> Service (`RoleApplicationService`) -> Repository (`RoleRepository`, `RolePermissionRepository`). Controller is thin; business logic resides strictly in services. **[PASS]**
- **Bounded Contexts**: All role tables (`roles`, `role_permissions`) are owned exclusively by `hros-access-service`. **[PASS]**
- **Shared Library-First**: Reuses `RequestContextService` (`@new-hros/libs-core`), `TransactionService` & `BaseEntity` (`@new-hros/libs-sql`), and standard response decorators (`@new-hros/libs-apis`). **[PASS]**
- **Type Safety & Code Quality**: Strict typing with DTOs and explicit return types. **[PASS]**
- **Security & Immutability**: All mutations write to `auth_security_events_outbox` in the same transaction. Inviolable system capabilities cannot be modified. **[PASS]**
- **Optimistic Locking**: Enforced via `roles.version` to prevent concurrent overwrite collisions. **[PASS]**

## Project Structure

### Documentation (this feature)

```text
specs/017-custom-roles/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── custom-roles.openapi.yaml
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
└── modules/
    └── roles/
        ├── controllers/
        │   └── role.controller.ts
        ├── dto/
        │   ├── role.dto.ts
        │   ├── create-custom-role.dto.ts
        │   ├── copy-role.dto.ts
        │   ├── update-custom-role.dto.ts
        │   └── deactivate-role.dto.ts
        ├── entities/
        │   ├── role.entity.ts
        │   └── role-permission.entity.ts
        ├── exceptions/
        │   └── role.exceptions.ts
        ├── interfaces/
        │   └── system-role-template.interface.ts
        ├── repositories/
        │   ├── role.repository.ts
        │   └── role-permission.repository.ts
        ├── services/
        │   ├── role.application.service.ts
        │   ├── role-cache.service.ts
        │   └── role.application.service.spec.ts
        └── role.module.ts
```

**Structure Decision**: Standard NestJS domain module organization conforming to Constitution Section 4.

## Complexity Tracking

> *No violations found. Clean standard layering and reuse of platform libraries.*

# Implementation Plan: System Roles Baseline & Protection

**Branch**: `016-system-roles-baseline` | **Date**: 2026-08-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/016-system-roles-baseline/spec.md`

## Summary

Implement **System Roles Baseline & Protection** within `RoleModule` and `ProvisioningModule` of `hros-access-service`. This establishes built-in platform System Roles (`EMPLOYEE`, `MANAGER`, `ADMINISTRATOR`) seeded upon tenant provisioning, enforces server-side invariants locking protected capabilities (`is_protected = true`) with transactional audit violation recording, enables extending System Roles with non-protected capabilities (`is_protected = false`) subject to dependency validation, supports tenant-facing role renaming while keeping system keys intact, and updates role-level Redis cache synchronously upon mutation.

---

## Technical Context

**Language/Version**: TypeScript 5.x+, Node.js 20+

**Primary Dependencies**: NestJS (v10+), TypeORM, PostgreSQL 15+, Redis, class-validator, class-transformer, `@hrms/libs-core`, `@hrms/libs-sql`, `@hrms/libs-apis`, `@hros/libs-contracts`

**Storage**: PostgreSQL (`roles`, `role_permissions`, `auth_security_events_outbox`), Redis (`authz:role:{tenant}:{roleId}`)

**Testing**: Jest (Unit tests for RoleApplicationService, SystemRoleSeederService, invariant logic; E2E tests for provisioning, permission mutations, and renaming APIs).

**Target Platform**: Linux / Kubernetes containerized deployment inside `hros-access-service`.

**Project Type**: Modular domain module inside NestJS polyrepo backend service.

**Performance Goals**: $<50\text{ms}$ role permission check / Redis lookup; $<200\text{ms}$ role mutation and provisioning transactions; optimistic locking on `roles.version`.

**Constraints**: Protected capabilities cannot be removed under any circumstance; System Roles cannot be deleted or critical roles deactivated; synchronous Redis cache propagation without user-level mass rebuilds (ADR-A12).

**Scale/Scope**: 3 baseline System Roles per tenant, scalable to hundreds of custom roles and thousands of tenants.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Rule | Compliance Status | Rationale |
|---|---|---|
| Clean Architecture & Layering | PASS | Controllers handle HTTP transport; `RoleApplicationService` orchestrates business logic; `RoleRepository` / `RolePermissionRepository` handle persistence. |
| Bounded Contexts & Database Isolation | PASS | `RoleModule` owns `roles` and `role_permissions` schema exclusively. Security outbox integration uses existing transactional patterns. |
| Shared Library-First Approach | PASS | Uses `@hrms/libs-sql` for `BaseEntity`, `TransactionService`, and optimistic locking; `@hrms/libs-apis` for request context and guards. |
| Strict Type Safety | PASS | `strict: true` compliant; explicit return types and DTOs with `readonly` properties. |
| TDD & Quality Gates | PASS | Unit tests for invariant checking, seeder logic, and renaming; E2E tests for endpoints. |
| Inviolable Protected Capabilities | PASS | Explicit server-side invariant checking throws typed domain errors and persists audit events in outbox. |

---

## Project Structure

### Documentation (this feature)

```text
specs/016-system-roles-baseline/
├── plan.md              # Implementation plan
├── research.md          # Technical research & architectural decisions
├── data-model.md        # Database schema & entity relationships
├── quickstart.md        # Verification scenarios & test commands
├── contracts/           # API and DTO contracts
│   └── roles.contract.ts
└── checklists/
    └── requirements.md  # Specification quality checklist
```

### Source Code (repository layout)

```text
src/
├── migrations/
│   └── 1724600000000-create-roles-and-role-permissions.ts
└── modules/
    ├── provisioning/
    │   └── services/
    │       └── system-role-seeder.service.ts
    └── roles/
        ├── constants/
        │   └── system-role-templates.constant.ts
        ├── controllers/
        │   └── role.controller.ts
        ├── dto/
        │   ├── rename-role.dto.ts
        │   ├── role-response.dto.ts
        │   └── update-role-permissions.dto.ts
        ├── entities/
        │   ├── role.entity.ts
        │   └── role-permission.entity.ts
        ├── exceptions/
        │   ├── cannot-delete-system-role.exception.ts
        │   ├── duplicate-role-name.exception.ts
        │   └── protected-capability-removal.exception.ts
        ├── interfaces/
        │   └── system-role-template.interface.ts
        ├── repositories/
        │   ├── role.repository.ts
        │   └── role-permission.repository.ts
        ├── services/
        │   ├── role.application.service.ts
        │   └── role-cache.service.ts
        ├── role.module.ts
        └── index.ts
```

**Structure Decision**: Standard NestJS domain module `src/modules/roles/` with integration into `src/modules/provisioning/` following Clean Architecture and Constitution standards.

---

## Complexity Tracking

> **No Constitution violations identified.** Implementation adheres fully to the Constitution, ADR-A12, PRD §5.3, and SYSTEM_OVERVIEW §6.

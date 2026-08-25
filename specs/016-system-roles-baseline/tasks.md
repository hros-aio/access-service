# Tasks: System Roles Baseline & Protection

**Input**: Design documents from `specs/016-system-roles-baseline/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

## Format: `[TaskID] [P?] [Story?] Description with file path`
- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: Which user story this task belongs to (`US1`, `US2`, `US3`, `US4`)
- All tasks must strictly include exact file paths

---

## Phase 1: Setup (Module Scaffolding, Entities & Contracts)

**Purpose**: Database schema migration, TypeORM entities, and interface contracts initialization

- [X] T001 [P] Create database migration for `roles` and `role_permissions` tables with indexes and unique constraints in `src/migrations/1724600000000-create-roles-and-role-permissions.ts`
- [X] T002 [P] Implement `Role` entity (`id`, `tenant_code`, `name`, `description`, `type`, `system_role_key`, `status`, `version`, `timestamps`) in `src/modules/roles/entities/role.entity.ts`
- [X] T003 [P] Implement `RolePermission` entity (`id`, `tenant_code`, `role_id`, `permission_code`, `is_protected`, `created_at`) in `src/modules/roles/entities/role-permission.entity.ts`
- [X] T004 [P] Create DTOs and contracts (`RoleResponseDto`, `RenameRoleDto`, `UpdateRolePermissionsDto`) in `src/modules/roles/dto/role.dto.ts`
- [X] T005 [P] Define domain exceptions (`CannotDeleteSystemRoleException`, `ProtectedCapabilityRemovalException`, `DuplicateRoleNameException`, `CriticalRoleDeactivationException`) in `src/modules/roles/exceptions/role.exceptions.ts`
- [X] T006 [P] Define platform System Role templates (`EMPLOYEE`, `MANAGER`, `ADMINISTRATOR`) and baseline capability mappings in `src/modules/roles/constants/system-role-templates.constant.ts`

---

## Phase 2: Foundational (Repositories, Cache Service & Module Registration)

**Purpose**: Core data access, Redis cache synchronization adapter, and module registration

**⚠️ CRITICAL**: Must be complete before user story application logic can execute.

- [X] T007 Implement `RoleRepository` with tenant scoping, pessimistic/optimistic locking, and query helpers in `src/modules/roles/repositories/role.repository.ts`
- [X] T008 Implement `RolePermissionRepository` with batch insertion and tenant-scoped lookups in `src/modules/roles/repositories/role-permission.repository.ts`
- [X] T009 Implement `RoleCacheService` managing Redis key `authz:role:{tenant}:{roleId}` synchronization and invalidation in `src/modules/roles/services/role-cache.service.ts`
- [X] T010 Register and export `RoleModule` components in `src/modules/roles/role.module.ts` and `src/modules/roles/index.ts`

**Checkpoint**: Foundation ready — repositories, entities, cache adapter, and templates ready for user story execution.

---

## Phase 3: User Story 1 - Baseline System Roles Provisioned Automatically for New Tenants (Priority: P1) 🎯 MVP

**Goal**: Automatically provision default System Roles (`EMPLOYEE`, `MANAGER`, `ADMINISTRATOR`) with protected capabilities on tenant creation, and block system role deletion.

**Independent Test**: Trigger tenant provisioning seeder for a new tenant and verify all 3 system roles exist with appropriate `is_protected` flags; verify `DELETE /roles/:id` rejects deleting system roles.

### Tests for User Story 1
- [X] T011 [P] [US1] Unit test for System Role seeder and deletion guard in `src/modules/provisioning/services/system-role-seeder.service.spec.ts`
- [X] T012 [P] [US1] Integration test for tenant provisioning seeding baseline system roles in `test/roles/system-roles.e2e-spec.ts`

### Implementation for User Story 1
- [X] T013 [US1] Implement `SystemRoleSeederService` to seed `roles`, `role_permissions` (with `is_protected = true`), and initial Redis cache in a transaction in `src/modules/provisioning/services/system-role-seeder.service.ts`
- [X] T014 [US1] Integrate `SystemRoleSeederService` into `ProvisioningApplicationService.bootstrapRootAdmin()` / tenant provisioning workflow in `src/modules/provisioning/services/provisioning.application.service.ts`
- [X] T015 [US1] Implement delete role guard in `RoleApplicationService.deleteRole()` rejecting any role with `type = 'SYSTEM'` in `src/modules/roles/services/role.application.service.ts`

**Checkpoint**: New tenants automatically receive default system roles upon provisioning, and system roles cannot be deleted.

---

## Phase 4: User Story 2 - Inviolable Protected Capability Locking & Violation Audit Logging (Priority: P1)

**Goal**: Enforce server-side invariants preventing removal of protected capabilities and deactivation of critical system roles, recording immutable violation audit events.

**Independent Test**: Submit a permission update on a System Role omitting a protected capability; verify rejection with HTTP 422, unchanged database state, and an audit record `role.protected-capability-violation` in outbox.

### Tests for User Story 2
- [X] T016 [P] [US2] Unit tests for protected capability invariant enforcement and violation auditing in `src/modules/roles/services/role.application.service.spec.ts`
- [X] T017 [P] [US2] Integration test for protected capability rejection and audit event verification in `test/roles/system-roles.e2e-spec.ts`

### Implementation for User Story 2
- [X] T018 [US2] Implement invariant checks in `RoleApplicationService.updatePermissions()` verifying that all existing `role_permissions` with `is_protected = true` remain in the requested set in `src/modules/roles/services/role.application.service.ts`
- [X] T019 [US2] Implement transactional audit record generation (`role.protected-capability-violation`) into `auth_security_events_outbox` on invariant failure in `src/modules/roles/services/role.application.service.ts`
- [X] T020 [US2] Implement deactivation prevention rule in `RoleApplicationService.updateRoleStatus()` blocking deactivation of `system_role_key = 'ADMINISTRATOR'` in `src/modules/roles/services/role.application.service.ts`

**Checkpoint**: Protected capabilities cannot be removed under any circumstance, deactivation of admin is blocked, and violation attempts are logged.

---

## Phase 5: User Story 3 - Extending System Roles with Non-Protected Capabilities (Priority: P2)

**Goal**: Allow administrators to extend System Roles with non-protected capabilities (`is_protected = false`), validate capability prerequisites, check high-impact thresholds, and synchronously propagate to Redis cache.

**Independent Test**: Add a valid capability to a System Role, verify prerequisite validation via `PermissionDependencyService`, check that `is_protected = false` is saved, version increments, and Redis key is updated immediately.

### Tests for User Story 3
- [X] T021 [P] [US3] Unit tests for role extension, dependency validation, and cache propagation in `src/modules/roles/services/role.application.service.spec.ts`
- [X] T022 [P] [US3] Integration test for capability extension and dependency error handling in `test/roles/system-roles.e2e-spec.ts`

### Implementation for User Story 3
- [X] T023 [US3] Integrate `PermissionDependencyService.validatePermissionSet()` into `RoleApplicationService.updatePermissions()` in `src/modules/roles/services/role.application.service.ts`
- [X] T024 [US3] Implement pre-commit high-impact estimation check (`SELECT COUNT(DISTINCT user_id)`) before applying changes in `src/modules/roles/services/role.application.service.ts`
- [X] T025 [US3] Implement permission update persistence, optimistic version bump, synchronous `RoleCacheService` update, and outbox event publishing (`authorization.role-updated`) in `src/modules/roles/services/role.application.service.ts`

**Checkpoint**: Administrators can safely extend System Roles with non-protected permissions with dependency guarantees and instant cache updates.

---

## Phase 6: User Story 4 - Customizing Tenant-Facing Role Display Labels & Inspection APIs (Priority: P2)

**Goal**: Expose REST API endpoints to rename System Role display names within tenant scope without altering system keys, and inspect role configurations.

**Independent Test**: Rename a System Role from "Employee" to "Team Member"; verify `roles.name` updates, `system_role_key` remains "EMPLOYEE", and `role.renamed` audit event is emitted.

### Tests for User Story 4
- [X] T026 [P] [US4] Unit tests for role renaming and uniqueness validation in `src/modules/roles/services/role.application.service.spec.ts`
- [X] T027 [P] [US4] Integration test for role inspection and renaming API endpoints in `test/roles/system-roles.e2e-spec.ts`

### Implementation for User Story 4
- [X] T028 [US4] Implement `RoleApplicationService.renameRole()` with tenant-scoped uniqueness check and `role.renamed` outbox event in `src/modules/roles/services/role.application.service.ts`
- [X] T029 [US4] Implement `RoleController` with endpoints:
  - `GET /roles` (list roles with user reach counts)
  - `GET /roles/:roleId` (get role details with `is_protected` flags)
  - `PATCH /roles/:roleId/rename` (rename role)
  - `PUT /roles/:roleId/permissions` (update permissions)
  - `DELETE /roles/:roleId` (delete custom role / block system role)
  in `src/modules/roles/controllers/role.controller.ts`

**Checkpoint**: Full role management API active with tenant-scoped renaming and role inspection.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, end-to-end verification, and final quality gate checks

- [X] T030 [P] Execute all unit and integration test suites (`npm test`)
- [X] T031 Run quickstart verification scenarios per `specs/016-system-roles-baseline/quickstart.md`
- [X] T032 [P] Ensure zero lint/type errors across the project (`npm run lint` and `npm run build`)

---

## Dependencies & Execution Order

### User Story Dependencies
```
Phase 1 (Setup) ──> Phase 2 (Foundational: Repositories & Cache)
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
     Phase 3 (US1: Provisioning & MVP)   Phase 4 (US2: Invariant & Audit)
             │                           │
             └─────────────┬─────────────┘
                           ▼
              Phase 5 (US3: Extension & Synchronous Cache)
                           │
                           ▼
              Phase 6 (US4: Renaming & Inspection APIs) ──> Phase 7 (Polish)
```

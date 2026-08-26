# Phase 0 Research: Custom Role Lifecycle Management

## 1. Technical Decisions and Best Practices

### Decision 1: Optimistic Concurrency Control vs. Pessimistic Write Locking
- **Decision**: Use `@VersionColumn()` optimistic concurrency control on `roles` (and `Role.version`) for API updates, and fall back to explicit version checks in SQL (`WHERE id = :id AND version = :expectedVersion`) or TypeORM's built-in version checking.
- **Rationale**: Multiple administrators may inspect and edit roles concurrently in the administrative portal. Optimistic locking avoids database row contention during read/inspection phases and prevents accidental overwrites (last-write-wins) with HTTP 409 conflict responses.
- **Alternatives Considered**: 
  - *Pessimistic Locking*: Causes blocking if transactions remain open and does not prevent conflicts between two disconnected HTTP requests.

### Decision 2: Permission Capability Dependency Engine
- **Decision**: Leverage existing `PermissionDependencyService.validatePermissionSet(permissionCodes)` from `PermissionCatalogModule`.
- **Rationale**: `PermissionDependencyService` evaluates the Directed Acyclic Graph (DAG) of capability prerequisites (e.g. `employee.update` requires `employee.view`). It ensures custom roles never hold incomplete capabilities and throws/returns 422 Unprocessable Entity when prerequisites are violated.
- **Alternatives Considered**:
  - *Ad-hoc permission checks in controller*: Violates DRY and SRP; error-prone and misses transitive dependencies.

### Decision 3: System Role Copy Engine & Protection Reset
- **Decision**: In `copyRole(sourceRoleId, dto)`, load the source role's granted permissions and clone them into `role_permissions` for the new role with `isProtected = false`, `systemRoleKey = null`, and `type = RoleType.CUSTOM`.
- **Rationale**: Custom roles must be fully customizable. System roles possess inviolable protected permissions (`is_protected = true`), but copied custom roles must decouple from system templates and unlock all capabilities.
- **Lineage Policy**: No source lineage column or foreign key is persisted (per PRD Open Question 8 and System Overview §6.5), ensuring complete decoupling.
- **Alternatives Considered**:
  - *Inheriting `is_protected = true`*: Would lock capabilities in custom roles, defeating the purpose of creating custom roles.

### Decision 4: Lifecycle Status Transitions and Soft Deactivation
- **Decision**: Implement explicit lifecycle actions `deactivate` (`status = INACTIVE`) and `reactivate` (`status = ACTIVE`). Never hard-delete roles with historical assignments.
- **Rationale**: Hard deleting roles breaks historical audit continuity and foreign references in audit logs. Deactivating a role synchronously updates Redis (`authz:role:{tenant}:{roleId}`) with empty/inactive status, causing immediate authorization revocation.
- **Impact Guard**: When deactivating a role assigned to active user groups, return an impact confirmation payload (`affectedUserGroupCount`, `affectedUserCount`) unless confirmed.
- **Alternatives Considered**:
  - *Hard deletion*: Prohibited by PRD §5.2 and Constitution.

### Decision 5: Reach & Unassigned Badging Computation
- **Decision**: Extend `RoleRepository` / `RoleApplicationService` to compute:
  1. `is_unassigned: boolean`: True if count of linked user groups in `user_group_roles` is 0.
  2. `active_user_reach_count: number`: Count of distinct `user_id` in `user_effective_roles`.
- **Rationale**: Allows administrators to identify unused custom roles in the UI for cleanup and assess blast radius before modifying or deactivating roles.
- **Alternatives Considered**:
  - *Computing in frontend*: Frontend lacks access to cross-tenant or aggregate user group data.

### Decision 6: Transactional Outbox Security Events & Cache Synchronization
- **Decision**: In each write operation, persist an event (`role.created`, `role.copied`, `role.updated`, `role.deactivated`, `role.reactivated`) to `auth_security_events_outbox` inside the PostgreSQL transaction, and immediately synchronize Redis (`authz:role:{tenant}:{roleId}`) upon commit.
- **Rationale**: Ensures guaranteed audit delivery via the outbox worker and immediate authorization cache propagation across the platform without waiting for async projection recomputations.
- **Alternatives Considered**:
  - *Direct Kafka publishing in transaction*: Risk of dual-write failure if database commits but Kafka fails or vice-versa.

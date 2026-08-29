# Research & Technical Decisions: Role Assignment to User Groups

**Feature**: `021-role-assignment-user-groups`  
**Date**: 2026-08-29

## 1. Domain Aggregate Mutations & Role Assignment Deltas

### Decision
Extend `UserGroupAggregate` with explicit domain methods:
- `assignRoles(roleIds: string[])`: Appends unique role IDs to aggregate state.
- `unassignRoles(roleIds: string[])`: Removes specified role IDs from aggregate state.
- `replaceRoles(roleIds: string[])`: Calculates role deltas (`addedRoleIds`, `removedRoleIds`), updates `assignedRoleIds`, and increments `version` by 1.

### Rationale
- Keeps `UserGroupAggregate` as the true domain aggregate root governing version mutations and role association state.
- Separates role delta calculation from infrastructure persistence.
- Enforces that role unassignment is an association mutation and never modifies or deletes the target `Role` aggregate.

### Alternatives Considered
- *Managing role links strictly in an application service*: Rejected because it bypasses aggregate encapsulation and domain invariants around dirty version incrementing.

---

## 2. Pre-Commit Impact Estimation & Blast Radius Calculation

### Decision
Implement `RoleAssignmentImpactService` in `UserGroupModule` with `estimateRoleAssignmentImpact(tenantCode: string, userGroupId: string, targetRoleIds: string[])`:
1. **Materialized Members Query**: Fetch all distinct `employee_id`s from `user_group_memberships` for `(tenantCode, userGroupId)`.
2. **Delta Calculation**:
   - Query currently assigned role IDs for the group.
   - Calculate added roles: `targetRoleIds \ currentRoleIds`.
   - Calculate removed roles: `currentRoleIds \ targetRoleIds`.
   - If no roles added or removed (`targetRoleIds` identical to `currentRoleIds`), `affectedUserCount = 0`, `zeroRoleUserCount = 0`, `requiresConfirmation = false`.
3. **Affected User Count**:
   - If there is a delta and matching members exist, `affectedUserCount = materializedMembers.length`.
4. **Zero-Role User Count**:
   - If `removedRoleIds.length > 0` and `affectedUserCount > 0`, identify which of these employees would have 0 total active effective roles across all their user groups.
   - Evaluated via optimized SQL/Query: count employees in `user_effective_roles` whose only source of roles is the current user group (or specific removed roles), or checking if user has any other active groups with assigned roles.
5. **High-Impact Threshold Check**:
   - Compare `affectedUserCount >= HIGH_IMPACT_THRESHOLD` (default 100).
   - If threshold exceeded, `requiresConfirmation = true`.

### Rationale
- Meets `AUTHZ-005`, `AUTHZ-015`, `FEAT-AUTHZ-10` requirements for pre-commit blast radius visibility.
- Strictly read-only estimation (ADR-A13) — performs zero DB writes, zero Redis mutations, and zero sync job triggers.

### Alternatives Considered
- *Triggering a dry-run sync*: Rejected because dry-run sync is heavy, touches projection tables/transactions, and violates ADR-A13 read-only isolation.

---

## 3. Transactional Outbox & Dirty State Boundary

### Decision
In `UserGroupRoleAssignmentService`:
1. Optimistic locking verification: `user_groups.version === command.expectedVersion`.
2. Target roles validation: all `role_ids` exist, are `ACTIVE`, and belong to `tenant_code`.
3. High-impact confirmation check: if `requiresConfirmation === true` and `command.confirmed !== true`, throw `HighImpactConfirmationRequiredError` (HTTP 422).
4. In a single PostgreSQL transaction (`READ COMMITTED`):
   - Delete removed rows from `user_group_roles`.
   - Insert newly added rows into `user_group_roles`.
   - Update `user_groups.version = version + 1`, leave `projection_version` unchanged (marking group `PENDING` sync).
   - Persist audit event (`user_group.roles_assigned` / `user_group.role_unassigned`) and domain event `authorization.user-group-updated` into `auth_security_events_outbox`.
5. Return updated group role list with new version.

### Rationale
- Adheres to ADR-A12/A13 and Constitution §2: Role assignment persists configuration dirty state and defers effective role recomputation to asynchronous reconciliation worker.
- Guarantees transactional atomicity across relational tables and outbox.

### Alternatives Considered
- *Synchronous update of `user_effective_roles`*: Violates ADR-A13 and architecture rules for dynamic user group reconciliation.

---

## 4. REST Controller & API Contract Design

### Decision
Implement `UserGroupRoleController` mounted under `/user-groups/:id/roles`:
- `GET /user-groups/:id/roles`: Returns list of assigned roles with metadata (`id`, `name`, `type`, `description`, `capabilityCount`, `createdAt`). Guarded with `@RequirePermissions('user_group.read')` or `user_group.view`.
- `POST /user-groups/:id/roles/impact-estimate`: Accepts `{ roleIds: string[] }`, returns `{ affectedUserCount, zeroRoleUserCount, requiresConfirmation, threshold }`.
- `PUT /user-groups/:id/roles`: Accepts `{ roleIds: string[], expectedVersion: number, confirmed?: boolean }`. Guarded with `@RequirePermissions('user_group.update')`.

### Rationale
- Follows RESTful naming standards in Constitution §6.
- Thin controller delegating directly to application and query services.

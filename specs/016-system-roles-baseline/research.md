# Research & Architectural Decisions: System Roles Baseline & Protection

**Feature Branch**: `016-system-roles-baseline` | **Date**: 2026-08-25

## 1. System Role Definition & Static Templates

### Decision
Define standard platform System Role templates in code/constants (`SystemRoleTemplate`) within `RoleModule`. The templates define:
- `EMPLOYEE`: Key `EMPLOYEE`, Default Name: `Employee`, Protected Permissions: `employee.view`, `location.view`, `department.view`, etc.
- `MANAGER`: Key `MANAGER`, Default Name: `Manager`, Protected Permissions: `employee.view`, `direct_report.view`, `leave_request.approve`, etc.
- `ADMINISTRATOR`: Key `ADMINISTRATOR`, Default Name: `Built-in Administrator`, Protected Permissions: `role.read`, `role.manage`, `user.manage`, `permission.view`, etc.

### Rationale
- Align with PRD §5.3, AUTHZ-004, and ADR §6.1-§6.3.
- Defining templates in platform configuration guarantees that System Roles seeded across all tenants have identical baseline capabilities.
- Non-protected default capabilities can be extended or removed, while protected capabilities (`is_protected = true`) remain strictly inviolable.

### Alternatives Considered
- *Database-driven template table*: Overcomplicates provisioning with cross-tenant table queries. In-code static definitions guarantee consistency with the in-memory Permission Catalog (Feature 015).

---

## 2. Inviolable Protected Capability Locking & Rejection Auditing

### Decision
Enforce domain invariant inside `RoleAggregate` and `RoleApplicationService`:
1. When a role update is requested, compare requested permission codes with current `role_permissions` where `is_protected = true`.
2. If any protected capability code is missing from the requested payload, throw `ProtectedCapabilityRemovalException` (HTTP 422).
3. Concurrently record a security audit violation in `auth_security_events_outbox` with action `role.protected-capability-violation`, containing actor details, tenant code, target role ID, omitted capability codes, and timestamp.
4. Block deactivation or status changes for critical System Roles (e.g., `ADMINISTRATOR`).

### Rationale
- Server-side domain invariant enforcement guarantees that client tampering or UI bypass cannot strip protected access.
- Capturing violation attempts in the transactional outbox ensures zero audit record loss.

### Alternatives Considered
- *Silently re-adding protected permissions without throwing error*: Unintuitive for API clients and hides misconfigurations. Explicit rejection with explanatory error messages provides clear feedback and enforces security policies.

---

## 3. Extension with Non-Protected Capabilities & Dependency Validation

### Decision
Allow tenant administrators to add non-protected capabilities (`is_protected = false`) to System Roles. Before persisting:
1. Pass the complete requested permission set to `PermissionDependencyService.validatePermissionSet()` (from `PermissionCatalogModule`).
2. Reject if any prerequisite is missing or if dependent retention rules are violated.
3. Calculate user impact count (`SELECT COUNT(DISTINCT user_id) FROM user_effective_roles WHERE role_id = :roleId`); if above high-impact threshold and unconfirmed, return impact estimation before commit.
4. Synchronously refresh Redis cache `authz:role:{tenant}:{roleId}` post-commit.

### Rationale
- Reuses the DAG validation engine built in Feature 015.
- Complies with ADR-A12: Synchronous cache updates update the role-level key without triggering expensive mass recalculations of individual user keys.

---

## 4. Tenant Display Renaming & Isolation

### Decision
Expose endpoint `PATCH /roles/:roleId/rename` (or `PUT /roles/:roleId`):
- Permits updating `roles.name` and `roles.description`.
- Checks for name uniqueness within the tenant scope (`tenant_code`).
- Strictly preserves `system_role_key`, `type`, and `role_permissions`.
- Records audit action `role.renamed` in transactional outbox.

### Rationale
- Allows tenants to adapt terminology (e.g., "Employee" -> "Staff Member") while retaining system-level references and security controls.

# Feature Specification: Multi-Group Cumulative Access Evaluation

**Feature Branch**: `023-multi-group-cumulative-access-evaluation`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "Feature: Multi-Group Cumulative Access Evaluation - Resolve and enforce effective permissions and scopes for employees holding multiple responsibilities across different User Groups, as the strictly cumulative (additive) union of all assigned Roles and Scopes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Multi-Group Additive Permission & Scope Evaluation (Priority: P1)

As an employee assigned to multiple user groups (e.g., holding standard employee self-service in Group A and manager responsibilities in Group B), I want the system to grant me the cumulative union of all permissions and bounded scopes across all my matched groups so that I can perform all authorized actions across my assigned organizational units without permission fragmentation or access conflicts.

**Why this priority**: Core access evaluation model for multi-responsibility employees. Ensures seamless operations without artificial single-group constraints.

**Independent Test**: Can be fully tested by assigning a user to two distinct user groups (e.g., `EMPLOYEE` with `SELF` scope and `MANAGER` with `DIRECT_REPORTEES` scope) and verifying that the user can access both their own profile and their direct reports' records, while being denied access to unrelated peers.

**Acceptance Scenarios**:

1. **Given** an employee matching User Group A (Role: `Employee`, Scope: `SELF`) and User Group B (Role: `Manager`, Scope: `DIRECT_REPORTEES`), **When** effective permissions are evaluated, **Then** the employee receives the union of permissions from both roles.
2. **Given** an employee holding permission `employee.view` via both `DIRECT_REPORTEES` scope and `COMPANY` scope (e.g., Company Singapore), **When** requesting employee records, **Then** effective reach includes direct reportees across any entity plus all employees within Company Singapore.
3. **Given** an employee holding permission `employee.view` via `COMPANY (Singapore)` from Group A and `LOCATION (Berlin)` from Group B, **When** evaluating access to a record in Berlin belonging to a different company, **Then** the request is authorized because at least one granting scope is satisfied (logical OR).

---

### User Story 2 - Group Unassignment and Partial Scope Revocation (Priority: P2)

As a security/tenant administrator or automated sync job modifying employee attributes, when an employee stops matching a specific user group, I want the system to revoke only that group's associated roles and scopes while retaining all other active group assignments so that the employee's remaining legitimate access is preserved uninterrupted.

**Why this priority**: Critical for identity lifecycle governance and principle of least privilege, preventing total access lockout when only one responsibility changes.

**Independent Test**: Can be tested by removing a user from one of two matched groups and verifying that only the unassigned group's permissions/scopes are revoked, leaving the remaining group's capabilities fully functional.

**Acceptance Scenarios**:

1. **Given** an employee matching Group A (`Employee`) and Group B (`Manager`), **When** the employee ceases to match Group B and access is synchronized, **Then** the `Manager` role and `DIRECT_REPORTEES` scope are revoked while the `Employee` role and `SELF` scope remain active.
2. **Given** an employee matching zero active user groups, **When** effective access is evaluated, **Then** all effective role and scope records are cleared, and any protected request is rejected.

---

### User Story 3 - Post-Login Session Bootstrap for Multi-Group Capabilities (Priority: P3)

As a frontend client application bootstrapping after employee authentication, I want to retrieve the employee's combined cumulative permissions, navigation modules, and current authorization version in a single fast call so that the UI navigation and action controls can be rendered accurately without executing dynamic matching rules at runtime.

**Why this priority**: Enables responsive frontend client bootstrap and navigation rendering based on pre-evaluated effective roles.

**Independent Test**: Can be tested by authenticating as a multi-group user and calling the bootstrap capabilities endpoint to verify that returned permissions and navigation modules represent the deduplicated union across all matched groups with the corresponding authorization version.

**Acceptance Scenarios**:

1. **Given** an authenticated user matching Group A (`employee.view`) and Group B (`leave.approve`), **When** requesting bootstrap capabilities, **Then** the system returns `['employee.view', 'leave.approve']`, authorized navigation modules derived from the catalog, and the current authorization version.
2. **Given** an authenticated user matching zero groups, **When** requesting bootstrap capabilities, **Then** the system returns empty permissions and empty modules with a successful response.

---

### Edge Cases

- **Zero Matched Groups**: When an employee matches no active user groups or all memberships are deactivated, the system must materialize zero effective roles, clear user authorization cache entries, and deny all access requests (fail-closed).
- **Overlapping Permissions with Differing Scopes**: When an employee is granted the same permission code from multiple roles with different scopes (e.g., `SELF`, `LOCATION`, `TENANT`), the access evaluator must compute the logical OR across all matching scopes, granting access if the target resource satisfies any one of the scopes.
- **Cache Miss & Recovery**: If the user authorization cache entry is absent or evicted, the system must transparently rebuild the user authorization profile from the database projection table before evaluating access.
- **Store / Infrastructure Outage**: If the authorization store (e.g., Redis) is unreachable or fails during runtime evaluation, the authorization guard must fail closed and return a service unavailable error (`AUTHZ_STORE_UNAVAILABLE`), preventing unauthorized bypass.
- **Tenant Context Cross-Talk**: Authorization checks must strictly enforce tenant boundaries such that user memberships or roles in Tenant A never grant access to resources in Tenant B.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST compute and persist the materialized multi-group cumulative Role and Scope assignments for each user whenever group memberships or group role bindings change.
- **FR-002**: System MUST support bounded scope types including `SELF`, `DIRECT_REPORTEES`, `COMPANY`, `LOCATION`, `DEPARTMENT`, and `TENANT`.
- **FR-003**: System MUST treat permissions and scopes across multiple User Groups as strictly cumulative (additive union).
- **FR-004**: System MUST evaluate target resource access by checking if the required permission is present in any assigned role and verifying that at least one granting scope satisfies the target resource attributes (logical OR union).
- **FR-005**: System MUST immediately remove only the specific group's roles and scopes when an employee stops matching that group, retaining all access from other active groups.
- **FR-006**: System MUST persist and synchronize an un-flattened user authorization profile containing roles, scopes, source group IDs, and a monotonic version number.
- **FR-007**: System MUST provide automatic cache recovery on cache miss by re-populating user authorization state from the materialized projection table.
- **FR-008**: System MUST provide a fast session bootstrap capabilities endpoint returning the deduplicated union of permissions, authorized modules derived from the permission catalog, and the user's authorization version.
- **FR-009**: System MUST enforce authorization in-process using local cache and request context, failing closed with a forbidden error when access is denied or a service unavailable error when authorization infrastructure is down.
- **FR-010**: System MUST strictly isolate authorization evaluation by tenant identifier on all database and cache operations.

### Key Entities *(include if feature involves data)*

- **User Effective Role (Projection)**: Materialized record linking a user within a tenant to a specific role, granting source group, and scope constraint (`scope_type`, `scope_ref_id`).
- **User Authorization Profile**: In-memory / cached representation of a user's un-flattened effective roles and scopes along with a monotonic version number for cache invalidation.
- **Scope Constraint**: Specification of the reach boundary (`SELF`, `DIRECT_REPORTEES`, `COMPANY`, `LOCATION`, `DEPARTMENT`, `TENANT`) and optional reference identifier (e.g., specific company or location ID).
- **Bootstrap Capabilities**: Post-login view model containing deduplicated permissions, authorized navigation modules, assigned role names, and authorization version.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Runtime authorization guard evaluations complete in under 5 milliseconds for 95% of incoming requests.
- **SC-002**: Materialized projection updates synchronize to authorization cache with 100% data consistency and monotonic version incrementation.
- **SC-003**: Multi-group permission and scope evaluations achieve 100% accuracy across cumulative union test matrices without permission leakage or unintended denial.
- **SC-004**: Zero-group or de-provisioned users are rejected with 100% reliability across all protected endpoints.
- **SC-005**: Bootstrap capabilities endpoint resolves cumulative permissions and navigation modules without querying dynamic matching rules or database group membership tables.

## Assumptions

- Permission catalog definitions (`resource.action`) and role-permission mappings are pre-defined or managed via existing role management modules.
- User group membership changes and attribute updates trigger projection recalculation asynchronously or during synchronous update flows.
- Request contexts provide authenticated user identity, tenant identifier, and employee reference attributes necessary for scope evaluation.
- Bounded scope evaluation for hierarchical entities (e.g., direct reportees) relies on reporting line data available within the evaluation context.

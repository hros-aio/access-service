# Feature Specification: Custom Role Lifecycle Management

**Feature Branch**: `017-custom-roles`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Feature: Custom Role Lifecycle Management. Objective: Provide complete lifecycle management for tenant-defined Custom Roles (creation from scratch, creation by copying, updating metadata and permissions, viewing with unassigned indicators, deactivation, and reactivation) without engineering intervention, while strictly isolating tenant configurations, enforcing capability prerequisites, and synchronizing changes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Custom Role from Scratch (Priority: P1)

Tenant administrators need to create custom organizational roles tailored to their company's specific job functions (e.g., "HR Specialist", "Payroll Auditor") and assign a set of permissions that satisfy platform prerequisite capability rules, ensuring least-privilege access without manual developer intervention.

**Why this priority**: Core value driver enabling tenant autonomy and role-based access delegation. Without creation, no custom role lifecycle exists.

**Independent Test**: An administrator can submit a new unique role name with valid permissions and confirm the role is created in active status, listable within their tenant, and immediately available for user group assignment.

**Acceptance Scenarios**:

1. **Given** a tenant administrator with valid authorization context, **When** they provide a unique role name (e.g., "HR Specialist"), an optional description, and a valid set of permissions where all prerequisite capabilities are satisfied (e.g., `employee.view` included when `employee.update` is requested), **Then** a new active Custom Role is created with version 1, listed in tenant role queries, and its permission definition is immediately cached.
2. **Given** a role creation request containing a permission whose prerequisite capability is missing (e.g., `employee.update` without `employee.view`), **When** creation is submitted, **Then** the request is rejected with a clear explanation of the missing prerequisite capability.
3. **Given** an existing active or inactive role with the name "HR Specialist" in Tenant A, **When** an administrator in Tenant A attempts to create another role named "HR Specialist", **Then** the request is rejected due to a duplicate role name conflict within the tenant.
4. **Given** an existing role named "HR Specialist" in Tenant B, **When** an administrator in Tenant A creates a role named "HR Specialist", **Then** the creation succeeds, confirming tenant boundary isolation.

---

### User Story 2 - Clone / Copy Existing Role (Priority: P2)

Administrators need to duplicate an existing System Role (such as "Built-in Administrator" or "Manager") or an existing Custom Role to rapidly create new specialized roles without starting from scratch, while ensuring that any inviolable protected capabilities from System Roles are decoupled and unlocked for customization in the new copy.

**Why this priority**: Accelerates administrative setup and configuration, reducing time to provision customized functional variants of baseline roles while upholding security boundaries.

**Independent Test**: An administrator can select an existing System Role with protected permissions, copy it to a new custom name, and verify that the resulting role is an independent Custom Role whose permissions can be freely modified.

**Acceptance Scenarios**:

1. **Given** an existing System Role containing permissions marked as protected (`is_protected = TRUE`), **When** an administrator copies it to a new unique role name (e.g., "Custom Admin"), **Then** a new independent Custom Role is created where all granted permissions have their protected status reset to unlocked (`is_protected = FALSE`), with no persistent inheritance link to the source role.
2. **Given** a role belonging to Tenant B, **When** an administrator from Tenant A attempts to copy it by ID, **Then** the system returns an access denied or not found error, preventing cross-tenant visibility.
3. **Given** a copy request where the target role name already exists in the same tenant, **When** the copy operation is executed, **Then** the request is rejected with a name conflict error.

---

### User Story 3 - Modify Role Details and Permissions with Impact Safeguards (Priority: P2)

Administrators need to update metadata (name, description) and adjust permission sets (granting or revoking capabilities) on existing Custom Roles, receiving pre-commit visibility into how many active users will be affected, while preventing concurrent update collisions and immediately synchronizing changes to active sessions.

**Why this priority**: Roles evolve as job responsibilities change; administrative agility requires safe permission editing with immediate enforcement and concurrency protection.

**Independent Test**: An administrator can estimate impact, submit updated permissions with a matching version token, observe the version increment, and verify that capability dependencies are validated.

**Acceptance Scenarios**:

1. **Given** an existing Custom Role assigned to User Groups with active users, **When** an administrator requests an impact estimation for a permission change, **Then** the system returns the exact count of unique active users affected across all associated user groups.
2. **Given** a Custom Role at version 2, **When** an administrator submits an update with version 2, **Then** the role details and permissions are updated, the version increments to 3, the updated definition is immediately synchronized across the system, and audit records are generated.
3. **Given** two administrators editing the same Custom Role concurrently, **When** Administrator B attempts to submit changes using an outdated version token, **Then** the update is rejected with a concurrency conflict error, requiring Administrator B to reload current state.
4. **Given** an update that attempts to remove a prerequisite capability while retaining a dependent capability (e.g., removing `location.view` while keeping `location.update`), **When** submitted, **Then** the update is rejected with a dependency validation error.
5. **Given** an existing System Role, **When** an administrator attempts to modify its metadata or permissions via custom role update endpoints, **Then** the modification is rejected.

---

### User Story 4 - Custom Role Deactivation and Reactivation (Priority: P3)

Administrators need to deactivate obsolete or unused Custom Roles to instantly stop associated capability delivery while preserving full historical audit logs, with warning guards when deactivating roles currently assigned to user groups, and the ability to reactivate them later if needed.

**Why this priority**: Ensures governance, security containment, and audit continuity without permanently destroying historical authorization data.

**Independent Test**: An administrator can deactivate an assigned role with explicit confirmation, verify that users immediately lose capabilities, and reactivate the role to restore functionality.

**Acceptance Scenarios**:

1. **Given** an active Custom Role assigned to one or more User Groups, **When** deactivation is requested without confirmation, **Then** the system returns the count of affected user groups and active users, requiring explicit administrative acknowledgment.
2. **Given** an active Custom Role and a valid confirmation acknowledgment, **When** deactivation is executed, **Then** the role status transitions to inactive, its version increments, active capability lookups immediately reflect the deactivation, and an immutable audit event is recorded.
3. **Given** a deactivated Custom Role, **When** an administrator reactivates the role, **Then** the role status returns to active, its version increments, and its permissions are restored for assignment and evaluation.

---

### User Story 5 - Role Listing, Inspection, and Unassigned Badging (Priority: P3)

Administrators need to view a comprehensive list of all roles (System and Custom) within their tenant, inspect role details and permission sets, and easily identify unused custom roles (badged with an "unassigned" status) along with active user reach counts to maintain a clean role catalog.

**Why this priority**: Provides operational visibility for identity governance, role cleanup, and compliance audits.

**Independent Test**: An administrator queries the role catalog and sees accurate indicators for unassigned status, active user reach counts, and protection status of each permission.

**Acceptance Scenarios**:

1. **Given** a Custom Role that is not mapped to any User Group, **When** an administrator views the role list or details, **Then** the role is marked with `is_unassigned: true` and an active user reach count of 0.
2. **Given** a Custom Role mapped to two User Groups reaching 45 unique active employees, **When** an administrator views the role details, **Then** the role reflects `is_unassigned: false` and an active user reach count of 45.
3. **Given** an administrator querying roles in Tenant A, **When** the list or details are fetched, **Then** only roles belonging to Tenant A (or universal system roles) are visible, and no Tenant B data is accessible.

---

### Edge Cases

- **Concurrent Mutation Collisions**: When two administrators update or deactivate the same role simultaneously, optimistic concurrency control via entity versioning must reject the second update cleanly with a conflict error.
- **System Role Protection Reset during Copy**: When copying a System Role with inviolable protected permissions (`is_protected = TRUE`), the copied Custom Role must explicitly reset all permissions to unlocked (`is_protected = FALSE`) and clear system identifiers, ensuring no unintended privilege locks in custom definitions.
- **Deep Prerequisite Capability Chains**: When assigning complex permissions with multi-level dependencies (e.g., `payroll.process` -> `payroll.update` -> `payroll.view`), the validation engine must ensure all transitive prerequisites are present in the role's permission set.
- **High-Impact Blast Radius Protection**: When a role update or deactivation affects a large number of active users, pre-commit blast-radius evaluation must quantify the impact and require explicit confirmation.
- **Preservation of Audit Continuity**: Custom roles must never be hard-deleted from the database; status transitions (`ACTIVE` <-> `INACTIVE`) preserve historical integrity for audit reports.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow tenant administrators to create new active Custom Roles by specifying a unique name within the tenant, an optional description, and a list of valid platform permission codes.
- **FR-002**: System MUST validate that all requested permission codes exist in the platform permission catalog and that all prerequisite capabilities (e.g., read/view capabilities required for write/update/delete capabilities) are satisfied in the requested permission set.
- **FR-003**: System MUST reject custom role creation or update requests that contain invalid, deprecated, or prerequisite-violating permission sets with descriptive error details.
- **FR-004**: System MUST enforce case-insensitive uniqueness of role names per tenant, rejecting duplicate names within the same tenant while permitting identical names across different tenants.
- **FR-005**: System MUST allow administrators to copy any existing System or Custom Role to create a new Custom Role, cloning its permission set while explicitly setting all permissions to unlocked (`is_protected = FALSE`) and clearing system-specific role keys.
- **FR-006**: System MUST ensure that copied roles are completely decoupled from their source role, with no persistent inheritance or synchronization link.
- **FR-007**: System MUST allow administrators to update metadata (name, description) and modify granted permissions on existing Custom Roles, while preventing modification of System Roles through custom role endpoints.
- **FR-008**: System MUST enforce optimistic concurrency control on all role modifications, incrementing the version upon successful update and rejecting updates containing outdated version tokens.
- **FR-009**: System MUST provide a pre-commit impact estimation capability that calculates the count of unique active users and user groups currently reaching a given role.
- **FR-010**: System MUST allow administrators to deactivate an active Custom Role, transitioning its status to inactive and immediately revoking capability evaluation across the system without hard-deleting records.
- **FR-011**: System MUST require explicit administrative confirmation before deactivating a Custom Role that is currently assigned to one or more active User Groups.
- **FR-012**: System MUST allow administrators to reactivate a previously deactivated Custom Role, restoring its status to active and making it available for assignment and capability evaluation.
- **FR-013**: System MUST provide role listing and inspection capabilities that return role metadata, status, permission lists (with protection flags), unassigned badges (`is_unassigned: true` when assigned to 0 User Groups), and active user reach counts.
- **FR-014**: System MUST strictly isolate all role operations, queries, and mutations to the authenticated tenant context.
- **FR-015**: System MUST record immutable security audit events (role created, copied, updated, deactivated, reactivated) in the transactional outbox for every lifecycle mutation within the same database transaction.
- **FR-016**: System MUST synchronously propagate role definition changes and deactivations to the authorization cache upon transaction commit, ensuring immediate enforcement without requiring mass-user projection table rebuilds.

### Key Entities *(include if feature involves data)*

- **Role**: Represents a named collection of permissions within a tenant. Contains attributes such as unique identifier, tenant code, name, description, role type (`SYSTEM` or `CUSTOM`), system role key (for built-in roles), lifecycle status (`ACTIVE` or `INACTIVE`), and version counter for optimistic locking.
- **Role Permission**: Join entity mapping a granted permission code from the platform catalog to a specific role, including a protection flag (`is_protected`) indicating whether the permission is locked from administrative modification.
- **User Group Role**: Association linking a role to a User Group, establishing the set of capabilities granted to members matching that group's criteria.
- **User Effective Role**: Materialized projection associating individual users with their assigned roles, used for fast reach calculations and impact estimation.
- **Security Audit Event**: Outbox record capturing security-critical lifecycle operations (`role.created`, `role.updated`, `role.deactivated`, `role.reactivated`, `role.copied`) with actor metadata and timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tenant administrators can create, copy, or update custom roles end-to-end in under 5 seconds without engineering support.
- **SC-002**: 100% of permission capability prerequisite violations are intercepted and rejected before persistence, guaranteeing zero broken capability states.
- **SC-003**: 100% of copied roles have their permission protection flags reset to unlocked (`is_protected = FALSE`), preventing accidental privilege locking.
- **SC-004**: Role permission updates and deactivations take effect in active authorization checks within 500 milliseconds of transaction commit across all active sessions.
- **SC-005**: 100% of role lifecycle mutations generate corresponding immutable audit events in the transactional outbox.
- **SC-006**: Zero cross-tenant data leakage or mutation across all role management operations.
- **SC-007**: 100% of concurrent update collisions are cleanly detected and handled via optimistic concurrency without data corruption.

## Assumptions

- **Permission Catalog Availability**: Platform-defined permissions and their capability dependency directed acyclic graph (DAG) are managed by the core platform permission catalog and accessible for in-memory dependency validation.
- **Tenant Context Resolution**: Every incoming administrative request contains a validated tenant context and appropriate administrative authorization claims.
- **Decoupled Role Copies**: As per architectural standards, copied roles are independent standalone entities and do not track or synchronize with their source role after creation.
- **Role Quotas**: No tenant-level quota on the total number of custom roles is enforced in this phase.
- **Audit Immutability**: All role lifecycle mutations are permanent from an audit perspective; deactivations preserve full entity and event history for compliance reporting.

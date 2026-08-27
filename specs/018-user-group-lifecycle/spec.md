# Feature Specification: User Group Definition & Lifecycle

**Feature Branch**: `018-user-group-lifecycle`

**Created**: 2026-08-27

**Status**: Draft

**Input**: User description: "Backend Task Breakdown: User Group Definition & Lifecycle (FEAT-AUTHZ-04). Feature Objective: Provide complete lifecycle management for tenant-defined User Groups (creation, configuration, metadata updates, viewing summary/indicators, deactivation, and reactivation) to establish scalable employee populations mapped to roles without manual per-user provisioning."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Dynamic User Group with Scopes and Matching Rules (Priority: P1)

Tenant administrators need to define dynamic User Groups with specific criteria (e.g., Department = Engineering AND Employment Status = Active) and assign platform roles with a defined target scope (e.g., Company, Location, Department, Tenant-wide, Self, Direct Reportees) so that employees matching these criteria automatically receive corresponding role permissions without manual per-user assignments.

**Why this priority**: Core foundation of role-based access management and automated access provisioning across populations.

**Independent Test**: An administrator creates a user group with valid matching criteria, valid scope, and optional roles, verifying that the group is created in an active state, tagged as pending initial access synchronization, and stored with tenant isolation.

**Acceptance Scenarios**:

1. **Given** an authenticated administrator with valid tenant context, **When** they submit a unique group name (e.g., "Engineering Leads"), an optional description, a valid scope configuration, valid dynamic matching criteria (using supported employee attributes and AND-only logic), and assigned roles, **Then** the user group is created in `ACTIVE` status with version 1, marked as pending synchronization (`version > projection_version`), and an immutable audit event is recorded.
2. **Given** a user group creation request with no assigned roles (draft state), **When** submitted, **Then** the group is successfully created in `ACTIVE` status without granting any capabilities, and is flagged with a zero-roles indicator.
3. **Given** an existing User Group named "Finance Staff" in Tenant A, **When** an administrator in Tenant A attempts to create another User Group named "Finance Staff", **Then** the request is rejected with a duplicate name conflict error.
4. **Given** an existing User Group named "Finance Staff" in Tenant A, **When** an administrator in Tenant B creates a User Group named "Finance Staff", **Then** creation succeeds, confirming tenant boundary isolation.
5. **Given** a creation request containing invalid or disallowed matching rule attributes (e.g., unsupported custom attributes or nested OR clauses), **When** submitted, **Then** validation fails with a descriptive rule validation error.

---

### User Story 2 - Modify User Group Configuration and Roles (Priority: P2)

Administrators need to update group metadata (name, description), dynamic matching criteria, scope configuration, and assigned roles as organizational requirements evolve, while preventing concurrent edit collisions and flagging the group for background access recalculation.

**Why this priority**: Business restructuring and role requirement shifts require groups to be updated safely with concurrency protection and explicit change tracking.

**Independent Test**: An administrator modifies a user group with an expected version token, observing that the version increments, the group is flagged as pending sync, and concurrent requests with stale version tokens are rejected.

**Acceptance Scenarios**:

1. **Given** an existing User Group at version 1, **When** an administrator submits an update with expected version 1 altering matching criteria or role assignments, **Then** the group configuration is updated, the version increments to 2, the group is marked as pending synchronization (`version > projection_version`), and an audit log is recorded.
2. **Given** two administrators editing the same User Group simultaneously at version 1, **When** Administrator B submits an update after Administrator A has already committed version 2, **Then** Administrator B's update is rejected with a concurrency conflict error (409 Conflict), preserving state integrity.
3. **Given** an update that attempts to rename a User Group to a name that already exists in the same tenant, **When** submitted, **Then** the update is rejected with a duplicate name error.

---

### User Story 3 - User Group Deactivation and Reactivation (Priority: P2)

Administrators need to deactivate obsolete or temporarily suspended User Groups to stop capability delivery to all matching members upon synchronization without losing group definition history, and reactivate them later when needed.

**Why this priority**: Critical for security offboarding, reorganization, and audit continuity without destroying historical configuration data.

**Independent Test**: An administrator deactivates an active user group, confirming status changes to inactive and access is scheduled for revocation across members; subsequent reactivation restores active status and triggers re-synchronization.

**Acceptance Scenarios**:

1. **Given** an active User Group, **When** an administrator executes deactivation with the matching version token, **Then** the status transitions to `INACTIVE`, the version increments, the group is flagged dirty (`version > projection_version`) to schedule member access revocation, and an audit event (`user_group.deactivated`) is recorded.
2. **Given** an inactive User Group, **When** an administrator executes reactivation with the matching version token, **Then** the status transitions back to `ACTIVE`, the version increments, the group is flagged dirty for access re-synchronization, and an audit event (`user_group.reactivated`) is recorded.
3. **Given** an attempt to deactivate an already inactive User Group or reactivate an already active User Group, **When** submitted, **Then** the system rejects the operation with an invalid state transition error.

---

### User Story 4 - User Group Listing, Details Query, and Status Indicators (Priority: P3)

Administrators need to query and inspect user groups within their tenant, view detailed configuration, identify draft/zero-role groups, and monitor synchronization status indicators (`isPendingSync`).

**Why this priority**: Essential for administrative visibility, compliance monitoring, and identifying unconfigured/dirty user groups.

**Independent Test**: An administrator fetches the list of tenant user groups and specific group details, observing accurate indicators for draft state (`hasNoAssignedRoles: true`) and pending synchronization (`isPendingSync: true`).

**Acceptance Scenarios**:

1. **Given** user groups belonging to Tenant A, **When** an administrator from Tenant A lists user groups, **Then** only Tenant A groups are returned, supporting filtering by status (`ACTIVE`, `INACTIVE`) and search by name.
2. **Given** a User Group created with zero assigned roles, **When** fetched via group details or summary list, **Then** the group reflects `hasNoAssignedRoles: true` with an empty role list.
3. **Given** a User Group with saved modifications where `version > projection_version`, **When** queried, **Then** the response reflects `isPendingSync: true`.
4. **Given** an administrator authenticated under Tenant A, **When** attempting to fetch a user group ID belonging to Tenant B, **Then** the system returns a 404 Not Found response, preserving tenant data privacy.

---

### Edge Cases

- **Concurrent Lifecycle and Mutation Conflicts**: When two administrators update or toggle lifecycle state on the same group simultaneously, optimistic concurrency control via entity versioning must reject stale writes cleanly.
- **Draft User Groups with No Roles**: A group with no assigned roles is valid for draft setup but delivers no permissions to any matching users; the system must clearly badge this state without throwing validation errors.
- **Asynchronous Synchronization Boundary**: Modifying, deactivating, or reactivating a user group does not immediately rewrite member permissions inline during the HTTP request; it reliably marks the group dirty (`version > projection_version`) and emits an outbox event for background worker reconciliation.
- **Closed Matching Attribute Schema**: The rule engine strictly rejects any attribute key outside the platform allow-list (e.g. `salary`, `ssn`) to prevent injection and guarantee predictable background evaluation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow tenant administrators to create new User Groups by specifying a unique name within the tenant, an optional description, matching criteria, a scope configuration, and optional assigned roles.
- **FR-002**: System MUST validate dynamic matching rules against a closed allow-list of employee attributes (`employmentStatus`, `companyId`, `locationId`, `departmentId`, `gradeId`, `jobTitleId`, `reporteesCount`, `hasReportees`) using logical "AND" structure only.
- **FR-003**: System MUST extract distinct attribute keys referenced in matching rules into a dedicated index array (`rule_attribute_keys`) upon creation and update.
- **FR-004**: System MUST enforce that each User Group is configured with exactly one valid `scope_type` (`SELF`, `DIRECT_REPORTEES`, `COMPANY`, `LOCATION`, `DEPARTMENT`, `TENANT_WIDE`) with an optional scope reference identifier.
- **FR-005**: System MUST permit user groups to be saved with zero assigned roles, treating them as draft configurations that grant no capabilities.
- **FR-006**: System MUST enforce tenant-scoped case-insensitive uniqueness of User Group names, rejecting duplicate names within the same tenant while allowing identical names across different tenants.
- **FR-007**: System MUST support updating User Group metadata, matching rules, scope, and assigned role associations.
- **FR-008**: System MUST enforce optimistic concurrency control on all User Group mutations, verifying expected version tokens and incrementing the entity `version` on change.
- **FR-009**: System MUST track synchronization state by incrementing `version` beyond `projection_version` upon every configuration or lifecycle mutation, indicating a dirty state (`version > projection_version`) for asynchronous worker reconciliation.
- **FR-010**: System MUST allow administrators to deactivate an active User Group, transitioning its status to `INACTIVE`, incrementing `version`, and scheduling access revocation across members.
- **FR-011**: System MUST allow administrators to reactivate an inactive User Group, transitioning its status to `ACTIVE`, incrementing `version`, and scheduling access re-synchronization.
- **FR-012**: System MUST provide paginated listing and detail query endpoints for User Groups scoped strictly to the authenticated tenant, returning metadata, assigned roles, scope, `hasNoAssignedRoles` indicator, and `isPendingSync` dirty-state flag.
- **FR-013**: System MUST record immutable security audit entries in the transactional outbox (`user_group.created`, `user_group.updated`, `user_group.deactivated`, `user_group.reactivated`) within the same database transaction as the group mutation.
- **FR-014**: System MUST emit `authorization.user-group-updated` events via the transactional outbox to notify downstream workers of group modifications.
- **FR-015**: System MUST prevent inline synchronous dynamic rule evaluation or materialized membership recalculation during HTTP mutation requests.

### Key Entities *(include if feature involves data)*

- **User Group**: Aggregate root representing a dynamic population definition within a tenant. Contains attributes: `id`, `tenant_code`, `name`, `description`, `status` (`ACTIVE`, `INACTIVE`), `scope_type`, `scope_ref_id`, `matching_rule` (JSON criteria), `rule_attribute_keys` (indexed attribute keys array), `version` (optimistic lock & mutation counter), `projection_version` (last synchronized version counter), and audit timestamps.
- **User Group Role**: Association mapping a User Group to an assigned platform `Role` (`id`, `tenant_code`, `user_group_id`, `role_id`, `created_at`).
- **Security Audit Event**: Outbox record capturing lifecycle actions (`user_group.created`, `user_group.updated`, `user_group.deactivated`, `user_group.reactivated`) with actor context, version, and before/after state snapshots.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tenant administrators can create, update, deactivate, or reactivate user groups end-to-end in under 2 seconds.
- **SC-002**: 100% of user group mutations enforce tenant isolation with zero cross-tenant read or write access.
- **SC-003**: 100% of invalid matching rule criteria or unlisted attribute keys are rejected at validation time before database persistence.
- **SC-004**: 100% of concurrent modification collisions are detected and rejected via optimistic concurrency version tokens without data corruption.
- **SC-005**: 100% of user group mutations generate corresponding atomic outbox audit events within the primary database transaction.
- **SC-006**: 100% of saved group mutations correctly reflect dirty state (`isPendingSync = true` when `version > projection_version`) until downstream synchronization completes.

## Assumptions

- **Tenant Isolation**: Every administrative request contains a validated tenant identifier in the execution context, preventing cross-tenant leakage.
- **Asynchronous Membership Rebuild**: Physical recalculation of employee memberships (`user_group_memberships`) and effective roles is handled asynchronously by the background synchronization worker (`FEAT-AUTHZ-11`/`FEAT-AUTHZ-12`) and is decoupled from synchronous lifecycle HTTP requests.
- **Role Existence**: Assigned roles must exist in the tenant's role catalog prior to assignment.
- **Quotas**: Tier-based quotas on the maximum number of user groups per tenant are not enforced at the schema layer and may be configured in application business checks if required.

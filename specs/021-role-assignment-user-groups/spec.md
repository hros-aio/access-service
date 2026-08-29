# Feature Specification: Role Assignment to User Groups

**Feature Branch**: `021-role-assignment-user-groups`

**Created**: 2026-08-29

**Status**: Ready for Planning

**Input**: User description: "Role Assignment to User Groups - Enable tenant administrators to assign and unassign one or more platform Roles to a User Group in a many-to-many relationship. Assignment changes mark the group configuration as pending synchronization (PENDING), and matching group members cumulatively gain or lose access within the group's scope once synchronization runs."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Assign and Unassign Roles on a User Group (Priority: P1)

As a Tenant Administrator, I want to assign and unassign platform Roles to a User Group in a many-to-many relationship so that employees who match the group's criteria inherit the necessary capabilities and permissions according to the group's designated scope.

**Why this priority**: Core access management foundation (`AUTHZ-013`, `AUTHZ-009`, `FEAT-AUTHZ-07`). Without the ability to link Roles to User Groups, role-based access control cannot be provisioned to employee populations.

**Independent Test**: Can be fully tested by assigning a valid set of Roles to an existing User Group, verifying that associations are persisted in the `user_group_roles` join table, the group version counter is incremented, and security audit events are recorded.

**Acceptance Scenarios**:

1. **Given** an existing User Group with version 2 and two active Roles ("Role A", "Role B"), **When** an administrator updates the group's assigned roles to `["Role A", "Role B"]`, **Then** both role mappings are stored, the group `version` increments to 3 while `projection_version` remains 2 (marking the group `PENDING` synchronization), and an audit record (`user_group.roles_assigned`) is persisted.
2. **Given** a User Group currently assigned `["Role A", "Role B"]`, **When** the administrator unassigns "Role B" by updating the assigned roles to `["Role A"]`, **Then** the association for "Role B" is removed from the join table, the catalog definition of "Role B" remains intact and active in the tenant catalog, and an audit record (`user_group.role_unassigned`) is persisted.
3. **Given** an administrator clearing all roles on a User Group, **When** updating with an empty list `[]`, **Then** all previous role associations for the group are deleted, the group version increments, and the group enters `PENDING` synchronization with 0 assigned roles.
4. **Given** an administrator attempting to assign a Role that belongs to another tenant or does not exist, **When** the request is submitted, **Then** the system rejects the operation with HTTP 404 Not Found without modifying any database records.
5. **Given** an administrator attempting to assign an `INACTIVE` Role, **When** the request is submitted, **Then** the system rejects the operation with a business validation error (HTTP 422/400).
6. **Given** two concurrent administrators modifying the same User Group's role assignments, **When** Administrator B submits with a stale `expectedVersion`, **Then** the request is rejected with a conflict error (HTTP 409 Concurrent Modification) and zero changes are applied.

---

### User Story 2 - Pre-Commit Blast Radius & Impact Estimation (Priority: P2)

As a Tenant Administrator editing role assignments on a User Group, I want to see an impact estimate before committing changes — including the number of affected employees and warnings for employees who would be left with zero total active roles — so that I can prevent unintended mass permission changes or access lockouts.

**Why this priority**: Administrative safety and governance requirement (`AUTHZ-005`, `AUTHZ-015`, `FEAT-AUTHZ-10`). Prevents catastrophic authorization misconfigurations by evaluating impact before changes are committed.

**Independent Test**: Can be fully tested by calling the impact estimation endpoint with a target set of role IDs on a group with materialized members, verifying that the computed affected user count, zero-role count, and confirmation flags match expected domain calculation without altering database state.

**Acceptance Scenarios**:

1. **Given** a User Group with 200 materialized members and a platform high-impact threshold of 100, **When** an administrator requests an impact estimate for changing roles, **Then** the system returns `affectedUserCount: 200` and `requiresConfirmation: true`.
2. **Given** a role unassignment that would result in 3 employees having zero total active effective roles across all their matching groups, **When** the impact is estimated, **Then** the system identifies `zeroRoleUserCount: 3` and flags the zero-role warning.
3. **Given** an administrator submitting an impact estimate with the identical set of already-assigned role IDs, **When** evaluated, **Then** the system returns `affectedUserCount: 0` and `requiresConfirmation: false`.
4. **Given** an impact estimation request, **When** the calculation completes, **Then** zero database records are mutated, no audit events are emitted, and no background synchronization tasks are spawned.

---

### User Story 3 - High-Impact Explicit Confirmation Gate (Priority: P3)

As a Security Officer / Compliance Auditor, I want the system to require explicit confirmation (`confirmed: true`) when persisting role assignment changes whose estimated blast radius exceeds the high-impact threshold, so that large-scale permission mutations are never executed unintentionally.

**Why this priority**: Defense-in-depth safety mechanism (`AUTHZ-005`, `FEAT-AUTHZ-10`). Ensures critical authorization changes are deliberately acknowledged by the administrator.

**Independent Test**: Can be fully tested by submitting a high-impact role assignment mutation with `confirmed: false` (or omitted), verifying that the transaction is rejected with HTTP 422, and then re-submitting with `confirmed: true`, verifying successful commit.

**Acceptance Scenarios**:

1. **Given** a role assignment update affecting 250 employees (threshold 100) submitted without `confirmed: true`, **When** the save endpoint is called, **Then** the request is rejected with HTTP 422 (`HighImpactConfirmationRequiredError`) and rolled back completely.
2. **Given** a high-impact update submitted with `confirmed: true` and valid `expectedVersion`, **When** the save endpoint is called, **Then** the changes are committed, the group version increments, and the outbox event is created.

---

### User Story 4 - View Assigned Roles on a User Group (Priority: P4)

As a Tenant Administrator inspecting a User Group, I want to retrieve all currently assigned Roles with their metadata (id, name, type, description, capability count, and creation date) so that I have complete visibility into the group's configured access profile.

**Why this priority**: Administrative inspection requirement (`AUTHZ-006`). Enables clear administrative visibility into configured access models.

**Independent Test**: Can be fully tested by querying the group roles endpoint, verifying that all associated active roles and their capability summaries are returned accurately with strict tenant isolation.

**Acceptance Scenarios**:

1. **Given** a User Group with 3 assigned roles, **When** an authorized administrator requests the assigned roles list, **Then** the system returns an HTTP 200 response with all 3 role items containing `id`, `name`, `type`, `description`, `capabilityCount`, and `createdAt`.
2. **Given** a User Group with 0 assigned roles, **When** queried, **Then** the system returns `items: []` with HTTP 200.
3. **Given** an administrator from "TENANT_A" querying a User Group in "TENANT_B", **When** requested, **Then** the system returns HTTP 404 Not Found and leaks zero records.

---

### Edge Cases

- **Zero Matching Members**: When estimating impact or assigning roles to an empty group (0 materialized members), the system must compute `affectedUserCount: 0`, `zeroRoleUserCount: 0`, and allow normal persistence without errors.
- **Identical Role Set (No-op Edit)**: When an update is submitted with the exact same set of role IDs already assigned, the system must recognize no delta, compute zero impact, bump the version, and record the update idempotently.
- **Unassigning Roles Leaves User Roleless**: When unassigning a role removes the last remaining effective role for one or more users across the tenant, the system calculates `zeroRoleUserCount > 0` to alert the administrator before saving.
- **Deferred Materialization Boundary**: Role assignment mutations must strictly increment `user_groups.version` and leave `projection_version` untouched (dirty state). Direct synchronization of `user_effective_roles` or per-user Redis keys must NOT occur during the save transaction (handled asynchronously via Sync Now / Scheduled Reconciliation).
- **Role Retention Invariant**: Removing a role association from `user_group_roles` must NEVER delete, deactivate, or alter the `roles` entity in the catalog.
- **Cross-Tenant Guarding**: All inputs (`user_group_id` and all `role_ids`) must be validated against the caller's `tenant_code`. Any cross-tenant reference must result in immediate rejection with HTTP 404 Not Found.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow tenant administrators to assign, unassign, and replace platform Roles on a User Group in a many-to-many relationship.
- **FR-002**: System MUST validate that the target User Group exists, belongs to the caller's `tenant_code`, and matches the provided `expectedVersion` for optimistic concurrency control.
- **FR-003**: System MUST validate that all specified Role IDs exist, are in `ACTIVE` status, and belong to the caller's `tenant_code`.
- **FR-004**: System MUST calculate pre-commit impact estimation (`estimateRoleAssignmentImpact`) comparing current vs. target roles against materialized group members:
  - Total affected distinct users.
  - Users left with 0 total active effective roles.
  - Whether `affectedUserCount` meets or exceeds the platform high-impact threshold.
- **FR-005**: System MUST require explicit confirmation (`confirmed: true`) when the estimated affected user population exceeds the high-impact threshold, rejecting unconfirmed requests with HTTP 422.
- **FR-006**: System MUST persist role assignments atomically in a single database transaction:
  - Delete removed associations from `user_group_roles`.
  - Insert added associations into `user_group_roles`.
  - Increment `user_groups.version = version + 1` while preserving `projection_version` unchanged (marking the group dirty / `PENDING` sync).
  - Persist audit and domain events (`user_group.roles_assigned` / `user_group.role_unassigned`, `authorization.user-group-updated`) into `auth_security_events_outbox`.
- **FR-007**: System MUST NOT synchronously modify user effective roles (`user_effective_roles`) or per-user Redis caches upon saving role assignments.
- **FR-008**: System MUST preserve role definitions intact in the tenant catalog when unassigned from a User Group.
- **FR-009**: System MUST provide an authenticated read endpoint to list all Roles currently assigned to a specified User Group with metadata (`id`, `name`, `type`, `description`, `capabilityCount`, `createdAt`).
- **FR-010**: System MUST enforce strict tenant isolation on all read and write operations using the tenant context extracted from `RequestContext`.
- **FR-011**: System MUST require administrative capability `user_group.update` / `user_group.assign_roles` for mutating assignments and `user_group.view` (or `user_group.read`) for viewing assigned roles.

### Key Entities

- **User Group (`user_groups`)**: Aggregate root security container holding dynamic matching rules, scope, status, optimistic concurrency version (`version`), and synchronization projection version (`projection_version`).
- **User Group Role Association (`user_group_roles`)**: Many-to-many join entity linking `tenant_code`, `user_group_id`, and `role_id` with a composite unique constraint.
- **Role (`roles`)**: Catalog entity defining a named collection of permissions/capabilities (System or Custom Role).
- **User Group Membership (`user_group_memberships`)**: Materialized records linking employee identifiers to user groups, used for calculating impact blast radius.
- **Security Event Outbox (`auth_security_events_outbox`)**: Transactional outbox table storing immutable security audit events and domain events for reliable asynchronous distribution.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Administrators can update role assignments on a User Group in under 300 milliseconds for groups with up to 10 assigned roles.
- **SC-002**: Impact estimation calculations complete in under 500 milliseconds for user groups with up to 10,000 materialized members.
- **SC-003**: 100% of high-impact role assignment changes exceeding the threshold without explicit confirmation are blocked and rolled back.
- **SC-004**: 100% of role assignment mutations maintain transactional atomicity, persisting outbox events, version increments, and join table updates in the same transaction.
- **SC-005**: 100% of queries strictly enforce tenant scoping, resulting in 0 cross-tenant data leaks or cross-tenant role assignments during security testing.
- **SC-006**: 0 synchronous modifications occur on `user_effective_roles` or cache layers during role assignment persistence (adhering strictly to ADR-A13 asynchronous reconciliation boundary).

## Assumptions

- Dynamic group memberships in `user_group_memberships` are materialized and available for impact estimation.
- Effective user permissions and roles are recalculated and applied during the subsequent synchronization step (`Sync Now` or scheduled reconciliation worker).
- Platform high-impact threshold is configured at the tenant or system settings level (defaulting to 100 affected users).
- Administrators executing role assignments have authenticated sessions with valid administrative privileges (`user_group.update`).

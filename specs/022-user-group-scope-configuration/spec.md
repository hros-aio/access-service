# Feature Specification: User Group Scope Configuration

**Feature Branch**: `022-user-group-scope-configuration`

**Created**: 2026-08-29

**Status**: Ready for Planning

**Input**: User description: "User Group Scope Configuration - Enable tenant administrators to configure exactly one platform-defined organizational scope boundary per User Group (Self, Direct Reportees, Company, Location, Department, Tenant-wide) to restrict the reach of granted capabilities — without mutating user group membership or role definitions."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure and Update User Group Scope Boundary (Priority: P1)

As a Tenant Administrator, I want to configure or update the organizational scope boundary of a User Group (`SELF`, `DIRECT_REPORTEES`, `COMPANY`, `LOCATION`, `DEPARTMENT`, `TENANT`) so that the capabilities and roles granted through that group are strictly enforced within that defined boundary.

**Why this priority**: Core access management and least-privilege boundary control (`AUTHZ-014`, `FEAT-AUTHZ-08`). Without scope boundary configuration, granted roles would either lack organizational anchoring or grant unrestricted tenant-wide reach.

**Independent Test**: Can be fully tested by modifying the scope type and reference ID of an existing User Group, verifying that the new scope attributes are stored, the group's version counter is incremented (marking it pending synchronization), and security audit events are recorded.

**Acceptance Scenarios**:

1. **Given** an existing User Group at version 2, **When** an administrator updates the group's scope from `SELF` to `DEPARTMENT` with a valid department reference ID, **Then** `scope_type` is updated to `DEPARTMENT`, `scope_ref_id` is set to the provided ID, `version` increments to 3 while `projection_version` remains 2 (marking the group `PENDING` synchronization), and an audit record (`user_group.scope_updated`) is persisted.
2. **Given** an administrator setting scope to `TENANT`, `SELF`, or `DIRECT_REPORTEES`, **When** the update is submitted with or without a `scope_ref_id`, **Then** `scope_type` is updated and `scope_ref_id` is automatically normalized to `null`.
3. **Given** an administrator setting scope to an entity-anchored scope (`COMPANY`, `LOCATION`, `DEPARTMENT`) without providing a valid `scope_ref_id`, **When** submitted, **Then** the system rejects the operation with a validation error (HTTP 400/422).
4. **Given** an administrator attempting to update scope on a User Group belonging to another tenant, **When** the request is processed, **Then** the system returns HTTP 404 Not Found without modifying any data.
5. **Given** two concurrent administrators updating the same User Group's scope, **When** Administrator B submits with a stale `expectedVersion`, **Then** the request fails with a conflict error (HTTP 409 Concurrent Modification) and no changes are saved.

---

### User Story 2 - Pre-Commit Blast Radius & Impact Estimation (Priority: P2)

As a Tenant Administrator, I want to preview the estimated blast radius before committing a scope change — including the count of affected employees matching the group — so that I understand the impact before widening or narrowing permissions.

**Why this priority**: Administrative safety and visibility requirement (`AUTHZ-015`, `FEAT-AUTHZ-10`). Prevents unexpected mass access expansion or contraction by giving upfront visibility into the affected population.

**Independent Test**: Can be fully tested by submitting a proposed scope configuration to the impact estimation endpoint for a group with known members, verifying that the returned affected user count and high-impact confirmation flag match calculations without altering database state.

**Acceptance Scenarios**:

1. **Given** a User Group with 5,000 members and a platform high-impact threshold of 100, **When** an administrator requests an impact estimate for changing scope, **Then** the system returns `affectedUserCount: 5000` and `requiresConfirmation: true`.
2. **Given** a User Group with 10 members (below the threshold), **When** an administrator requests an impact estimate, **Then** the system returns `affectedUserCount: 10` and `requiresConfirmation: false`.
3. **Given** an impact estimation request, **When** calculation executes, **Then** zero database records are modified, no outbox events are emitted, and no background synchronization tasks are triggered.

---

### User Story 3 - High-Impact Explicit Confirmation Gate (Priority: P3)

As a Security Officer / Compliance Auditor, I want the system to require explicit confirmation (`confirmed: true`) when saving scope changes on User Groups exceeding the high-impact threshold, so that large-scale permission changes cannot happen accidentally.

**Why this priority**: Governance and safety mechanism (`AUTHZ-015`, `FEAT-AUTHZ-10`). Enforces intentional confirmation for operations that impact a large number of employees.

**Independent Test**: Can be fully tested by attempting to save a high-impact scope update without the confirmation flag (verifying rejection with HTTP 422), followed by submitting with `confirmed: true` (verifying successful commit).

**Acceptance Scenarios**:

1. **Given** a User Group scope change affecting a population exceeding the high-impact threshold submitted without `confirmed: true`, **When** the update endpoint is called, **Then** the system rejects the mutation with HTTP 422 (`HighImpactConfirmationRequiredError`) and rolls back the transaction.
2. **Given** a high-impact scope change submitted with `confirmed: true` and matching `expectedVersion`, **When** the update endpoint is called, **Then** the scope is updated, version is incremented, and audit records are persisted.

---

### User Story 4 - Multi-Tenant Authorization Isolation & Cumulative Scope Evaluation (Priority: P4)

As a Security Administrator, I want to guarantee that User Group scopes are strictly isolated to the requesting tenant and that an employee matching multiple User Groups receives the cumulative union of all granted scopes upon synchronization.

**Why this priority**: Core multi-tenant security invariant (`AUTHZ-009`, `AUTHZ-023`, `AUTHZ-024`). Guarantees no cross-tenant data leakage and ensures additive access semantics across user groups.

**Independent Test**: Can be fully tested by verifying that tenant isolation is enforced at the repository/service boundary and that scope changes record complete audit events with actor attribution.

**Acceptance Scenarios**:

1. **Given** Tenant A and Tenant B, **When** an administrator in Tenant A queries or updates scope on a User Group belonging to Tenant B, **Then** the system rejects access with HTTP 404 Not Found.
2. **Given** an employee matching multiple User Groups with different scopes for the same capability (e.g., Group 1 with `DIRECT_REPORTEES` and Group 2 with `COMPANY`), **When** effective permissions are evaluated, **Then** their effective access spans the union of both scopes without conflict.
3. **Given** any successful scope configuration change, **When** the transaction commits, **Then** an immutable audit event (`user_group.scope_updated`) and domain event (`authorization.user-group-updated`) are written to the transactional outbox with tenant context, actor ID, previous scope, and new scope.

---

### Edge Cases

- **Concurrent Administrator Updates**: When two administrators modify the scope of the same group simultaneously, optimistic concurrency locking (`version`) detects the conflict and rejects the second update with HTTP 409 without corrupting data.
- **Enterprise Scale Blast Radius**: A Tenant-wide scope change in an enterprise tenant with tens of thousands of employees calculates impact efficiently and requires explicit high-impact confirmation before persisting.
- **Entity Reference Invalidation**: If a scope reference ID (e.g., department ID) does not belong to the active tenant or is malformed, validation rejects the update immediately.
- **Scope Normalization**: If an administrator submits a reference ID alongside `SELF`, `DIRECT_REPORTEES`, or `TENANT`, the system normalizes the reference ID to `null` cleanly without failing the request.
- **Zero Cache/Projection Mutation on Save**: Changing a scope does not synchronously recalculate effective roles or invalidate caches; reconciliation is deferred until scheduled sync or on-demand "Sync Now".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support exactly 6 platform-defined scope types for User Groups: `SELF`, `DIRECT_REPORTEES`, `COMPANY`, `LOCATION`, `DEPARTMENT`, `TENANT`. Custom scope scripts or expression trees are prohibited.
- **FR-002**: Every User Group MUST have exactly one active scope configuration in effect at any time, applied uniformly to all roles assigned to that group.
- **FR-003**: System MUST require a non-null `scope_ref_id` belonging to the tenant when `scope_type` is `COMPANY`, `LOCATION`, or `DEPARTMENT`.
- **FR-004**: System MUST ensure `scope_ref_id` is set to `null` when `scope_type` is `SELF`, `DIRECT_REPORTEES`, or `TENANT`.
- **FR-005**: System MUST provide a non-mutating impact estimation API that calculates the affected employee count and flags whether high-impact confirmation is required.
- **FR-006**: System MUST enforce high-impact explicit confirmation (`confirmed: true`) when persisting scope changes on User Groups where the affected population exceeds the platform threshold.
- **FR-007**: System MUST use optimistic concurrency control (`expectedVersion`) on User Group scope updates, returning HTTP 409 on version mismatches.
- **FR-008**: System MUST increment the User Group `version` counter while leaving `projection_version` unchanged upon saving a scope change, marking the group dirty (`PENDING` synchronization).
- **FR-009**: System MUST persist an immutable audit event (`user_group.scope_updated`) and domain event (`authorization.user-group-updated`) within the same database transaction as the scope update via the transactional outbox.
- **FR-010**: System MUST enforce strict multi-tenant isolation on all scope inspection and mutation endpoints, returning HTTP 404 for cross-tenant access.
- **FR-011**: System MUST require administrative capability `user_group.update` for scope modification and impact estimation endpoints.

### Key Entities *(include if feature involves data)*

- **User Group (`user_groups`)**: Represents a dynamic or static collection of employees. Contains `scope_type`, `scope_ref_id`, `version`, and `projection_version`.
- **Scope Type (`ScopeType`)**: Enumeration representing organizational reach: `SELF`, `DIRECT_REPORTEES`, `COMPANY`, `LOCATION`, `DEPARTMENT`, `TENANT`.
- **Scope Definition (`ScopeDefinition`)**: Value object combining `scopeType` and optional `scopeRefId`.
- **Security Event Outbox (`auth_security_events_outbox`)**: Transactional outbox table capturing domain events and audit records for asynchronous publishing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Administrators can inspect, preview impact, and update User Group scopes across all 6 platform scope types with 100% adherence to reference ID validation rules.
- **SC-002**: Pre-commit blast radius and impact estimation returns accurate affected user counts and confirmation requirements in under 500ms without modifying database state.
- **SC-003**: 100% of high-impact scope updates submitted without explicit confirmation are blocked and rolled back with clear guidance.
- **SC-004**: 100% of successful scope updates increment the group's version counter, transition the group to pending synchronization, and write outbox audit records in a single atomic transaction.
- **SC-005**: Cross-tenant scope access or modification attempts achieve a 0% success rate (100% rejected with HTTP 404).

## Assumptions

- Scope reference identifiers (`COMPANY`, `LOCATION`, `DEPARTMENT`) refer to organizational hierarchy entities owned by the Organization/Workforce module within the same tenant.
- The platform high-impact threshold is configured via tenant or platform application settings (defaulting to a sensible enterprise baseline such as 100 affected users).
- Actual recalculation of `user_effective_roles` and cache updates occurs asynchronously during the synchronization pipeline (Sync Now or scheduled reconciliation worker) rather than within the synchronous HTTP scope save request.
- The current implementation builds directly upon the existing `UserGroupModule` in `hros-access-service`.

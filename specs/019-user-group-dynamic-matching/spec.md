# Feature Specification: Dynamic Matching Criteria & Population Evaluation

**Feature Branch**: `019-user-group-dynamic-matching`

**Created**: 2026-08-28

**Status**: Draft

**Input**: User description: "/speckit-specify # Dynamic Matching Criteria & Population Evaluation" (FEAT-AUTHZ-05)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administrator Defines User Group Matching Criteria (Priority: P1)

As an HR/Security Administrator, I want to define dynamic matching rules using employee business attributes (e.g., department, employment status, reporting status) for a User Group, so that eligible employees are automatically assigned to the group without manual administrative provisioning.

**Why this priority**: Core capability enabling automated, rule-based access governance and eliminating manual user group assignments.

**Independent Test**: Can be tested by configuring a matching rule on a User Group (e.g., `departmentId = 'dept-hr'` AND `employmentStatus = 'ACTIVE'`), saving the configuration, and verifying that the rule is parsed, validated against the closed attribute/operator allow-list, and persisted with extracted attribute keys.

**Acceptance Scenarios**:
1. **Given** an administrator configuring a User Group, **When** they submit criteria combining multiple conditions (`employmentStatus == 'ACTIVE'`, `departmentId == 'dept-123'`), **Then** the system validates the rule using logical "AND" (`all`), verifies the fields against the closed allow-list, and stores the matching rule.
2. **Given** an administrator attempting to use an unsupported attribute (e.g., `salary`) or combinator (`any`/`or`), **When** they save the rule, **Then** the system rejects the request with an explicit validation error.
3. **Given** a valid matching rule, **When** persisted, **Then** the system extracts the required attribute keys (e.g., `['employmentStatus', 'departmentId']`) for efficient candidate group lookup.

---

### User Story 2 - Employee Automatically Matches or Ceases Matching a User Group (Priority: P1)

As an Employee whose business attributes change (e.g., transfer to a new department or change in employment status), I want my User Group memberships and resulting effective permissions to update automatically, so that my access always mirrors my current organizational reality.

**Why this priority**: Essential for zero-trust access management and eliminating access creep or orphaned privileges.

**Independent Test**: Can be tested by simulating an employee attribute change (e.g., department update or termination), triggering evaluation, and asserting that `user_group_memberships` and `user_effective_roles` reflect the exact diff.

**Acceptance Scenarios**:
1. **Given** an employee whose department changes to match Group A's criteria, **When** evaluated, **Then** the employee is automatically enrolled into Group A, and the associated roles and permissions are materialized in `user_effective_roles`.
2. **Given** an employee currently in Group A who is transferred out of the qualifying department, **When** evaluated, **Then** the employee's membership in Group A is revoked, stale effective roles are deleted, and unaffected group memberships remain untouched.
3. **Given** an employee whose status transitions to `'INACTIVE'`, **When** evaluated, **Then** the employee stops matching groups requiring active employment and all associated active access is revoked.

---

### User Story 3 - Manager Eligibility Updates Based on Reporting Lines (Priority: P2)

As a People Manager, I want to automatically gain manager-level user group access when direct reports are assigned to me, and automatically lose that access when I no longer have direct reports, so that managerial capabilities are granted strictly while active supervisory duties exist.

**Why this priority**: Automates management-tier access transitions without manual intervention during organizational reporting line changes.

**Independent Test**: Can be tested by assigning a reportee to an employee with 0 reports, observing reportee count increment and group auto-enrollment; then removing the reportee, observing count decrement to 0 and immediate membership revocation.

**Acceptance Scenarios**:
1. **Given** an employee with 0 direct reports, **When** a reporting line change assigns them ≥1 direct report, **Then** their derived reportee count updates and they automatically match groups requiring direct reports (`hasReportees = true`).
2. **Given** a manager whose last direct report is reassigned, **When** the reporting line event is processed, **Then** their derived reportee count decreases to 0 and they immediately cease matching manager-specific user groups.

---

### User Story 4 - Dynamic Population Preview & Impact Estimation (Priority: P3)

As an Administrator modifying or drafting criteria for a User Group, I want to preview the currently matched employee population and estimate the membership diff (gaining vs. losing counts) before committing changes, so that I can prevent unintentional privilege escalation or mass access revocation.

**Why this priority**: Provides administrative safety and operational visibility before applying high-impact access rule changes across the tenant.

**Independent Test**: Can be tested by invoking the preview and impact estimation APIs with sample rules and verifying calculated member counts and diff metrics without modifying database memberships.

**Acceptance Scenarios**:
1. **Given** an active User Group, **When** an administrator queries the group population, **Then** the system returns the exact list and count of materialized matching members.
2. **Given** a proposed matching rule modification, **When** an administrator requests impact estimation, **Then** the system evaluates the criteria against the employee population and returns the count of employees who would gain access and lose access (`gainingCount`, `losingCount`) without persisting mutations.
3. **Given** a criteria set that matches zero employees, **When** evaluated or previewed, **Then** the system returns total count 0 and an empty member list with a success status.

---

### Edge Cases

- **Zero Matching Population**: A criteria set matching zero employees is completely valid; the system must return `totalCount = 0` and empty membership without error.
- **Rapid Attribute Toggling**: Rapid consecutive changes (e.g., department assignment and immediate reversal) must evaluate deterministically within transactional boundaries without database state corruption or race conditions.
- **Out-of-Order / Stale Lifecycle Events**: If an incoming employee event has `source_version <= current_source_version`, the system must acknowledge and discard it as a no-op to prevent state regression.
- **Manager Transitive Reportee Counts**: Reassignment of an employee between Manager A and Manager B must atomically update both managers' reportee counts in a single operation.
- **Disjoint Multi-Group Membership**: An employee matching multiple overlapping groups must have all memberships materialized independently; revoking one group must not impact roles granted by other active groups.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support dynamic matching criteria on User Groups evaluated strictly using logical "AND" (`all` combinator) across all specified clauses.
- **FR-002**: System MUST validate all criteria clauses against a closed attribute allow-list: `employmentStatus`, `companyId`, `locationId`, `departmentId`, `gradeId`, `jobTitleId`, `reporteesCount`, and `hasReportees`.
- **FR-003**: System MUST validate all criteria operators against a closed operator allow-list: `eq`, `neq`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `exists`.
- **FR-004**: System MUST extract and persist `rule_attribute_keys` on User Groups to enable targeted index-driven group candidate lookups during employee attribute updates.
- **FR-005**: System MUST maintain an internal, tenant-isolated `employee_references` projection updated via asynchronous directory lifecycle events with strict `source_version` idempotency checks.
- **FR-006**: System MUST maintain a derived, atomic `reportees_count` on employee projections and dynamically resolve `hasReportees = true` as `reportees_count > 0`.
- **FR-007**: System MUST provide a pure in-memory evaluation engine for single-employee re-evaluation upon attribute changes, and a safe, parameterized SQL translator for tenant-wide population evaluation.
- **FR-008**: System MUST atomically reconcile `user_group_memberships` upon criteria evaluation and cascade minimal diffs to `user_effective_roles` within a database transaction.
- **FR-009**: System MUST support read-only preview and impact estimation APIs that calculate matching population counts and diff estimations (`gainingCount`, `losingCount`) without persisting mutations.
- **FR-010**: System MUST record audit security events in `auth_security_events_outbox` for all dynamic membership synchronization deltas and administrative criteria updates.
- **FR-011**: System MUST enforce tenant isolation (`tenant_code` boundary) on all criteria storage, queries, and projection maintenance operations.

### Key Entities

- **Employee Reference Projection (`employee_references`)**: Read model projection of directory attributes (`employee_id`, `tenant_code`, `company_id`, `location_id`, `department_id`, `grade_id`, `job_title_id`, `employment_status`, `manager_employee_id`, `reportees_count`, `source_version`).
- **User Group (`user_groups`)**: Group entity containing `matching_rule` (JSONB), `rule_attribute_keys` (array of attribute strings), `projection_version`, and lifecycle status.
- **User Group Membership (`user_group_memberships`)**: Materialized assignment linking an employee (`user_id` / `employee_id`) to a User Group.
- **User Effective Role (`user_effective_roles`)**: Flattened, materialized authorization state linking an employee to effective roles and their associated scopes derived from active group memberships.
- **Matching Rule Specification**: Domain model encapsulating `combinator` (`all`), array of `RuleClause` items (`field`, `operator`, `value`), and attribute extractor logic.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of employee attribute update events evaluate criteria and reconcile memberships deterministically within transactional boundaries.
- **SC-002**: Incremental single-employee matching evaluates ONLY against candidate groups whose `rule_attribute_keys` overlap with changed attributes, eliminating full-table scans.
- **SC-003**: 100% of stale or out-of-order directory events (`source_version <= stored_version`) are safely ignored without data drift.
- **SC-004**: Administrators can preview matching populations and view diff counts (`gainingCount`, `losingCount`) with zero unintended mutations.
- **SC-005**: Dynamic membership reconciliation generates minimal database diffs, writing to `user_effective_roles` only when effective access actually changes.

---

## Assumptions

- **Combinator Simplicity**: Initial implementation strictly enforces "AND" (`all`) logic across criteria clauses; nested/arbitrary boolean logic ("OR") is out of scope for v1 per business specifications.
- **Internal Projection Boundary**: The Access Service maintains an internal projection of employee business attributes received via Kafka events, without directly querying or coupling to the Directory Service database.
- **Data Minimization**: Non-authorization employee attributes (compensation, bank accounts, personal identity documents) are strictly excluded from the projection.
- **Tenancy**: Multi-tenancy is partitioned strictly by `tenant_code` across all projection and authorization tables.
- **Event Ordering**: The Directory Service provides monotonically increasing `source_version` values on employee lifecycle events.

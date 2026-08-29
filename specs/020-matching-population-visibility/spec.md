# Feature Specification: Matching Population Visibility

**Feature Branch**: `020-matching-population-visibility`

**Created**: 2026-08-29

**Status**: Ready for Planning

**Input**: User description: "Matching Population Visibility - Provide tenant administrators with transparent, immediate, and responsive visibility into which employees match a User Group's dynamic criteria — for currently saved/active groups (materialized members) and during draft/in-flight criteria editing (live preview) — without blocking the UI or executing unbounded full-table scans."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Materialized User Group Population (Priority: P1)

As an HR/Tenant Administrator viewing a saved User Group, I want to see the total number and a paginated list of employees currently matching the group's dynamic criteria so that I can inspect and verify the effective membership of the group without causing system degradation.

**Why this priority**: Core administrative governance requirement (`AUTHZ-006`). Administrators must be able to audit and inspect who currently belongs to an active User Group and inherits its permissions/roles.

**Independent Test**: Can be fully tested by querying a saved User Group with materialized members, verifying that the total count and paginated employee list are returned accurately, deterministically, and with strict tenant isolation.

**Acceptance Scenarios**:

1. **Given** an active User Group with 150 materialized members in tenant "TENANT_A", **When** an authorized administrator requests page 1 with limit 50, **Then** the system returns the first 50 employee profiles and a total count of 150.
2. **Given** a saved User Group with 0 matching members, **When** an administrator requests the member listing, **Then** the system returns a total count of 0 and an empty list (`[]`) with HTTP 200 without throwing an error.
3. **Given** a User Group in inactive or draft status with 0 assigned roles, **When** its population is queried, **Then** the system accurately displays the matching count and member records.
4. **Given** a User Group belonging to "TENANT_B", **When** an administrator in "TENANT_A" queries the group population, **Then** the system responds with a not found error (HTTP 404) and leaks zero records.
5. **Given** a user lacking `user_group.view` (or `user_group.read`) permission, **When** querying the member listing, **Then** access is denied with HTTP 403 Forbidden.

---

### User Story 2 - Real-Time Matching Criteria Preview in Draft Mode (Priority: P2)

As an HR/Tenant Administrator configuring or editing dynamic matching criteria for a User Group, I want to see a live matching count and a sample list of matching employees in draft mode so that I can calibrate and verify rule accuracy before saving or applying changes.

**Why this priority**: Essential UX capability for administrative safety (`AUTHZ-007`). Prevents accidental over-provisioning or empty assignments by letting administrators preview rule outcomes in real time.

**Independent Test**: Can be fully tested by submitting a draft matching criteria payload to the preview evaluation service, verifying that the dynamic count and up to 50 sample matching employee profiles are returned without mutating database state.

**Acceptance Scenarios**:

1. **Given** an administrator authoring draft criteria with valid attributes and operators (e.g., `{ employmentStatus: 'ACTIVE', departmentId: 'HR' }`), **When** the administrator requests a preview, **Then** the system evaluates the criteria against the employee projection and returns the exact matching count and a bounded sample listing of matching employees (up to 50 records).
2. **Given** draft criteria that match 0 employees in the tenant, **When** a preview is requested, **Then** the system returns `totalCount: 0` and an empty sample list (`[]`) with HTTP 200.
3. **Given** a draft preview request containing unsupported attributes, unknown operators, or invalid combinators, **When** preview evaluation is requested, **Then** validation fails immediately (HTTP 400) before database query execution with descriptive validation messages.
4. **Given** a large workforce projection, **When** a preview evaluation is executed, **Then** the query runs with strict timeouts and bounded sampling (max 50 records) to guarantee non-blocking, responsive performance.
5. **Given** draft preview execution, **When** the query completes, **Then** zero records are persisted or altered in membership or role tables, and no synchronization jobs or events are triggered.

---

### Edge Cases

- **Zero Matched Population**: When criteria or materialized memberships evaluate to zero employees, the system must cleanly return `totalCount: 0` and `items: []` / `sampleEmployees: []` with HTTP 200 without throwing null pointer or not found errors.
- **Extreme Workforce Scale**: Preview and count queries must execute with strict bounds (sample limit 50, pagination limit max 100) and query timeouts to prevent unbounded scans, locking, or UI lag.
- **Inactive or Roleless Groups**: A User Group in `INACTIVE` state or with 0 assigned roles must still allow administrators to view the current matching population count and listing.
- **Cross-Tenant Boundary**: Queries must strictly isolate records by tenant context derived from the request context; requests targeting IDs from other tenants must return 404 Not Found.
- **Data Minimization in Response**: Employee projection responses must only contain authorized administrative attributes (employee ID, department, location, job title, grade, company, employment status) and must never expose sensitive PII (SSN, bank accounts, compensation).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an authenticated read endpoint to fetch the total count and paginated list of materialized members for a specified User Group.
- **FR-002**: System MUST enforce deterministic ordering (e.g., by employee ID ascending) and strict pagination limits (page $\ge$ 1, limit between 1 and 100) on member listing queries.
- **FR-003**: System MUST provide an authenticated endpoint to evaluate draft matching criteria and return the total matching count and a bounded sample list of matching employees (capped at 50 records).
- **FR-004**: System MUST validate draft matching criteria clauses against a strict closed allow-list before query evaluation:
  - Allowed attributes: `employmentStatus`, `companyId`, `locationId`, `departmentId`, `gradeId`, `jobTitleId`, `reporteesCount`, `hasReportees`.
  - Allowed operators: `eq`, `neq`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `exists`.
  - Allowed combinator: strictly `"AND"` logic.
- **FR-005**: System MUST reject invalid criteria payloads with HTTP 400 Bad Request indicating the invalid attribute, operator, or combinator.
- **FR-006**: System MUST execute criteria evaluation and population listing as read-only operations that do not mutate database records, emit audit events, or trigger background synchronization jobs.
- **FR-007**: System MUST enforce tenant isolation on every database query using the tenant context extracted from `RequestContext` (`AsyncLocalStorage`).
- **FR-008**: System MUST require administrative capability `user_group.view` (or `user_group.read`) for accessing population listing and draft criteria preview.
- **FR-009**: System MUST exclude sensitive personal and financial data (salary, tax ID, bank accounts) from all employee projection query results.

### Key Entities

- **User Group (`user_groups`)**: The security grouping container defining dynamic matching rules, scope, and administrative metadata.
- **User Group Membership (`user_group_memberships`)**: Materialized records linking employee identifiers to user groups within a tenant.
- **Employee Reference (`employee_references`)**: Read model projection containing synchronized workforce attributes (`employee_id`, `company_id`, `department_id`, `location_id`, `job_title_id`, `grade_id`, `employment_status`, `reportees_count`) used for dynamic rule evaluation and member listings.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Administrators can view the total count and first page of materialized members of an active User Group in under 500 milliseconds for groups with up to 10,000 members.
- **SC-002**: Dynamic criteria preview evaluations in draft mode complete and return matching count and sample results in under 1 second across workforce projections of up to 100,000 employees.
- **SC-003**: 100% of queries strictly enforce tenant scoping, resulting in 0 cross-tenant data leaks during security and isolation audits.
- **SC-004**: 100% of invalid draft criteria clauses (disallowed attributes, operators, or combinators) are rejected prior to SQL evaluation.
- **SC-005**: 100% of population visibility and draft preview queries are non-mutating and trigger 0 background synchronization or reconciliation tasks.

## Assumptions

- The `employee_references` projection is populated and maintained asynchronously via workforce directory events.
- Materialized memberships in `user_group_memberships` are kept up to date by the User Group dynamic matching synchronization and reconciliation processes.
- Administrators accessing these visibility features hold valid authentication tokens with the `user_group.view` permission claim.
- Sample preview size of 50 records is sufficient for administrative verification during draft rule authoring without overwhelming client UI rendering.

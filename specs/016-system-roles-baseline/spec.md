# Feature Specification: System Roles Baseline & Protection

**Feature Branch**: `016-system-roles-baseline`

**Created**: 2026-08-25

**Status**: Draft

**Input**: User description: "Manage built-in platform System Roles (e.g., Employee, Manager, Built-in Administrator), allowing tenant administrators to customize display labels and extend with non-protected capabilities while strictly locking protected capabilities against removal or deactivation, preventing platform lockout and recording audit events for violations."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Baseline System Roles Provisioned Automatically for New Tenants (Priority: P1)

As a platform operator and newly onboarded tenant,
I want mandatory baseline System Roles (Employee, Manager, Built-in Administrator) to be automatically created upon tenant provisioning with predefined protected capabilities,
So that every tenant has an immediate, functional, and secure baseline authorization structure without manual setup.

**Why this priority**:
Automatic seeding of System Roles is the prerequisite foundation for tenant authorization. Without baseline System Roles, new tenants cannot assign access or log in with necessary role-based boundaries.

**Independent Test**:
Can be fully tested by triggering tenant provisioning for a new tenant and verifying that the default System Roles (Employee, Manager, Built-in Administrator) exist in the tenant's role catalog with their designated protected capabilities marked as protected.

**Acceptance Scenarios**:

1. **Given** a new tenant is provisioned in the platform, **When** provisioning completes, **Then** all default System Roles (`EMPLOYEE`, `MANAGER`, `ADMINISTRATOR`) exist in active status with `type = SYSTEM`, each containing its platform-defined baseline capabilities.
2. **Given** provisioned System Roles, **When** examining role permissions, **Then** baseline critical capabilities are flagged with `is_protected = TRUE` while standard non-critical defaults (if any) are flagged with `is_protected = FALSE`.
3. **Given** an active tenant session, **When** any administrator attempts to delete a role of `type = SYSTEM`, **Then** the system strictly rejects the deletion request with an explanatory error indicating that System Roles cannot be deleted.

---

### User Story 2 - Inviolable Protected Capability Locking & Violation Audit Logging (Priority: P1)

As a platform security officer and tenant administrator,
I want the system to strictly reject any attempt to remove or unassign protected capabilities from a System Role and record an immutable audit event for every violation,
So that platform security guarantees and minimum operational functions (such as administrative recovery and basic employee portal access) cannot be broken.

**Why this priority**:
Inviolable capability protection prevents accidental or malicious platform lockout (e.g., stripping administration rights from the built-in administrator) and provides compliance traceability for security tampering attempts.

**Independent Test**:
Can be fully tested by submitting a permission update request on a System Role that omits one or more protected capabilities (`is_protected = TRUE`), verifying that the transaction is rejected, the role's permissions remain unchanged, and a security audit event is persisted.

**Acceptance Scenarios**:

1. **Given** a System Role with protected capability `employee.view`, **When** an administrator submits an updated permission set that omits `employee.view`, **Then** the request is rejected with a validation error detailing the protected capability violation, no changes are committed to the database, and an audit record (`role.protected-capability-violation`) is generated.
2. **Given** the Built-in Administrator System Role, **When** an administrator attempts to deactivate the role or change its status to inactive, **Then** the request is rejected with an error preventing deactivation of critical system roles.
3. **Given** an unauthorized tampering attempt via API or direct modification attempt, **When** rejected, **Then** the generated audit event records the actor ID, tenant code, target role ID, omitted protected capability codes, and timestamp.

---

### User Story 3 - Extending System Roles with Non-Protected Capabilities (Priority: P2)

As a tenant administrator customizing access control,
I want to extend existing System Roles by granting additional non-protected capabilities,
So that I can tailor system roles to organization-specific workflows while adhering to capability dependency rules.

**Why this priority**:
Enables organizations to enrich baseline roles (e.g., allowing Managers to view additional department reports) without having to rebuild entire role definitions from scratch.

**Independent Test**:
Can be fully tested by adding a valid non-protected capability (e.g., `location.view`) to a System Role, verifying that capability dependencies are validated, the role permission is saved with `is_protected = FALSE`, and the change propagates immediately to the cache.

**Acceptance Scenarios**:

1. **Given** an administrator managing a System Role, **When** the administrator adds a valid capability (e.g., `location.view`), **Then** the permission is saved with `is_protected = FALSE`, `roles.version` increments, and the role's cache key is updated synchronously.
2. **Given** an administrator attempting to add an action capability (e.g., `location.update`) without its prerequisite view capability (`location.view`), **When** the update is submitted, **Then** the request is rejected with a capability dependency validation error.
3. **Given** a high-impact permission change affecting a large population of users above the tenant threshold, **When** submitted without explicit confirmation, **Then** the system returns an impact assessment prompting the administrator for confirmation before committing.

---

### User Story 4 - Customizing Tenant-Facing Role Display Labels (Priority: P2)

As a tenant administrator,
I want to customize the display label (name) and description of System Roles to match my organization's internal terminology (e.g., renaming "Employee" to "Team Member"),
So that the platform reflects company vernacular without altering the immutable underlying system key or security protections.

**Why this priority**:
Enhances user experience and organizational fit while strictly preserving system integrity, immutable keys, and protected capabilities.

**Independent Test**:
Can be fully tested by updating the name of a System Role, verifying that the new name is saved, unique within the tenant, the immutable `system_role_key` remains unchanged, and a `role.renamed` audit event is logged.

**Acceptance Scenarios**:

1. **Given** an administrator managing the "Employee" System Role, **When** the administrator renames the role to "Team Member", **Then** `roles.name` updates to "Team Member", `system_role_key` remains "EMPLOYEE", all permissions and protection flags remain intact, and a `role.renamed` audit record is created.
2. **Given** an administrator renaming a System Role, **When** the chosen name conflicts with another active role within the same tenant, **Then** the request is rejected with a unique name conflict error.
3. **Given** an administrator inspecting role details via API, **When** reading a System Role, **Then** the response clearly identifies the role type as `SYSTEM`, returns the immutable `system_role_key`, tenant display name, and permission list with `is_protected` flags.

---

### Edge Cases

- **Concurrent Modifications**: If two administrators modify permissions or display names on the same System Role concurrently, optimistic locking via version column must detect the collision and reject the stale update.
- **Tenant Scope Isolation**: All queries, updates, and renaming operations on System Roles must strictly enforce tenant scoping; changes in Tenant A must never affect Tenant B.
- **Unchecking Non-Protected Baseline Defaults**: If a System Role template includes non-protected capabilities (`is_protected = FALSE`), administrators may add or remove those capabilities, but all protected capabilities (`is_protected = TRUE`) must remain locked.
- **Deletion Prevention via Cascade or Bulk Operations**: Bulk role deletion operations or cascade delete paths must actively filter out and block any attempt to delete roles with `type = SYSTEM`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatically provision baseline System Roles (`EMPLOYEE`, `MANAGER`, `ADMINISTRATOR`) during tenant onboarding within a single database transaction.
- **FR-002**: System Roles MUST have `type = 'SYSTEM'` and a non-null, immutable `system_role_key` (e.g., `EMPLOYEE`, `MANAGER`, `ADMINISTRATOR`).
- **FR-003**: System MUST designate critical capabilities in System Role templates with `is_protected = TRUE` and non-critical capabilities with `is_protected = FALSE`.
- **FR-004**: System MUST strictly reject any request to delete a role with `type = 'SYSTEM'` across all API endpoints and data operations.
- **FR-005**: System MUST enforce server-side invariants preventing the removal or unassignment of any permission where `is_protected = TRUE` on a System Role.
- **FR-006**: System MUST record an immutable security audit event with action `role.protected-capability-violation` whenever an update attempt violates protected capability invariants, capturing actor ID, tenant code, role ID, omitted capability codes, and timestamp.
- **FR-007**: System MUST prevent deactivation or status suspension of critical System Roles (e.g., Built-in Administrator).
- **FR-008**: System MUST allow tenant administrators to grant additional non-protected capabilities (`is_protected = FALSE`) to System Roles, subject to capability dependency validation.
- **FR-009**: System MUST allow tenant administrators to customize the display label (`name`) and description of System Roles without modifying `system_role_key` or `is_protected` permission flags.
- **FR-010**: System MUST enforce display name uniqueness among active roles within the same tenant.
- **FR-011**: System MUST record a `role.renamed` audit event whenever a System Role's display name is updated.
- **FR-012**: System MUST synchronously update the Redis cache key `authz:role:{tenant}:{roleId}` with updated permissions and bumped version upon successful permission or role mutation.
- **FR-013**: System MUST publish `authorization.role-updated` events to the security events transactional outbox upon role mutations.
- **FR-014**: System MUST expose role inspection endpoints returning role type, `system_role_key`, permission list with protection status, and user reach count.

### Key Entities

- **Role**: Represents a named authorization role within a tenant. Key attributes include identifier, `tenant_code`, `name` (tenant-customizable display label), `description`, `type` (`SYSTEM` vs `CUSTOM`), `system_role_key` (immutable system identifier for System Roles), `status` (`ACTIVE` vs `INACTIVE`), and `version` (optimistic locking).
- **Role Permission Assignment**: Represents the mapping between a role and a platform permission code. Key attributes include `role_id`, `permission_code`, and `is_protected` (boolean flag indicating inviolable capability protection).
- **System Role Template**: Platform-defined code configuration defining baseline System Roles, their immutable keys, and their default capability sets with protection flags.
- **Security Audit Event Outbox**: Represents transactional outbox records for security events (e.g., `role.renamed`, `role.permissions-updated`, `role.protected-capability-violation`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of newly provisioned tenants have all baseline System Roles (`EMPLOYEE`, `MANAGER`, `ADMINISTRATOR`) seeded and ready upon provisioning completion.
- **SC-002**: 100% of attempts to delete System Roles or remove protected capabilities (`is_protected = TRUE`) are blocked by server-side invariants.
- **SC-003**: 100% of rejected protected capability removal attempts produce an immutable audit log entry in the security events outbox with complete actor and violation details.
- **SC-004**: Role renaming operations update tenant display labels without altering `system_role_key` or compromising protected capability state in 100% of cases.
- **SC-005**: Role capability modifications propagate to the synchronous role cache (`authz:role:{tenant}:{roleId}`) within the same request transaction boundary.

## Assumptions

- **Platform-Defined System Templates**: The set of System Roles and their protected capability baselines are defined by platform code configuration and cannot be altered at runtime by tenants.
- **Tenant Scope Isolation**: System Role instances exist per tenant (cloned from platform templates during tenant provisioning) allowing independent display label customization per tenant while preserving platform invariants.
- **Non-Protected Capability Flexibility**: Non-protected capabilities assigned to a System Role may be added or removed by tenant administrators, provided capability dependency rules and high-impact thresholds are satisfied.
- **Prerequisite Validation**: All capability extensions to System Roles are validated against the Permission Catalog & Dependency Matrix (Feature 015).

# Feature Specification: Permission Catalog & Dependency Matrix

**Feature Branch**: `015-permission-catalog`

**Created**: 2026-08-24

**Status**: Draft

**Input**: User description: "Permission Catalog & Dependency Matrix: Provide a structured, platform-defined, read-only catalog of business capabilities grouped by module/resource and action, while enforcing capability dependency rules (e.g., granting an action capability requires its corresponding view capability; removing a view capability blocks removal while dependent actions remain granted)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administrator Views the Capability Catalog & Role Matrix (Priority: P1)

As a tenant administrator configuring access control,
I want to view a comprehensive, platform-defined catalog of capabilities organized by module, resource, and action,
So that I understand all available system permissions and their current configuration when setting up roles.

**Why this priority**:
Viewing available capabilities is the essential foundation for all role and permission governance in the system. Without an accurate, structured view of the catalog, administrators cannot inspect or configure permissions.

**Independent Test**:
Can be fully tested by an authenticated administrator navigating to the Permission Catalog / Role Matrix view and verifying that all standard capabilities are displayed hierarchically (Module -> Resource -> Actions) with clear descriptions, entry flags, and grant statuses.

**Acceptance Scenarios**:

1. **Given** an authenticated tenant administrator accessing the Role Matrix, **When** the administrator loads the permission catalog, **Then** all platform-defined permissions are displayed grouped by business module (e.g., Core HR, Time & Attendance, Payroll) and resource (e.g., Location, Employee, Department) with consistent action naming (`resource.action`).
2. **Given** an active tenant session, **When** any user attempts to create, rename, edit, or delete platform permission definitions, **Then** the request is blocked because the catalog is strictly platform-defined and immutable at runtime.
3. **Given** an unauthenticated request or a caller without administrative privileges, **When** requesting the permission catalog, **Then** access is denied with an appropriate authentication or authorization error.

---

### User Story 2 - Enforce Prerequisite View Capability on Action Grant (Priority: P1)

As a tenant administrator configuring a role,
I want the system to require the prerequisite view capability whenever I grant an action capability,
So that users assigned to that role are never given action capabilities without the necessary visibility context.

**Why this priority**:
Enforcing functional capability integrity at grant time prevents broken user journeys (e.g., a user able to edit an entity they cannot view) and ensures principle-of-least-privilege consistency.

**Independent Test**:
Can be fully tested by attempting to assign an action capability (e.g., `location.update`) to a role without including its prerequisite `view` capability (e.g., `location.view`), verifying that the assignment is rejected with a clear explanation of the missing prerequisite.

**Acceptance Scenarios**:

1. **Given** an administrator configuring permissions for a role, **When** the administrator attempts to grant an action capability (e.g., `location.update` or `employee.create`) without selecting its prerequisite view capability (`location.view` or `employee.view`), **Then** the system rejects the operation and provides an explicit explanation of the missing prerequisite capability.
2. **Given** an administrator selecting an action capability in the UI matrix with prerequisite auto-selection enabled, **When** the action capability is selected, **Then** the prerequisite view capability is automatically selected and highlighted.

---

### User Story 3 - Block Prerequisite View Capability Revocation While Actions Remain (Priority: P2)

As a tenant administrator modifying an existing role,
I want the system to prevent removing a prerequisite view capability while dependent action capabilities remain active,
So that roles cannot enter an inconsistent or non-functional permission state.

**Why this priority**:
Prevents accidental permission corruption where roles retain write or administrative actions while losing base read/view capabilities.

**Independent Test**:
Can be fully tested by attempting to remove `location.view` from a role that currently holds `location.update` and `location.delete`, verifying that the operation is blocked until the dependent action capabilities are first removed or deselected.

**Acceptance Scenarios**:

1. **Given** a role configured with `location.view` and `location.update`, **When** an administrator attempts to remove `location.view` while leaving `location.update` active, **Then** the system blocks the removal and identifies `location.update` as a dependent capability requiring prior removal.
2. **Given** an administrator removing all action capabilities for a resource, **When** the last dependent action capability is removed, **Then** the prerequisite view capability can be successfully removed.

---

### User Story 4 - Platform Startup Integrity & Cycle Prevention (Priority: P1)

As a platform operator and system engineer,
I want the application bootstrap process to strictly validate catalog integrity and dependency graph acyclicity,
So that misconfigured capability definitions or cyclic dependencies fail fast during startup and never reach production traffic.

**Why this priority**:
Guarantees zero runtime failure or infinite loops during permission evaluation by enforcing fail-fast integrity validation before the service accepts traffic.

**Independent Test**:
Can be fully tested by providing an invalid catalog fixture (containing cyclic dependencies or dangling prerequisite references) during startup and verifying that the application immediately fails startup health probes with explicit diagnostic errors.

**Acceptance Scenarios**:

1. **Given** a catalog containing a cyclic dependency chain (e.g., A requires B, and B requires A), **When** the service initializes, **Then** the startup probe fails and the service terminates with a diagnostic error detailing the cycle path.
2. **Given** a catalog containing a reference to a non-existent or deprecated prerequisite permission, **When** the service initializes, **Then** the startup probe fails and the service terminates with a diagnostic error indicating the missing prerequisite ID.
3. **Given** a valid, acyclic catalog definition, **When** the service initializes, **Then** the startup probe succeeds, memory indexes are established, and the service transitions to healthy.

---

### Edge Cases

- **Deprecated Permissions in Role Assignments**: If a previously valid permission is marked as deprecated in the catalog, how does the validation engine handle existing role assignments vs. new role assignment attempts? (Assumption: Existing roles retain assigned codes until modified, but adding deprecated codes to new/updated roles is rejected).
- **Transitive / Multi-Hop Dependencies**: If capability C requires B, and B requires A, granting C must require both B and A. Revoking A must block if either B or C remains granted.
- **Disconnected / Standalone Capabilities**: Capabilities with no prerequisites (e.g., top-level dashboard entry or independent view capabilities) must be grantable and revocable without prerequisite constraints.
- **Concurrent Role Modifications**: If two administrators modify the same role's permission set concurrently, optimistic locking must detect conflicts and prevent stale state from bypassing dependency validation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a static, code-owned, read-only capability catalog structured by module, resource, and action.
- **FR-002**: Permission identifiers MUST strictly adhere to the action-oriented naming standard `resource.action` (e.g., `location.create`, `employee.update`). Past-tense event names (e.g., `location.created`) and non-standard formats MUST be rejected.
- **FR-003**: System MUST construct and maintain an in-memory directed dependency graph of all capabilities on service bootstrap without querying any database.
- **FR-004**: System MUST validate graph acyclicity and referential integrity at application startup, failing the startup readiness probe immediately if cyclic dependencies or dangling prerequisites are detected.
- **FR-005**: System MUST enforce capability prerequisite rules whenever a role's permission set is created or updated: granting any action capability MUST require its designated prerequisite capabilities.
- **FR-006**: System MUST enforce capability dependent retention rules whenever a role's permission set is updated: revoking a prerequisite capability MUST be blocked as long as any dependent capabilities remain in the requested set.
- **FR-007**: System MUST validate requested permission sets against active catalog entries and reject any unknown or deprecated permission codes with explicit error reasons.
- **FR-008**: System MUST expose read-only catalog query and dependency matrix inspection endpoints for tenant administrators.
- **FR-009**: System MUST strictly reject any runtime mutation requests (POST/PUT/DELETE/PATCH) directed at the permission catalog itself.
- **FR-010**: System MUST export strongly typed TypeScript contracts, enums, and module navigation metadata to shared contracts while encapsulating internal dependency graph traversal logic.

### Key Entities

- **Permission Definition**: Represents a discrete business capability defined by the platform. Key attributes include identifier (`resource.action`), module name, resource name, action name, prerequisite references (`requires`), entry point indicator (`entry`), and deprecation status.
- **Permission Dependency Graph**: Represents the directed acyclic graph (DAG) of capability prerequisites across the entire system, enabling forward prerequisite validation and reverse dependent lookup.
- **Module Resource Group**: Represents the visual and structural hierarchy grouping capabilities under Modules (e.g., Core HR, Payroll) and Resources (e.g., Employee, Department) for Role Matrix rendering.
- **Role Permission Assignment**: Represents the association between a tenant role and a validated permission code string.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Administrators can retrieve and view the full permission catalog and dependency matrix in under 500 milliseconds for standard network conditions.
- **SC-002**: 100% of permission definitions strictly conform to the `resource.action` naming standard and contain zero database persistence dependencies.
- **SC-003**: 100% of cyclic dependencies and dangling capability references are caught and blocked at application startup before receiving any traffic.
- **SC-004**: 100% of role permission update attempts that violate prerequisite or dependent retention rules are prevented with explicit, human-readable explanations.
- **SC-005**: Zero runtime mutations are permitted on catalog capability definitions across all tenants.

## Assumptions

- **Platform-Defined Catalog**: Capability definitions are uniform across all tenants and change only through platform software releases, not runtime tenant configurations.
- **In-Memory Storage**: Permission catalog metadata and the dependency graph reside strictly in-memory within the service process; no PostgreSQL tables or foreign keys exist for catalog definitions.
- **Prerequisite Validation Scope**: Dependency validation evaluates the complete resulting permission set of a role rather than calculating incremental deltas.
- **Authentication & Authorization Guarding**: All catalog query endpoints require a valid tenant authentication context and administrative permissions.

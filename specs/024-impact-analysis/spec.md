# Feature Specification: Pre-Commit Impact Analysis & High-Impact Warnings

**Feature Branch**: `024-impact-analysis`

**Created**: 2026-08-30

**Status**: Draft

**Input**: User description: "# FEAT: Pre-Commit Impact Analysis & High-Impact Warnings"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Impact Blast Radius Visibility Before Changes (Priority: P1)

As an HR/Security Administrator editing Roles or User Groups, I want to view the gross number of employees gaining access and losing access before persisting changes, so that I can prevent unintentional over-provisioning and accidental access revocation.

**Why this priority**: Core safety mechanism that provides operational clarity and visibility into the real-world blast radius of authorization modifications before committing them.

**Independent Test**: Can be tested by configuring a draft change on a Role or User Group matching rule and requesting an impact preview without mutating any database state, verifying that gross gains and gross losses are returned.

**Acceptance Scenarios**:

1. **Given** an administrator drafts modifications to a User Group's dynamic matching criteria, **When** they request an impact estimation preview, **Then** the platform returns gross counts of users gaining access and users losing access (e.g., +150 gaining, -12 losing).
2. **Given** an administrator drafts permission changes or deactivation for a Role, **When** they request an impact preview, **Then** the platform returns the total count of distinct employees currently holding the role who will be affected.
3. **Given** an impact estimation request is processed, **When** the calculation runs, **Then** all underlying queries are strictly read-only and execute without mutating domain entities, membership caches, or dirty flags.

---

### User Story 2 - High-Impact Modification Guard & Two-Step Confirmation (Priority: P2)

As a Security Administrator, I want the system to block automatic saving of changes that exceed a configured high-impact threshold and require an explicit confirmation handshake, so that high-risk changes are never applied accidentally with a single click.

**Why this priority**: Essential safeguard preventing catastrophic access disruption across large employee populations.

**Independent Test**: Can be tested by submitting a mutation that affects more users than the high-impact threshold without the confirmation flag, verifying rejection with an impact summary, and subsequently resubmitting with explicit confirmation to verify successful persistence.

**Acceptance Scenarios**:

1. **Given** a proposed Role or User Group change where the total affected user count exceeds the high-impact threshold (e.g., 100 users), **When** the administrator submits the update without an explicit confirmation acknowledgement, **Then** the platform blocks persistence, preserves the existing configuration, and returns a high-impact confirmation required status with the computed impact summary.
2. **Given** a high-impact change is resubmitted with explicit confirmation acknowledgement, **When** processed, **Then** the platform commits the change, increments the entity version, and logs an immutable audit event containing the acknowledged blast radius.
3. **Given** a proposed change where the total affected user count is below the high-impact threshold, **When** submitted without a confirmation flag, **Then** the platform persists the change immediately on the first attempt.

---

### User Story 3 - Critical Capability Single-Holder Coverage Loss Detection (Priority: P3)

As a System Administrator, I want to be warned if a proposed change would remove the sole remaining employee holding a critical administrative capability, so that the organization is not locked out of vital administrative functions.

**Why this priority**: Protects against accidental organizational lockout from mission-critical governance functions.

**Independent Test**: Can be tested by attempting to deactivate a role or remove group assignments for the only user holding a built-in administrator capability, verifying that a coverage loss warning is flagged.

**Acceptance Scenarios**:

1. **Given** a role deactivation or user group modification that removes the only employee holding a protected/critical administrative capability (e.g., Built-in Administrator), **When** impact analysis is evaluated, **Then** the platform flags a coverage loss indicator detailing the specific capability at risk.
2. **Given** a proposed change where multiple other employees retain the critical capability, **When** evaluated, **Then** no coverage loss warning is flagged.

---

### Edge Cases

- **Concurrent Modification During Review Handshake**: If another administrator modifies the Role or User Group while an administrator is reviewing a high-impact warning modal, the confirmation submission MUST fail with an optimistic concurrency conflict rather than overwriting the newer state.
- **Cross-Tenant Boundary Protection**: Impact estimation queries MUST strictly enforce tenant isolation so that draft rules evaluated by Tenant A never query or leak access counts from Tenant B.
- **Zero-Delta Changes**: When a proposed edit results in no net membership or permission changes (+0 gain, -0 loss), the system reports zero affected users and allows direct persistence without high-impact blocking.
- **Complex Group Matching Rules with Multiple Criteria**: When prospective matching rules contain nested AND/OR attribute conditions, the set-based query engine accurately translates the prospective filter without side-effects on current employee records.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide pre-commit impact estimation for: (1) Role permission changes, (2) Role deactivation, (3) User Group matching criteria changes, (4) User Group scope changes, (5) User Group role assignments/removals, and (6) User Group deactivation.
- **FR-002**: System MUST report both gross user additions and gross user removals separately, and MUST NOT report only the net delta.
- **FR-003**: System MUST execute all impact calculation queries in read-only mode without mutating database records, dirty status flags, or cached projection versions.
- **FR-004**: System MUST evaluate whether the total affected users (gross gains + gross losses) exceed the platform high-impact threshold (default: 100 users).
- **FR-005**: System MUST block direct persistence of high-impact changes when submitted without explicit confirmation, returning the evaluated impact summary.
- **FR-006**: System MUST persist high-impact changes when submitted with an explicit confirmation acknowledgement, recording the acknowledged impact in the audit event log.
- **FR-007**: System MUST allow immediate single-step persistence for changes that do not exceed the high-impact threshold.
- **FR-008**: System MUST detect and flag a coverage loss warning when a proposed change would leave a critical administrative capability with zero remaining active holders.
- **FR-009**: System MUST enforce tenant isolation on all impact estimation queries and mutation endpoints.
- **FR-010**: System MUST protect against stale submissions between impact preview and confirmation using optimistic entity versioning.

### Key Entities

- **ImpactEstimate**: Represents the evaluated blast radius for a prospective change, containing gross additions count, gross removals count, total affected count, high-impact flag, and estimation status.
- **CoverageLossWarning**: Represents a risk warning indicating that a critical capability (such as Built-in Administrator) will lose its sole remaining holder.
- **Role**: The authorization role entity undergoing prospective permission or status modification.
- **UserGroup**: The dynamic user grouping entity undergoing prospective matching rule, scope, or role assignment changes.
- **EmployeeReference**: The projected employee dataset against which prospective dynamic matching rules are evaluated.
- **SecurityAuditEvent**: Immutable audit log entry recording confirmed high-impact modifications and acknowledged blast radii.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Administrators receive gross access gain and loss breakdowns for 100% of pre-commit impact evaluation requests before persisting changes.
- **SC-002**: 100% of configuration changes affecting more users than the high-impact threshold are blocked from single-step save and require explicit confirmation.
- **SC-003**: 100% of impact estimation queries execute in read-only mode with zero domain state mutations.
- **SC-004**: Impact calculations for standard group and role configurations complete within reasonable interactive bounds (under 1 second for standard tenant populations).
- **SC-005**: Critical administrative lockouts caused by removing the sole capability holder are prevented in 100% of evaluated scenarios.

## Assumptions

- The default platform high-impact threshold is configured as a system-wide constant of 100 affected users for initial release.
- Impact analysis evaluates immediate direct group memberships and role assignments against the current projected employee dataset.
- The UI client will invoke the preview endpoint proactively or handle the two-step confirmation error flow when submitting mutations.
- Critical capabilities subject to coverage loss checks include core built-in administrative roles.

# Feature Specification: Prompt Revocation of Sensitive Access

**Feature Branch**: `028-prompt-sensitive-access-revocation`

**Created**: 2026-09-01

**Status**: Ready for Planning

**Input**: User description: "Enforce immediate cutoff of security-critical access without waiting for background scheduled reconciliation cycles."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prompt Direct Role Capability Revocation across Active User Sessions (Priority: P1)

When a security administrator removes sensitive permissions or capabilities from a Role (e.g., removing finance approval, tenant administration, or sensitive payroll export capabilities), the platform must immediately revoke that access from the live system across all active user sessions without requiring users to re-authenticate or waiting for scheduled background reconciliation cycles.

**Why this priority**: Highest security impact and risk mitigation — addresses vulnerabilities where compromised or improperly granted critical capabilities could otherwise be abused during delayed reconciliation windows.

**Independent Test**: Can be tested by assigning a role with sensitive capabilities to an active user session, revoking the capability from the role, and verifying that the very next authorization check against that capability immediately denies access.

**Acceptance Scenarios**:

1. **Given** an active tenant administrator revokes a sensitive permission from Role `R1`, **When** the update request commits, **Then** the platform immediately updates the runtime role capability cache with an incremented version, and subsequent authorization evaluations for any user holding `R1` deny the revoked capability.
2. **Given** a user holding Role `R1` is actively interacting with the system, **When** a permission is revoked from `R1`, **Then** the cutoff takes effect on the next authorization guard check without waiting for routine scheduled reconciliation or requiring user re-authentication.
3. **Given** an administrator attempts to remove an inviolable protected capability from a built-in System Role, **When** the revocation request is validated, **Then** the platform rejects the modification with an inviolable role protection error and leaves runtime capabilities unchanged.

---

### User Story 2 - Expedited Priority Queueing for User Group Capability Revocation (Priority: P2)

When an administrator revokes a sensitive role assignment or removes criteria from a User Group (potentially affecting dozens or hundreds of users), the platform must enqueue an expedited, high-priority synchronization task that executes ahead of standard scheduled batches and routine background maintenance tasks.

**Why this priority**: Ensures population-scale access removals are prioritized over routine scheduled sync tasks, minimizing the exposure window for sensitive group-level revocations while handling asynchronous population recalculation.

**Independent Test**: Can be tested by placing multiple scheduled background jobs in the queue, enqueueing an urgent group revocation task, and verifying that the synchronization processor claims and executes the urgent task ahead of the scheduled tasks.

**Acceptance Scenarios**:

1. **Given** multiple routine `SCHEDULED` jobs and an `URGENT` revocation job exist in the synchronization queue, **When** the synchronization worker claims the next pending task, **Then** the worker selects and processes the `URGENT` job before any routine `SCHEDULED` job.
2. **Given** an administrator unassigns a sensitive role or modifies matching criteria on a User Group to revoke access, **When** the change is persisted, **Then** an `URGENT` priority synchronization job is enqueued immediately.
3. **Given** multiple `URGENT` jobs are enqueued concurrently, **When** workers claim tasks, **Then** jobs are processed in strict priority and FIFO order with multi-worker concurrency protection (`SKIP LOCKED`) and tenant isolation.

---

### User Story 3 - Safe Recalculation Preserving Cumulative Independent Grants (Priority: P3)

When expedited recalculation occurs due to a group revocation, the platform must accurately recompute effective access while strictly preserving independent access grants from other active user groups.

**Why this priority**: Critical for business continuity and least privilege integrity — prevents inadvertent disruption of legitimate access held through independent group assignments.

**Independent Test**: Can be tested by assigning an employee to Group A and Group B, where both grant Role R (or sensitive permissions), revoking Role R from Group A, and confirming that the employee retains Role R exclusively through Group B.

**Acceptance Scenarios**:

1. **Given** an employee holds Role `R_ADMIN` through Group `G1` and Group `G2`, **When** `G1` revokes `R_ADMIN` or the employee is removed from `G1`, **Then** the expedited recalculation preserves `R_ADMIN` in the employee's effective roles via `G2`.
2. **Given** an employee holds Role `R_ADMIN` solely through Group `G1`, **When** `G1` revokes `R_ADMIN`, **Then** the expedited recalculation removes `R_ADMIN` from the employee's effective roles and runtime access cache immediately upon completion.
3. **Given** expedited recalculation is triggered for a group, **When** processing begins, **Then** recalculation is narrowly scoped to the affected population without broad full-table scans.

---

### User Story 4 - Urgent Revocation Failure Alerting & Immutable Audit Trail (Priority: P4)

If an urgent revocation task fails due to database errors or worker crashes, the system must immediately mark the task as failed, trigger high-priority security failure alerts, and maintain an immutable audit trail capturing actor, target, before/after diffs, and execution outcome.

**Why this priority**: Guarantees administrative awareness and compliance visibility when security-critical access cutoff fails to apply, satisfying auditability and zero-silent-failure rules.

**Independent Test**: Can be tested by forcing an unrecoverable failure during an urgent revocation job, verifying that the job status becomes `FAILED`, a critical security alert event is emitted via the transactional outbox, and an immutable audit log entry is preserved.

**Acceptance Scenarios**:

1. **Given** an `URGENT` synchronization job encounters an unrecoverable error and exhausts retries, **When** failure is handled, **Then** the job status is set to `FAILED` and a critical security event is appended to the transactional outbox to trigger immediate alerts.
2. **Given** any administrator executes a role permission revocation or group access update, **When** the operation completes or fails, **Then** an immutable security audit record is recorded with actor details, target entity, timestamp, before/after state diff, and zero PII/secrets.
3. **Given** a failed urgent revocation job, **When** an administrator views synchronization status, **Then** the platform presents actionable recovery options to re-dispatch the urgent synchronization.

---

### Edge Cases

- **Cumulative Independent Grants**: If an employee holds a sensitive capability through two independent groups, revoking from one group must not revoke access legitimately granted by the other group.
- **Concurrent Configuration Updates**: If an administrator modifies role permissions or group rules while an urgent sync is already in flight for that entity, subsequent sync tasks or cache version increments ensure the latest saved version wins without race conditions.
- **Worker Crash or Transient Node Failure**: If a worker processing an urgent sync terminates abnormally, task leasing and retry mechanisms ensure the job is re-claimed and not left in perpetual limbo.
- **System Role Inviolability**: Protected capabilities on built-in system roles cannot be revoked by tenant administrators; requests attempting this are rejected before any queue or cache modification.
- **Zero-Matching Group Population**: When a group with zero active members has a role removed, the expedited sync job executes gracefully, records 0 affected users, and marks completion without error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST update runtime role capability definitions immediately upon role permission changes within the save transaction.
- **FR-002**: System MUST support prioritization of authorization synchronization jobs, supporting at least `URGENT`, `STANDARD`, and `SCHEDULED` priority levels.
- **FR-003**: System MUST claim pending synchronization jobs in priority order (`URGENT` before `STANDARD`/`SCHEDULED`) and creation order (`created_at ASC`) with concurrency protection (`SKIP LOCKED`).
- **FR-004**: System MUST automatically enqueue an `URGENT` priority synchronization job whenever a role or capability is removed from a User Group or when matching criteria are modified to narrow membership.
- **FR-005**: System MUST evaluate cumulative access across all active group memberships during expedited recalculation, ensuring independent grants remain intact.
- **FR-006**: System MUST update runtime user effective access projections immediately upon the completion of expedited recalculation.
- **FR-007**: System MUST record immutable audit events for all role permission updates, group role revocations, and synchronization dispatch outcomes.
- **FR-008**: System MUST emit critical failure events via the transactional outbox whenever an `URGENT` priority synchronization job fails.
- **FR-009**: System MUST enforce strict multi-tenant isolation across all queue claims, cache lookups, database recalculations, and audit records.
- **FR-010**: System MUST reject any attempt to revoke inviolable protected capabilities from built-in System Roles.

### Key Entities *(include if feature involves data)*

- **Role & Role Capabilities**: Defines named collections of permissions and capabilities assigned to users or user groups, including version counters and system role protection flags.
- **User Group**: Defines dynamic or static employee groupings and associated role assignments.
- **User Effective Access Projection**: The materialized access mapping representing effective roles and permissions held by an individual user, computed via the cumulative union of direct and group-derived grants.
- **Authorization Sync Job**: Represents an asynchronous synchronization task with attributes for entity type, entity ID, trigger type, priority (`URGENT`, `STANDARD`, `SCHEDULED`), status (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`), retry count, and execution metrics.
- **Security Event Outbox Record**: Immutable transactional event record capturing security audit entries and critical failure alerts for reliable downstream delivery.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Direct Role permission revocations take effect across active user sessions immediately upon transaction commit (0 scheduled delay).
- **SC-002**: 100% of expedited (`URGENT`) group access synchronization jobs are picked up by workers ahead of any existing routine `SCHEDULED` synchronization jobs.
- **SC-003**: 0% accidental loss of legitimate permissions for users holding overlapping independent group grants following an expedited revocation.
- **SC-004**: 100% of failed urgent synchronization jobs trigger critical alert events in the transactional outbox and record immutable audit entries.
- **SC-005**: All authorization checks, queue processing, and audit logs maintain 100% tenant isolation with zero cross-tenant access leakage.

## Assumptions

- Direct Role updates are applied to the primary runtime cache during the update transaction, enabling instantaneous enforcement by downstream service authorization guards.
- User Group modifications require population-level projection recalculation, which is expedited via priority queueing (`URGENT`) rather than delayed daily batch cycles.
- Notification dispatch for critical failure alerts is handled downstream via the transactional outbox mechanism and Kafka events consumed by notification services.
- Protected system role definitions and baseline rules are managed in accordance with the permission catalog and system role baseline specifications.

# Feature Specification: Employee Status Synchronization

**Feature Branch**: `004-employee-status-sync`

**Created**: 2026-07-28

**Status**: Draft

**Input**: User description:
> US-005 (Suspension), US-006 (Termination), US-007 (Reactivation) - Employment Status Synchronization.
> The HRMS access service must synchronize a user's access with their employment lifecycle. When suspended or terminated, access is immediately revoked, sessions destroyed, and pending invitations canceled. When reactivated, old credentials remain dead, and a fresh onboarding invitation is generated.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Revoke Access on Suspension (Priority: P1)

As the system, when an employee is suspended in the HR directory, I want to immediately disable their login capability and revoke all active sessions so that they cannot access any tenant resources.

**Why this priority**: Immediate suspension of access is a critical security requirement to prevent unauthorized system access when an employee's status changes.

**Independent Test**: Trigger an employee suspension event. Attempt to perform an authenticated action with an existing session (should be rejected). Attempt to log in again (should be rejected).

**Acceptance Scenarios**:

1. **Given** an employee has an active user account and active sessions, **When** they are suspended, **Then** their user account is disabled, their active sessions are revoked, and a session revocation security audit event is published.
2. **Given** an employee account is already disabled, **When** a duplicate suspension event is received, **Then** the event is ignored as a duplicate and no-op.

---

### User Story 2 - Terminate Employee Access (Priority: P1)

As the system, when an employee is terminated in the HR directory, I want to permanently archive their account, cancel any pending onboarding invitations, and destroy all active sessions.

**Why this priority**: Crucial for regulatory compliance and security auditing to ensure that offboarded employees retain no access pathways.

**Independent Test**: Trigger an employee termination event. Verify that the user status is archived, any pending invitations are marked revoked, and any active sessions are destroyed.

**Acceptance Scenarios**:

1. **Given** a terminated employee with an active account, **When** they are terminated, **Then** their account status is updated to archived, pending invitations are revoked, active sessions are destroyed, and a revocation event is published.
2. **Given** an employee has already been terminated, **When** a duplicate termination event is received, **Then** the event is ignored as a duplicate.

---

### User Story 3 - Reactivate Employee for Re-Onboarding (Priority: P2)

As the system, when a previously terminated employee is reactivated in the HR directory, I want to transition them to an invited status, cancel old credentials, and generate a new onboarding invitation.

**Why this priority**: Supports safe rehiring flows by ensuring old credentials remain invalid and forcing the user to undergo a fresh, secure onboarding process.

**Independent Test**: Reactivate a terminated employee. Verify their status changes to invited, old credentials/passwords do not work, and a new invitation token/notification event is generated.

**Acceptance Scenarios**:

1. **Given** an archived user account, **When** they are reactivated, **Then** their account status is updated to invited, old credentials remain dead, a new pending invitation is generated, and a user invited notification event is published.
2. **Given** a reactivated user has an older/stale lifecycle event delivered, **When** the event is processed, **Then** it is discarded based on version comparison and the current state is preserved.

---

### Edge Cases

- **Out of Order Events**: When an event with a lower sequence version than the currently processed status arrives, the system must ignore it to prevent overwriting newer updates.
- **Concurrent Lifecycle Events**: When multiple lifecycle status updates are processed concurrently for the same employee, they must execute sequentially to avoid database race conditions.
- **Missing Employee Reference**: When a lifecycle event is received for an employee who has no corresponding access/auth reference, the event is acknowledged and logged as an unknown reference.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST consume employee lifecycle events (`employee.suspended`, `employee.terminated`, `employee.reactivated`) from the Directory/HR domain.
- **FR-002**: The system MUST process events idempotently using a source sequence version. Events with a sequence version less than or equal to the stored version MUST be discarded.
- **FR-003**: The system MUST update the user status mapping as follows:
  - Suspended -> `DISABLED`
  - Terminated -> `ARCHIVED`
  - Reactivated -> `INVITED`
- **FR-004**: The system MUST increment the user's security version whenever their employment status changes.
- **FR-005**: On termination or reactivation, the system MUST revoke any existing pending invitations for that user.
- **FR-006**: On reactivation, the system MUST generate a new, secure invitation record in a pending status.
- **FR-007**: On suspension or termination, the system MUST immediately revoke all active authentication sessions associated with the user.
- **FR-008**: The system MUST reliably publish transaction-backed outbound events (`authentication.sessions-revoked` or `authentication.user-invited`) indicating the change in user access.

---

### Key Entities

- **User**: Represents the authentication identity of the individual. Key attributes include status (Invited, Active, Disabled, Archived) and security version.
- **Employee Reference**: Links the authentication user record to the corresponding employee profile in the HR domain. Tracks the source sequence version for event ordering.
- **Invitation**: Represents an active or historical onboarding invitation. Attributes include status (Pending, Revoked, Accepted) and secure token details.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of active sessions in the authentication store are revoked within 1 second of the state update transaction commit.
- **SC-002**: 100% of out-of-order or duplicate events are discarded without altering user status or session states.
- **SC-003**: Zero old credentials or passwords can be used to log in after reactivation; the user must successfully complete the new onboarding invitation flow.

---

## Assumptions

- The actual delivery of email notifications for new invitations is handled by an external notification service; the access service is only responsible for state persistence and event publishing.
- The HR domain provides a monotonic sequence version in its event payloads to enable ordering and idempotency check.
- High database connection reliability is assumed, with retry mechanisms handling temporary lock contention or network blips.

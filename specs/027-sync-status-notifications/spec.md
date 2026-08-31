# Feature Specification: Synchronization Status Visibility & Outcome Notifications

**Feature Branch**: `027-sync-status-notifications`

**Created**: 2026-08-31

**Status**: Ready for Planning

**Input**: User description: "Backend task breakdown for real-time visibility into Role and User Group synchronization state, plus event-driven completion/failure notifications."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Real-Time Visibility of Synchronization Health and Progress (Priority: P1)

Tenant administrators configuring Roles and User Groups require real-time visibility into whether authorization changes have been fully applied to live user access, are currently processing, remain pending background reconciliation, or have failed. They also need key operational context including the last successful synchronization timestamp, affected user count, active progress details, and next expected synchronization method.

**Why this priority**: Core value of the feature — eliminates uncertainty regarding whether authorization configurations are live and active in the system, preventing administrative confusion during critical permission updates.

**Independent Test**: Can be tested by creating or modifying a User Group or Role under various synchronization states (`Pending`, `Processing`, `Completed`, `Failed`), fetching entity synchronization status, and verifying exact state, metadata, and progress counters match reality.

**Acceptance Scenarios**:

1. **Given** a Role or User Group has unsaved/unapplied changes (`version > projection_version`) and no active job running, **When** an administrator views its synchronization status, **Then** the system displays status `Pending`, next expected sync method `Scheduled Daily`, and the timestamp of the last successful synchronization.
2. **Given** an authorization entity is actively being processed by a synchronization job, **When** an administrator views its synchronization status, **Then** the system displays status `Processing`, next expected sync method `Manual In-Flight`, along with real-time processed and total user progress counts.
3. **Given** an authorization entity has no pending changes (`version == projection_version`) and no active job, **When** an administrator views its synchronization status, **Then** the system displays status `Completed`, next expected sync method `None`, and the latest successful completion timestamp.
4. **Given** a synchronization attempt for an entity failed, **When** an administrator views its synchronization status, **Then** the system displays status `Failed`, a sanitized error code and summary reason, the failure timestamp, and an indication that the synchronization is retryable.

---

### User Story 2 - Tenant-Wide Synchronization Status Summary (Priority: P2)

Tenant administrators managing enterprise organizations need a consolidated tenant-wide overview displaying aggregate counts of entities in `Completed`, `Pending`, `Processing`, and `Failed` states to assess platform authorization health at a glance.

**Why this priority**: Enables high-level monitoring and rapid triage of authorization synchronization across large numbers of dynamic User Groups and custom Roles without manually inspecting every entity one by one.

**Independent Test**: Can be tested by setting up a tenant with a known distribution of User Groups and Roles across different sync states and verifying the summary endpoint returns accurate aggregate counts matching the active population.

**Acceptance Scenarios**:

1. **Given** a tenant containing multiple Roles and User Groups in various synchronization states, **When** an administrator requests the synchronization summary, **Then** the system returns accurate aggregate counts (`totalEntities`, `completed`, `pending`, `processing`, `failed`).
2. **Given** an entity transitions from `Pending` to `Processing` or `Completed`, **When** the tenant summary is requested, **Then** the aggregate counters immediately reflect the updated state distribution.

---

### User Story 3 - Event-Driven Outcome Notifications for High-Impact, Long-Running, and Failed Runs (Priority: P3)

When synchronization operations complete or fail, administrators need timely notifications proportional to operational risk. Standard low-impact syncs deliver in-app notifications, whereas high-impact syncs (affecting a large population of users), long-running syncs (exceeding execution duration thresholds), and all failed syncs must trigger high-priority alerts across both in-app and email channels.

**Why this priority**: Keeps administrators informed of critical security and operational outcomes without overwhelming them with unnecessary email notifications for routine, sub-second updates.

**Independent Test**: Can be tested by executing synchronization jobs with varying durations, affected user counts, and completion statuses, and verifying that published outcome events contain accurate classification flags (`isHighImpact`, `isLongRunning`, `requiresEmailNotification`).

**Acceptance Scenarios**:

1. **Given** a synchronization job finishes processing and the number of affected users meets or exceeds the high-impact threshold, **When** the outcome event is published, **Then** the system tags the event with `isHighImpact: true` and `requiresEmailNotification: true` for downstream email and in-app delivery.
2. **Given** a synchronization job finishes processing and its duration meets or exceeds the long-running threshold, **When** the outcome event is published, **Then** the system tags the event with `isLongRunning: true` and `requiresEmailNotification: true`.
3. **Given** a synchronization job fails due to an evaluation or system error, **When** the failure outcome event is published, **Then** the system records a sanitized error code and user-friendly error message, tagging the event with `requiresEmailNotification: true`.
4. **Given** a routine low-impact synchronization completes quickly below all risk thresholds, **When** the outcome event is published, **Then** the system tags the event with `isHighImpact: false`, `isLongRunning: false`, and `requiresEmailNotification: false` (in-app only).

---

### User Story 4 - Actionable Recovery and Retry for Failed Synchronizations (Priority: P4)

When an authorization synchronization encounters an error and enters `Failed` status, administrators require an immediate, one-click recovery mechanism to retry the synchronization without needing to modify configuration criteria or wait for the next scheduled background reconciliation.

**Why this priority**: Empowers administrators to quickly resolve transient errors (such as temporary network glitches or timeout conditions) and restore authorization consistency promptly.

**Independent Test**: Can be tested by setting an entity to `Failed` status, triggering the retry operation, and asserting that a new synchronization job is enqueued in `Pending`/`Processing` status, duplicate retries are prevented, and an audit trail event is recorded.

**Acceptance Scenarios**:

1. **Given** a User Group or Role is in `Failed` status, **When** an administrator initiates a retry, **Then** the system enqueues a new synchronization job under `MANUAL` trigger type, resets the entity's apparent status out of `Failed`, and records an audit event.
2. **Given** an entity is already in `Completed` status, **When** an administrator attempts to trigger a retry, **Then** the system rejects the request with a client error indicating that no failed synchronization exists.
3. **Given** a retry job is already actively `Processing` for an entity, **When** an administrator triggers another retry, **Then** the system detects the in-flight job, returns the existing active job details, and prevents duplicate job creation.

---

### User Story 5 - Multi-Tenant Authorization Isolation and Immutable Audit Trail (Priority: P5)

All synchronization queries, summary dashboards, retry operations, and outcome events must be strictly bounded to the authenticated administrator's tenant. All status transitions and manual recovery actions must produce immutable security audit records.

**Why this priority**: Fundamental security and compliance requirement — prevents cross-tenant data leakage and ensures complete administrative accountability for access changes.

**Independent Test**: Can be tested by issuing status requests and retry commands across tenant boundaries to verify strict non-exposure (404 Not Found), and inspecting the security outbox/audit records for full metadata compliance.

**Acceptance Scenarios**:

1. **Given** an authenticated administrator belonging to Tenant A, **When** they attempt to view or retry synchronization for an entity belonging to Tenant B, **Then** the system denies access with a not-found response and leaks no metadata about Tenant B.
2. **Given** an administrator executes a retry or a synchronization job concludes, **When** state changes occur, **Then** the system persists immutable security audit records and Transactional Outbox events with zero secrets and zero PII.

---

### Edge Cases

- **Concurrent Configuration Updates Mid-Sync**: If an administrator edits an entity (incrementing its `version`) while a previous sync job is actively `Processing` or `Failed`, the status projection service computes the state relative to the latest configuration version (showing `Processing` for the active version or `Pending` for the newly unapplied version once the prior job finishes).
- **Zero-Matching Population**: If a User Group evaluates to 0 matching members, the synchronization completes successfully with `affected_users = 0` and status `Completed` (a valid non-error state).
- **Worker Crash or Transient Infrastructure Failure**: If a worker or database connection fails mid-sync, the entity remains flagged as `Processing`/`Failed`/`Pending`, and never falsely reports `Completed`.
- **Rapid Successive Retry Requests**: If an administrator clicks "Retry" multiple times in rapid succession, concurrency controls and database unique constraints prevent duplicate in-flight job creation and return the active job smoothly.
- **Sanitization of Raw Error Stacks**: Internal database errors, query traces, and infrastructure exceptions are sanitized into high-level business error codes and safe messages before inclusion in status DTOs, audit logs, and notification events.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a real-time read-only projection service that computes canonical synchronization status (`Pending`, `Processing`, `Completed`, `Failed`) for any Role or User Group within the caller's tenant.
- **FR-002**: System MUST compute `Pending` status when `version > projection_version` with no active job, or when the latest job is `PENDING`.
- **FR-003**: System MUST compute `Processing` status when the latest sync job is currently in `PROCESSING` state.
- **FR-004**: System MUST compute `Failed` status when the latest sync job has `status = 'FAILED'` and `version > projection_version`.
- **FR-005**: System MUST compute `Completed` status when `version == projection_version` and no active sync job is in progress.
- **FR-006**: System MUST derive the next expected sync method: `MANUAL_IN_FLIGHT` (when an active manual job exists), `SCHEDULED_DAILY` (when changes are pending with no active manual job), or `NONE` (when fully completed).
- **FR-007**: System MUST surface the timestamp of the last successful synchronization, the affected user count, and real-time processed/total progress counters.
- **FR-008**: System MUST provide a tenant-wide aggregate summary endpoint returning counts of total entities and breakdown by synchronization state (`completed`, `pending`, `processing`, `failed`).
- **FR-009**: System MUST enrich sync completion outbox events (`authorization.sync-completed`) with execution duration (`durationMs`), high-impact evaluation (`isHighImpact`), long-running evaluation (`isLongRunning`), and email routing flag (`requiresEmailNotification = isHighImpact || isLongRunning`).
- **FR-010**: System MUST enrich sync failure outbox events (`authorization.sync-failed`) with execution duration (`durationMs`), sanitized error code, user-friendly error message, and mandatory email routing flag (`requiresEmailNotification = true`).
- **FR-011**: System MUST strictly delegate all email and in-app message delivery to the downstream notification service via asynchronous Kafka events without making direct outbound network calls from the domain service.
- **FR-012**: System MUST provide a retry endpoint allowing administrators with appropriate permissions (`user_group.sync`, `role.sync`) to retry an entity in `Failed` status.
- **FR-013**: System MUST reject retry attempts for already `Completed` entities with a clear business error, and deduplicate concurrent retry requests to prevent duplicate in-flight jobs.
- **FR-014**: System MUST enforce strict multi-tenant boundary isolation across all status queries, summaries, retries, and event payloads based on the caller's verified `tenant_code`.
- **FR-015**: System MUST persist all synchronization lifecycle actions and retry requests to the immutable Transactional Outbox / audit log with zero secrets and masked sensitive data.
- **FR-016**: System MUST expose dedicated Prometheus/OpenTelemetry metrics for status query latency, active entity status distribution, retry attempt counts, and notification event emission volumes.

### Key Entities *(include if feature involves data)*

- **Synchronization Status Projection**: Virtual read-only composite entity representing the current synchronization health of a Role or User Group. Composed of canonical status (`Pending`, `Processing`, `Completed`, `Failed`), last successful sync timestamp, affected user count, next expected sync method (`MANUAL_IN_FLIGHT`, `SCHEDULED_DAILY`, `NONE`), active job progress, and retryability.
- **Authorization Sync Job (`authorization_sync_jobs`)**: Persisted execution record of a synchronization run containing tenant code, source type (`USER_GROUP`, `ROLE`), source ID, source version, trigger type (`MANUAL`, `SCHEDULED`), processing timestamps, progress counters, status, and sanitized error details.
- **User Group & Role Configurations (`user_groups`, `roles`)**: Primary authorization entities containing `version` (latest configuration version) and `projection_version` (last converged projection version).
- **Security Audit & Outbox Event (`auth_security_events_outbox`)**: Transactional outbox records capturing immutable event payloads (`authorization.sync-requested`, `authorization.sync-completed`, `authorization.sync-failed`) for downstream processing and audit trails.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Administrators can retrieve accurate, real-time synchronization status and progress for any Role or User Group in under 50 milliseconds.
- **SC-002**: Tenant-wide synchronization summaries across up to 1,000 authorization entities are computed and returned in under 100 milliseconds.
- **SC-003**: 100% of failed synchronizations display actionable failure reasons and a functioning one-click retry path.
- **SC-004**: 100% of high-impact, long-running, and failed synchronization runs reliably emit classified outcome events for email and in-app notification routing.
- **SC-005**: 0% false `Completed` status reports during network disruptions, mid-processing mutations, or worker crashes.
- **SC-006**: Zero cross-tenant data leakage across all status queries, summary dashboards, retries, and published event streams.

## Assumptions

- **Notification Delivery Service**: `hros-notification-service` is responsible for consuming `authorization.sync-completed` and `authorization.sync-failed` events and dispatching in-app alerts and emails to relevant tenant administrators.
- **Configurable Risk Thresholds**: The high-impact threshold (e.g., 500+ affected users) and long-running duration threshold (e.g., 30+ seconds) are configurable via environment / shared configuration.
- **Permissions**: Viewing status requires `user_group.view` or `role.view` permissions; retrying a sync requires `user_group.sync` or `role.sync` permissions.
- **Underlying Engine Reuse**: The synchronization projection and retry mechanisms build upon the foundational manual and scheduled reconciliation infrastructure established in earlier features.

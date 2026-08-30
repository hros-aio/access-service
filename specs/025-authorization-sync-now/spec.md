# Feature Specification: Authorization Sync Now

**Feature Branch**: `025-authorization-sync-now`

**Created**: 2026-08-30

**Status**: Ready for Planning

**Input**: User description: "Manual, on-demand synchronization for Roles and User Groups with unapplied changes — bypasses the scheduled batch delay while running the recalculation safely and asynchronously, with full status transparency."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trigger Immediate On-Demand Synchronization (Priority: P1)

Tenant administrators need the ability to manually trigger synchronization immediately after updating a Role or User Group definition (where pending changes exist), so that affected users receive updated access privileges without waiting for the next scheduled background batch.

**Why this priority**: Core value proposition of the feature — allows administrators to immediately apply critical authorization changes and unblock end users.

**Independent Test**: Can be tested by creating/editing a User Group or Role, triggering `POST /authz/sync-now`, and verifying that a background sync job is queued/processed immediately and effective access projections are updated.

**Acceptance Scenarios**:

1. **Given** a User Group or Role has pending changes (`version > projection_version`), **When** an authorized tenant administrator triggers Sync Now, **Then** the system marks the job status as `PROCESSING`/`PENDING`, immediately kicks off asynchronous recalculation, and returns the sync job tracking details without blocking the HTTP response.
2. **Given** a User Group or Role has already been synchronized (`version == projection_version`), **When** an administrator triggers Sync Now, **Then** the system completes as an idempotent no-op, returns the current synchronized state, and creates no redundant background recalculation job.

---

### User Story 2 - Track Synchronization Progress and Job Transparency (Priority: P2)

Tenant administrators need real-time visibility into the status, user counts, and progress of an in-flight or completed synchronization job so they can confirm when permission changes are fully active across the organization.

**Why this priority**: Essential for administrative UX and operational confidence, particularly in large tenants where recalculating group memberships and effective roles spans thousands of users.

**Independent Test**: Can be tested by querying `GET /authz/sync-jobs/:jobId` during and after a sync operation to verify progress updates (`processed_users` vs `total_users`) and final completion status.

**Acceptance Scenarios**:

1. **Given** an in-flight sync job, **When** an administrator queries the job status, **Then** the system returns the current lifecycle status (`PENDING` or `PROCESSING`), start timestamp, total estimated users, and count of processed users.
2. **Given** a completed or failed sync job, **When** an administrator queries the job status, **Then** the system returns the terminal status (`COMPLETED` or `FAILED`), duration/completion timestamps, and detailed error summaries if failed.

---

### User Story 3 - Concurrency Deduplication and Batch Collision Safety (Priority: P3)

When multiple administrators trigger Sync Now simultaneously or when a scheduled batch runs concurrently with a manual Sync Now for the same entity and version, the system must coordinate safely without duplicating work or double-applying projections.

**Why this priority**: Prevents race conditions, database contention, and wasted compute resources under heavy concurrent access or overlapping operational schedules.

**Independent Test**: Can be tested by issuing rapid concurrent Sync Now requests for the same dirty entity version and verifying only one active job runs while both callers receive consistent tracking status.

**Acceptance Scenarios**:

1. **Given** a sync job is already `PENDING` or `PROCESSING` for an entity version, **When** another Sync Now request is received for the same entity version, **Then** the system deduplicates the request and returns the existing in-flight job handle without creating a duplicate job.
2. **Given** an entity configuration is edited again while a sync job is actively processing (advancing `version` beyond `source_version`), **When** the running job finishes, **Then** the entity remains marked as having pending changes (`version > projection_version`), enabling subsequent sync.

---

### User Story 4 - Multi-Tenant Isolation and Audit Event Notification (Priority: P4)

Every sync action must remain strictly scoped to the requesting tenant, and all sync lifecycle transitions (requested, completed, failed) must produce immutable audit records and downstream notification events.

**Why this priority**: Enforces enterprise compliance, multi-tenant data confidentiality, and stakeholder alerting for failed or high-impact synchronization runs.

**Independent Test**: Can be tested by attempting cross-tenant job queries (verifying 404 isolation) and checking the transactional outbox / audit log for generated event records upon sync completion or failure.

**Acceptance Scenarios**:

1. **Given** a sync job belonging to Tenant A, **When** an administrator from Tenant B attempts to view or trigger sync on Tenant A's entity, **Then** the system returns a 404 Not Found error without disclosing existence.
2. **Given** a sync job completes or encounters an unrecoverable failure, **When** the terminal state is committed, **Then** the system records an immutable audit log entry and publishes outbox events (`authorization.sync-completed` or `authorization.sync-failed`) for downstream notifications.

---

### Edge Cases

- **Worker Process Interruption**: A background worker crashes or terminates mid-execution while processing a batch. The system watchdog detects jobs stuck in `PROCESSING` past a configurable threshold and marks them for recovery or failure.
- **Mid-Sync Configuration Mutation**: An administrator edits a User Group or Role while recalculation is underway. The job finishes its target `source_version` but the entity remains in a dirty state (`version > projection_version`) so that newer changes are not missed.
- **Large User Populations**: recalculating effective roles for tens of thousands of users executes in bounded transactional batches (default 500 users) so table locks are brief and HTTP timeouts are prevented.
- **Cache Invalidation Degraded**: Redis cache invalidation encounters a transient network glitch after database commit. The durable database state remains committed and the cache self-heals on subsequent cache misses.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an on-demand endpoint (`POST /authz/sync-now`) accepting a target `source_type` (`USER_GROUP` or `ROLE`) and `source_id`.
- **FR-002**: System MUST verify caller authorization requiring tenant-level admin capabilities (`user_group.sync` or `role.sync`) and enforce strict tenant scoping via `RequestContext`.
- **FR-003**: System MUST verify if the target entity has pending changes (`version > projection_version`). If already synchronized (`version == projection_version`), it MUST complete immediately as a no-op returning the current status.
- **FR-004**: System MUST prevent duplicate concurrent sync jobs for the same `(tenant_code, source_type, source_id, source_version)` tuple when a job is already in `PENDING` or `PROCESSING` status.
- **FR-005**: System MUST execute authorization projection recalculations asynchronously in background worker processes using bounded batch sizes (default 500 users per batch).
- **FR-006**: System MUST update projection version (`projection_version = source_version`) upon successful recalculation and advance entity status to synchronized.
- **FR-007**: System MUST provide a status endpoint (`GET /authz/sync-jobs/:jobId`) reporting real-time progress (`processed_users`, `total_users`, status, timestamps, error details).
- **FR-008**: System MUST implement a watchdog mechanism to identify orphaned or stalled `PROCESSING` jobs past a configurable timeout threshold (default 10 minutes) and handle recovery.
- **FR-009**: System MUST record immutable audit log entries for all sync lifecycle events (request, complete, fail) with zero secret leakage.
- **FR-010**: System MUST persist event messages (`authorization.sync-requested`, `authorization.sync-completed`, `authorization.sync-failed`) to the Transactional Outbox table in the same transaction as state changes for downstream notification dispatch.
- **FR-011**: System MUST share the identical underlying recalculation and projection engine across both manual Sync Now and scheduled reconciliation workflows (ADR-A14).

### Key Entities *(include if feature involves data)*

- **Authorization Sync Job (`authorization_sync_jobs`)**: Represents an individual background synchronization execution record.
  - Attributes: `id` (UUID), `tenant_code`, `source_type` (`USER_GROUP` | `ROLE`), `source_id`, `source_version`, `trigger_type` (`MANUAL` | `SCHEDULED` | `SYSTEM`), `status` (`PENDING` | `PROCESSING` | `COMPLETED` | `FAILED`), `total_users`, `processed_users`, `error_details`, `started_at`, `completed_at`, `created_by`, `created_at`, `updated_at`.
- **User Group (`user_groups`)**: Defines dynamic matching rules and role associations. Contains `version` (increments on edit) and `projection_version` (tracks last synchronized version).
- **Role (`roles`)**: Defines permission sets and scope bindings. Contains `version` and `projection_version`.
- **User Effective Roles / Group Memberships (`user_group_memberships`, `user_effective_roles`)**: Projected authorization cache tables reflecting current materialized access per user.
- **Security Events Outbox (`auth_security_events_outbox`)**: Transactional outbox table capturing synchronization and security events for reliable Kafka publishing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Immediate HTTP response time for triggering Sync Now (`POST /authz/sync-now`) is under 200ms regardless of tenant user population size.
- **SC-002**: 100% of concurrent duplicate Sync Now requests for an in-flight job version are deduplicated without creating duplicate worker tasks.
- **SC-003**: 100% of sync requests, completions, and failures generate immutable audit log records and corresponding outbox event notifications.
- **SC-004**: Multi-tenant isolation guarantees 0% cross-tenant data leakage or access across all sync and status endpoints.
- **SC-005**: Orphaned or interrupted sync worker jobs are detected and recovered by the watchdog within the configured timeout window (10 minutes).

## Assumptions

- Target entities (`roles`, `user_groups`) already possess optimistic version columns (`version`, `projection_version`) aligned with domain data architecture.
- Downstream delivery of Kafka events (email/in-app notifications) is handled by `hros-notification-service` consuming from the outbox relay.
- Batch processing sizes (default 500 users) and watchdog intervals (default 10 minutes) are configurable via environment variables.
- Tenant context is consistently resolved upstream via `RequestContext` (AsyncLocalStorage) on every incoming API request.

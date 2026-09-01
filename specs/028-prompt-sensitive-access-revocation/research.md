# Research & Architectural Decisions: Prompt Revocation of Sensitive Access

## Decision 1: Immediate Synchronous Role Capability Revocation & Redis Cache Invalidation
- **Decision**: Update `role_permissions` in PostgreSQL and atomically write/evict the corresponding Redis role cache key `authz:role:{tenant}:{roleId}` in the exact same transactional/execution flow in `RoleApplicationService`. In-process L1 cache guards validate Redis version tags or subscribe to eviction events.
- **Rationale**: Immediate cutoff for role-level capability removal cannot wait for an asynchronous job queue. Business services evaluate permissions locally using `@hros/libs-apis` against Redis runtime keys. Updating Redis synchronously during the update request guarantees immediate enforcement on the very next HTTP request.
- **Alternatives Considered**:
  - *Asynchronous queueing for Role permissions*: Rejected because it introduces an unacceptable access window (several seconds or minutes) for high-risk capabilities like administrative privilege removal.
  - *Short TTL polling*: Rejected because it still leaves a window of vulnerability up to the TTL duration.

## Decision 2: Priority-Ordered Claiming in Authorization Sync Jobs (`SKIP LOCKED`)
- **Decision**: Add a `priority` column (`ENUM('URGENT', 'STANDARD', 'SCHEDULED')`) to `authorization_sync_jobs` with a composite index on `(status, priority, created_at)`. Update worker claim query to: `SELECT ... WHERE status = 'PENDING' ORDER BY priority DESC, created_at ASC FOR UPDATE SKIP LOCKED`.
- **Rationale**: User Group changes affect entire populations (dozens to thousands of users) which cannot be computed synchronously in a single HTTP request without risking HTTP timeouts. Enqueueing them with `URGENT` priority ensures the background sync worker prioritizes these jobs ahead of routine daily scheduled batch jobs (`SCHEDULED`) and normal manual syncs (`STANDARD`).
- **Alternatives Considered**:
  - *Separate Redis/BullMQ queue*: Rejected to preserve transactional outbox guarantees and ACID consistency within PostgreSQL while retaining a unified audit trail in `authorization_sync_jobs`.
  - *Synchronous group re-evaluation in HTTP thread*: Rejected because recomputing large populations would cause HTTP thread blocking, timeout errors, and connection pool exhaustion.

## Decision 3: Narrowly Scoped Cumulative Projection Recalculation
- **Decision**: In `EffectiveRoleReconciler` and `MembershipReconciler`, execute recalculation scoped strictly to affected user IDs. Compute the union of all remaining active User Group grants and direct role assignments.
- **Rationale**: Prevents full table scans and ensures that if a user holds a sensitive role via Group A and Group B, revoking it from Group A correctly keeps the role active via Group B without regression (cumulative independent grant rule).
- **Alternatives Considered**:
  - *Complete tenant-wide wipe and rebuild*: Rejected due to high I/O overhead, concurrency locking, and unnecessary cache thrashing.

## Decision 4: Failure Alerting & Critical Outbox Events
- **Decision**: When an `URGENT` synchronization job fails after configured retry attempts, the worker updates the job status to `FAILED` and appends an `authorization.sync-failed` event with `urgency: CRITICAL` to `auth_security_events_outbox`.
- **Rationale**: Conforms to Constitution Section 8 & PRD Rule 9/11 (zero silent failures, prompt alerting for security revocation failures, asynchronous dispatch via Transactional Outbox pattern).
- **Alternatives Considered**:
  - *Direct SMTP/HTTP webhook calls from Access Service*: Rejected because Constitution and ADRs forbid direct external notification calls from domain services; notifications must route through Kafka via Transactional Outbox.

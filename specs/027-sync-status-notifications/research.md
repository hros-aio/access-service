# Research: Synchronization Status Visibility & Outcome Notifications

## Decision 1: Sync Status Projection & Canonical State Resolution

- **Context**: Administrators need a consolidated view of whether a Role or User Group is live, pending, processing, or failed, along with next-sync expectations.
- **Decision**: Implement `SyncStatusProjectionService` in `AuthorizationSyncModule` providing deterministic, read-only status computation based on entity versioning and `authorization_sync_jobs` execution state.
- **State Resolution Rules**:
  - **`PROCESSING`**: Latest sync job for `(tenantCode, sourceType, sourceId)` has `status = 'PROCESSING'`.
  - **`PENDING`**: Latest sync job has `status = 'PENDING'` OR (`version > projection_version` with no active job).
  - **`FAILED`**: Latest sync job has `status = 'FAILED'` AND `version > projection_version`.
  - **`COMPLETED`**: `version == projection_version` AND no active job.
- **Next Sync Method Resolution**:
  - `MANUAL_IN_FLIGHT`: When an active job (`PENDING` or `PROCESSING` with `triggerType = MANUAL`) is running.
  - `SCHEDULED_DAILY`: When unapplied changes exist (`version > projection_version` or `status = 'PENDING'`) without an active manual job in flight.
  - `NONE`: When fully synchronized (`version == projection_version`).
- **Rationale**: Keeps status derivation clean, deterministic, and read-only without polluting database tables with ephemeral state flags.
- **Alternatives Considered**:
  - *Storing status columns on `user_groups` and `roles` tables*: Rejected because it introduces dual-write synchronization complexity, migration risk, and potential state drift during concurrent mutations.

---

## Decision 2: Tenant-Wide Status Summary Aggregation

- **Context**: Tenant admins need a high-level dashboard showing aggregate counts of entities in `Completed`, `Pending`, `Processing`, and `Failed` states.
- **Decision**: In `SyncStatusProjectionService.getTenantSummary(tenantCode)`, fetch active User Groups and custom/system Roles for the tenant, query their latest sync job state in batch using index `(tenant_code, source_type, source_id, created_at DESC)`, and aggregate composite state counts.
- **Rationale**: Bounded to active tenant configurations (typically < 100 User Groups and Roles per tenant). Single lightweight query with in-memory state mapping returns in < 50ms without N+1 query loops.
- **Alternatives Considered**:
  - *Database view or trigger-based rollups*: Rejected due to cross-table complexity and maintenance overhead in multi-tenant environments.

---

## Decision 3: Event Enrichment, Classification & Notification Delegation

- **Context**: High-impact, long-running, or failed synchronizations require multi-channel notifications (in-app and email), while routine fast syncs should only produce in-app notifications. Direct email dispatch from domain services violates architecture standards (ADR-17).
- **Decision**:
  - Calculate `durationMs = completed_at - started_at`.
  - Classify `isHighImpact = (affectedUsers >= HIGH_IMPACT_THRESHOLD)` (configurable, default 500).
  - Classify `isLongRunning = (durationMs >= LONG_RUNNING_SYNC_THRESHOLD_MS)` (configurable, default 30,000ms).
  - Compute `requiresEmailNotification = isHighImpact || isLongRunning` (for completed) or `true` (for all failed syncs).
  - Enrich `AuthSecurityEventOutbox.fromAuthorizationSyncCompleted` and `AuthSecurityEventOutbox.fromAuthorizationSyncFailed` payloads with these flags.
  - Transactional Outbox Relay publishes events to Kafka topic `authorization.sync-events`, which `hros-notification-service` consumes to dispatch in-app notifications and SendGrid/SMTP emails.
- **Rationale**: Clean decoupling per ADR-17 and PRD §5.10. Domain service remains fast, stateless, and focused on authorization; notification service manages templates and delivery channels.

---

## Decision 4: Failed Synchronization Retry Flow & In-Flight Deduplication

- **Context**: Administrators viewing a failed sync need a one-click retry path to trigger recovery.
- **Decision**:
  - Endpoint `POST /authz/sync-status/:sourceType/:sourceId/retry` validates caller permissions (`user_group.sync` / `role.sync`) and checks entity state.
  - If entity is not `FAILED` (e.g. already `COMPLETED`), return `400 Bad Request` ("No failed synchronization found for this entity").
  - If another sync job is currently `PENDING` or `PROCESSING`, return the existing active job without creating a duplicate (`200 OK` or conflict handling).
  - Otherwise, delegate to `AuthorizationSyncService.enqueueSyncJob` with `triggerType = MANUAL`, resetting the visible status out of `FAILED` and appending `authorization.sync-requested` audit event.
- **Rationale**: Reuses the core idempotent queuing logic with unique constraint handling (`uq_authz_sync_jobs_in_flight`) while providing clear error responses.

---

## Decision 5: Telemetry and Observability Metrics

- **Context**: Operations and engineering need visibility into status queries, retry counts, active entity status distributions, and notification emissions.
- **Decision**: Implement `AuthorizationSyncStatusMetrics` with:
  - `authz_sync_status_queries_duration_seconds` (Prometheus Histogram with labels `status`, `source_type`)
  - `authz_sync_active_entities_gauge` (Prometheus Gauge with labels `tenant_code`, `status`)
  - `authz_sync_retry_attempts_total` (Prometheus Counter with labels `source_type`, `result`)
  - `authz_sync_notifications_emitted_total` (Prometheus Counter with labels `channel_target`, `status`)
- **Rationale**: Provides real-time operational alerts without unbounded label cardinality.

# Quickstart Validation Guide: Authorization Sync Now

**Feature**: `025-authorization-sync-now`
**Status**: Ready for Implementation

This guide outlines runnable end-to-end verification scenarios to validate the on-demand synchronization functionality.

## Prerequisites

1. PostgreSQL database running with updated migrations applied.
2. Redis server active.
3. Node.js environment configured (`npm install`).

## Validation Scenarios

### Scenario 1: On-Demand Manual Sync for Dirty User Group

1. **Setup**:
   - Create a User Group `UG_SALES_ENGINEERING` in tenant `TEST_TENANT`.
   - Update its dynamic matching criteria or assign a role to increment `version` (e.g. `version = 2`, `projection_version = 1`).
2. **Action**:
   - Send `POST /authz/sync-now` with payload `{"sourceType": "USER_GROUP", "sourceId": "<UG_ID>"}`.
3. **Assertions**:
   - Endpoint returns status `200` with `status: "PENDING"`, `isNoOp: false`, and a valid `jobId`.
   - Polling `GET /authz/sync-jobs/<jobId>` shows transitions to `PROCESSING` and eventually `COMPLETED`.
   - Entity `user_groups` reflects `projection_version = 2`.
   - Outbox table contains `authorization.sync-requested` and `authorization.sync-completed` records.

---

### Scenario 2: Idempotent No-Op Check

1. **Setup**:
   - Ensure `UG_SALES_ENGINEERING` has `version == projection_version`.
2. **Action**:
   - Send `POST /authz/sync-now` with payload `{"sourceType": "USER_GROUP", "sourceId": "<UG_ID>"}`.
3. **Assertions**:
   - Endpoint returns `200` with `isNoOp: true`, `status: "COMPLETED"`, `jobId: null`.
   - No new `authorization_sync_jobs` row is created.

---

### Scenario 3: Concurrency Deduplication

1. **Setup**:
   - Make User Group `UG_SALES_ENGINEERING` dirty (`version = 3`, `projection_version = 2`).
2. **Action**:
   - Fire 5 concurrent requests to `POST /authz/sync-now` for `UG_SALES_ENGINEERING`.
3. **Assertions**:
   - All 5 requests return `200` with identical `jobId`.
   - Only 1 row exists in `authorization_sync_jobs` for version 3.

---

### Scenario 4: Cross-Tenant Isolation

1. **Setup**:
   - User Group belongs to `TENANT_A`.
2. **Action**:
   - Authenticated caller from `TENANT_B` calls `POST /authz/sync-now` or `GET /authz/sync-jobs/<jobId>`.
3. **Assertions**:
   - Returns `404 Not Found`.

---

### Scenario 5: Watchdog Crash Recovery

1. **Setup**:
   - Insert a job with status `PROCESSING` and `updated_at = NOW() - INTERVAL '15 minutes'`.
2. **Action**:
   - Trigger `SyncJobWatchdogService.checkAndReclaimStuckJobs()`.
3. **Assertions**:
   - Job is reclaimed back to `PENDING` (or marked `FAILED` if retry limit reached).
   - Corresponding outbox event is generated.

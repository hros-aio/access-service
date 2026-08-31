# Quickstart Guide: Synchronization Status Visibility & Outcome Notifications

This guide outlines end-to-end verification workflows for inspecting entity sync status, retrieving tenant-wide summaries, retrying failed synchronizations, and asserting enriched outcome notification events.

---

## 1. Prerequisites & Environment Setup

Ensure the NestJS application and PostgreSQL test container / instance are up and running:

```bash
# Verify unit tests pass
npm test -- src/modules/authorization/

# Verify TypeScript compilation
npm run build
```

---

## 2. Verification Scenarios

### Scenario A: Fetch Sync Status for an Entity with Pending Changes

**Request:**
```bash
curl -X GET http://localhost:3000/authz/sync-status/USER_GROUP/d3b07384-d113-4f7f-8d26-302dfb890f5c \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "X-Tenant-Code: DEFAULT_TENANT"
```

**Expected Response (HTTP 200):**
```json
{
  "sourceType": "USER_GROUP",
  "sourceId": "d3b07384-d113-4f7f-8d26-302dfb890f5c",
  "status": "PENDING",
  "lastSuccessfulSyncAt": "2026-08-30T12:00:00.000Z",
  "affectedUserCount": 450,
  "nextExpectedSyncMethod": "SCHEDULED_DAILY",
  "activeJob": null
}
```

---

### Scenario B: Fetch Sync Status for an Active Processing Job

**Request:**
```bash
curl -X GET http://localhost:3000/authz/sync-status/USER_GROUP/d3b07384-d113-4f7f-8d26-302dfb890f5c \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "X-Tenant-Code: DEFAULT_TENANT"
```

**Expected Response (HTTP 200):**
```json
{
  "sourceType": "USER_GROUP",
  "sourceId": "d3b07384-d113-4f7f-8d26-302dfb890f5c",
  "status": "PROCESSING",
  "lastSuccessfulSyncAt": "2026-08-30T12:00:00.000Z",
  "affectedUserCount": 1200,
  "nextExpectedSyncMethod": "MANUAL_IN_FLIGHT",
  "activeJob": {
    "jobId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "triggerType": "MANUAL",
    "progress": {
      "processed": 600,
      "total": 1200
    },
    "error": null,
    "retryable": false
  }
}
```

---

### Scenario C: Fetch Tenant-Wide Synchronization Summary

**Request:**
```bash
curl -X GET http://localhost:3000/authz/sync-status/summary \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "X-Tenant-Code: DEFAULT_TENANT"
```

**Expected Response (HTTP 200):**
```json
{
  "tenantCode": "DEFAULT_TENANT",
  "totalEntities": 45,
  "completed": 40,
  "pending": 3,
  "processing": 1,
  "failed": 1,
  "evaluatedAt": "2026-08-31T20:50:00.000Z"
}
```

---

### Scenario D: Retry a Failed Synchronization

**Request:**
```bash
curl -X POST http://localhost:3000/authz/sync-status/USER_GROUP/d3b07384-d113-4f7f-8d26-302dfb890f5c/retry \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "X-Tenant-Code: DEFAULT_TENANT"
```

**Expected Response (HTTP 200):**
```json
{
  "jobId": "e9f8a7b6-c5d4-e3f2-a1b0-c9d8e7f6a5b4",
  "tenantCode": "DEFAULT_TENANT",
  "sourceType": "USER_GROUP",
  "sourceId": "d3b07384-d113-4f7f-8d26-302dfb890f5c",
  "sourceVersion": 4,
  "triggerType": "MANUAL",
  "status": "PENDING",
  "message": "Authorization synchronization retry job queued successfully"
}
```

---

### Scenario E: Verify Enriched Outbox Event for High-Impact Completion

Query `auth_security_events_outbox` table after worker execution:
```sql
SELECT event_type, publish_status, sanitized_payload
FROM auth_security_events_outbox
WHERE event_type = 'authorization.sync-completed'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Payload:**
```json
{
  "jobId": "e9f8a7b6-c5d4-e3f2-a1b0-c9d8e7f6a5b4",
  "tenantCode": "DEFAULT_TENANT",
  "sourceType": "USER_GROUP",
  "sourceId": "d3b07384-d113-4f7f-8d26-302dfb890f5c",
  "sourceVersion": 4,
  "triggerType": "MANUAL",
  "totalUsers": 1500,
  "processedUsers": 1500,
  "affectedUsers": 1500,
  "durationMs": 4250,
  "isHighImpact": true,
  "isLongRunning": false,
  "requiresEmailNotification": true,
  "initiatedBy": "admin-user-uuid",
  "timestamp": "2026-08-31T20:55:00.000Z"
}
```

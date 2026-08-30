# Event Contracts: Authorization Sync Now

**Feature**: `025-authorization-sync-now`
**Status**: Completed

## 1. Outbox Event Topics & Types

All events are appended to `auth_security_events_outbox` inside the initiating database transaction and relayed to Kafka topics by the Transactional Outbox Worker.

- **`authorization.sync-requested`**: Emitted when a manual or scheduled sync job is queued.
- **`authorization.sync-completed`**: Emitted when a sync job successfully finishes projection rebuild and version advancement.
- **`authorization.sync-failed`**: Emitted when a sync job fails due to unhandled errors or watchdog expiration.

---

## 2. Event Payload Schemas

### `authorization.sync-requested`
```json
{
  "eventId": "123e4567-e89b-12d3-a456-426614174000",
  "eventType": "authorization.sync-requested",
  "tenantCode": "TENANT_ALPHA",
  "timestamp": "2026-08-30T14:45:00.000Z",
  "data": {
    "jobId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "sourceType": "USER_GROUP",
    "sourceId": "550e8400-e29b-41d4-a716-446655440000",
    "sourceVersion": 3,
    "triggerType": "MANUAL",
    "initiatedBy": "usr_admin_01"
  }
}
```

### `authorization.sync-completed`
```json
{
  "eventId": "123e4567-e89b-12d3-a456-426614174001",
  "eventType": "authorization.sync-completed",
  "tenantCode": "TENANT_ALPHA",
  "timestamp": "2026-08-30T14:45:15.000Z",
  "data": {
    "jobId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "sourceType": "USER_GROUP",
    "sourceId": "550e8400-e29b-41d4-a716-446655440000",
    "sourceVersion": 3,
    "triggerType": "MANUAL",
    "totalUsers": 1250,
    "processedUsers": 1250,
    "durationMs": 15000,
    "initiatedBy": "usr_admin_01"
  }
}
```

### `authorization.sync-failed`
```json
{
  "eventId": "123e4567-e89b-12d3-a456-426614174002",
  "eventType": "authorization.sync-failed",
  "tenantCode": "TENANT_ALPHA",
  "timestamp": "2026-08-30T14:46:00.000Z",
  "data": {
    "jobId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "sourceType": "USER_GROUP",
    "sourceId": "550e8400-e29b-41d4-a716-446655440000",
    "sourceVersion": 3,
    "triggerType": "MANUAL",
    "processedUsers": 500,
    "totalUsers": 1250,
    "errorDetails": {
      "message": "Watchdog timeout exceeded past 10 minutes",
      "code": "WATCHDOG_TIMEOUT"
    },
    "initiatedBy": "usr_admin_01"
  }
}
```

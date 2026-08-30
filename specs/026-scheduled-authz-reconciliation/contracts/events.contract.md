# Event Contracts: Scheduled Authorization Reconciliation

**Feature**: `026-scheduled-authz-reconciliation`
**Status**: Completed

## 1. Outbox Event Topics & Types

Scheduled reconciliation reuses the event envelope and Kafka topics established by `025-authorization-sync-now`, populated with `triggerType = "SCHEDULED"` and `initiatedBy = "SYSTEM"`.

---

## 2. Event Payload Schemas

### `authorization.sync-requested` (Scheduled)

```json
{
  "eventId": "123e4567-e89b-12d3-a456-426614174010",
  "eventType": "authorization.sync-requested",
  "tenantCode": "TENANT_ALPHA",
  "timestamp": "2026-08-31T00:00:01.000Z",
  "data": {
    "jobId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb70",
    "sourceType": "USER_GROUP",
    "sourceId": "550e8400-e29b-41d4-a716-446655440000",
    "sourceVersion": 4,
    "triggerType": "SCHEDULED",
    "initiatedBy": "SYSTEM"
  }
}
```

### `authorization.sync-completed` (Scheduled)

```json
{
  "eventId": "123e4567-e89b-12d3-a456-426614174011",
  "eventType": "authorization.sync-completed",
  "tenantCode": "TENANT_ALPHA",
  "timestamp": "2026-08-31T00:00:15.000Z",
  "data": {
    "jobId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb70",
    "sourceType": "USER_GROUP",
    "sourceId": "550e8400-e29b-41d4-a716-446655440000",
    "sourceVersion": 4,
    "triggerType": "SCHEDULED",
    "totalUsers": 2400,
    "processedUsers": 2400,
    "durationMs": 14000,
    "initiatedBy": "SYSTEM"
  }
}
```

### `authorization.sync-failed` (Scheduled)

```json
{
  "eventId": "123e4567-e89b-12d3-a456-426614174012",
  "eventType": "authorization.sync-failed",
  "tenantCode": "TENANT_BETA",
  "timestamp": "2026-08-31T00:00:20.000Z",
  "data": {
    "jobId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb71",
    "sourceType": "USER_GROUP",
    "sourceId": "550e8400-e29b-41d4-a716-446655440001",
    "sourceVersion": 2,
    "triggerType": "SCHEDULED",
    "processedUsers": 100,
    "totalUsers": 1200,
    "errorDetails": {
      "message": "Malformed demographic criteria syntax in tenant rule",
      "code": "CRITERIA_EVALUATION_ERROR"
    },
    "initiatedBy": "SYSTEM"
  }
}
```

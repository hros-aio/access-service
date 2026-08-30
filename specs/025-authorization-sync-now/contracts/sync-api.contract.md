# API Contracts: Authorization Sync Now

**Feature**: `025-authorization-sync-now`
**Status**: Completed

## 1. Trigger Sync Now

Trigger an immediate on-demand recalculation for a Role or User Group.

- **Method**: `POST`
- **Path**: `/authz/sync-now`
- **Headers**:
  - `Authorization: Bearer <JWT>`
  - `x-tenant-code: <TENANT_CODE>` (or extracted from JWT)
- **Permissions Required**: `user_group.sync` (for `USER_GROUP`) or `role.sync` (for `ROLE`)

### Request Body (`TriggerSyncNowDto`)

```json
{
  "sourceType": "USER_GROUP",
  "sourceId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Responses

#### 200 OK — Sync Job Created or In-Flight Returned
```json
{
  "success": true,
  "data": {
    "jobId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "tenantCode": "TENANT_ALPHA",
    "sourceType": "USER_GROUP",
    "sourceId": "550e8400-e29b-41d4-a716-446655440000",
    "sourceVersion": 3,
    "triggerType": "MANUAL",
    "status": "PENDING",
    "processedUsers": 0,
    "totalUsers": null,
    "isNoOp": false,
    "message": "Authorization synchronization job queued successfully"
  }
}
```

#### 200 OK — Idempotent No-Op (Already Synchronized)
```json
{
  "success": true,
  "data": {
    "jobId": null,
    "tenantCode": "TENANT_ALPHA",
    "sourceType": "USER_GROUP",
    "sourceId": "550e8400-e29b-41d4-a716-446655440000",
    "sourceVersion": 3,
    "triggerType": "MANUAL",
    "status": "COMPLETED",
    "processedUsers": 0,
    "totalUsers": 0,
    "isNoOp": true,
    "message": "Configuration is already fully synchronized"
  }
}
```

#### 404 Not Found — Entity Not Found or Cross-Tenant
```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "User group not found"
}
```

---

## 2. Poll Sync Job Status

Retrieve real-time execution status and user progress metrics for a sync job.

- **Method**: `GET`
- **Path**: `/authz/sync-jobs/:jobId`
- **Headers**:
  - `Authorization: Bearer <JWT>`
- **Permissions Required**: `user_group.read` or `role.read`

### Responses

#### 200 OK — Job Status
```json
{
  "success": true,
  "data": {
    "jobId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "tenantCode": "TENANT_ALPHA",
    "sourceType": "USER_GROUP",
    "sourceId": "550e8400-e29b-41d4-a716-446655440000",
    "sourceVersion": 3,
    "triggerType": "MANUAL",
    "status": "PROCESSING",
    "totalUsers": 1250,
    "processedUsers": 500,
    "progressPercentage": 40.0,
    "startedAt": "2026-08-30T14:45:00.000Z",
    "completedAt": null,
    "errorDetails": null,
    "createdBy": "usr_admin_01"
  }
}
```

#### 404 Not Found — Job Not Found or Cross-Tenant
```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Sync job not found"
}
```

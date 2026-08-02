# Event Contracts: Multi-Factor Authentication (MFA)

## 1. `authentication.mfa-enrolled`

Published when a user successfully verifies and activates a second-factor method.

- **Topic**: `authentication.mfa-events`
- **Producer**: `hros-access-service`
- **Partition Key**: `{tenantCode}:{userId}`

### Payload Schema
```json
{
  "eventId": "uuid",
  "eventType": "authentication.mfa-enrolled",
  "eventVersion": "1.0.0",
  "tenantCode": "tenant-001",
  "timestamp": "2026-08-02T12:46:00.000Z",
  "payload": {
    "tenantCode": "tenant-001",
    "userId": "usr-1234-uuid",
    "factorType": "totp",
    "isPrimary": true,
    "enrolledAt": "2026-08-02T12:46:00.000Z"
  },
  "traceId": "trace-abc-123",
  "correlationId": "corr-xyz-789"
}
```

---

## 2. `authentication.mfa-reset`

Published when an administrator resets a user's MFA factors.

- **Topic**: `authentication.mfa-events`
- **Producer**: `hros-access-service`
- **Partition Key**: `{tenantCode}:{userId}`

### Payload Schema
```json
{
  "eventId": "uuid",
  "eventType": "authentication.mfa-reset",
  "eventVersion": "1.0.0",
  "tenantCode": "tenant-001",
  "timestamp": "2026-08-02T12:46:00.000Z",
  "payload": {
    "tenantCode": "tenant-001",
    "targetUserId": "usr-1234-uuid",
    "adminUserId": "adm-9999-uuid",
    "resetAt": "2026-08-02T12:46:00.000Z"
  },
  "traceId": "trace-abc-123",
  "correlationId": "corr-xyz-789"
}
```

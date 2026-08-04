# Interface Contracts & Event Envelopes: Account Lockout

## 1. Authentication HTTP API Responses

### Login Failure Response (Generic Error)
All authentication failures (invalid credentials, account locked, non-existent account, inactive account, IP restriction failure) MUST return generic 401 Unauthorized responses to prevent account enumeration.

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid email or password"
}
```

---

## 2. Kafka Outbox Event Envelopes

### Event 1: `authentication.account-locked`
- **Topic**: `authentication.account-events`
- **Partition Key**: `{tenantCode}:{userId}`
- **Payload Schema**:
```json
{
  "eventId": "123e4567-e89b-12d3-a456-426614174000",
  "eventType": "authentication.account-locked",
  "eventVersion": "1.0.0",
  "producer": "hros-access-service",
  "timestamp": "2026-08-04T22:00:00.000Z",
  "tenantCode": "TENANT_A",
  "userId": "usr_123456",
  "payload": {
    "tenantCode": "TENANT_A",
    "userId": "usr_123456",
    "reason": "TOO_MANY_FAILED_ATTEMPTS",
    "failedAttempts": 5,
    "lockedAt": "2026-08-04T22:00:00.000Z"
  }
}
```

### Event 2: `authentication.sessions-revoked`
- **Topic**: `authentication.account-events`
- **Partition Key**: `{tenantCode}:{userId}`
- **Payload Schema**:
```json
{
  "eventId": "123e4567-e89b-12d3-a456-426614174001",
  "eventType": "authentication.sessions-revoked",
  "eventVersion": "1.0.0",
  "producer": "hros-access-service",
  "timestamp": "2026-08-04T22:00:00.000Z",
  "tenantCode": "TENANT_A",
  "userId": "usr_123456",
  "payload": {
    "tenantCode": "TENANT_A",
    "userId": "usr_123456",
    "reason": "ACCOUNT_LOCKED",
    "revokedAt": "2026-08-04T22:00:00.000Z"
  }
}
```

### Event 3: `authentication.security-alert-requested`
- **Topic**: `authentication.security-alerts`
- **Partition Key**: `{tenantCode}:{userId}`
- **Payload Schema**:
```json
{
  "eventId": "123e4567-e89b-12d3-a456-426614174002",
  "eventType": "authentication.security-alert-requested",
  "eventVersion": "1.0.0",
  "producer": "hros-access-service",
  "timestamp": "2026-08-04T22:00:00.000Z",
  "tenantCode": "TENANT_A",
  "userId": "usr_123456",
  "payload": {
    "tenantCode": "TENANT_A",
    "userId": "usr_123456",
    "alertType": "UNAPPROVED_IP_SPIKE",
    "sourceIp": "192.0.2.45",
    "attemptCount": 10,
    "detectedAt": "2026-08-04T22:00:00.000Z"
  }
}
```

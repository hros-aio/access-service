# Interface Contracts: Network Restriction

## Internal Module Service Contracts

### `IpRestrictionService.validateRequestLocation`

```typescript
export interface ValidateLocationOptions {
  tenantCode: string;
  sourceIp: string;
  actionType: AuthActionType;
  userId?: string;
}

export interface ValidateLocationResult {
  allowed: boolean;
  reason?: 'IP_NOT_ALLOWED' | 'INVALID_SOURCE_IP_FORMAT' | 'EXEMPTED';
}
```

## Kafka Outbox Event Schemas

### `authentication.login-failed`

```json
{
  "tenantCode": "TENANT_123",
  "userId": "usr_456",
  "loginMethod": "password",
  "failureReason": "IP_NOT_ALLOWED",
  "sourceIp": "192.168.1.50",
  "userAgent": "Mozilla/5.0 ...",
  "attemptedAt": "2026-08-05T22:00:00Z"
}
```

### `authentication.security-alert-requested`

```json
{
  "tenantCode": "TENANT_123",
  "userId": "usr_456",
  "alertType": "UNUSUAL_IP_FAILURE_SPIKE",
  "failureCount": 10,
  "sourceIp": "192.168.1.50",
  "detectedAt": "2026-08-05T22:00:00Z"
}
```

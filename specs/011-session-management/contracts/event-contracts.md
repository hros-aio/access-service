# Async API Event Contracts: Session Management

## 1. Event: `authentication.session-revoked`

- **Topic**: `authentication.session-events`
- **Trigger**: Single device logout (`POST /auth/logout`)
- **Producer**: `hros-access-service`
- **Consumer(s)**: Audit logging service, security analytics
- **Partition Key**: `{tenantCode}:{userId}`

### JSON Schema & Sample Payload

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["eventId", "eventType", "eventVersion", "timestamp", "tenantCode", "payload"],
  "properties": {
    "eventId": { "type": "string", "format": "uuid" },
    "eventType": { "type": "string", "enum": ["authentication.session-revoked"] },
    "eventVersion": { "type": "integer", "const": 1 },
    "timestamp": { "type": "string", "format": "date-time" },
    "tenantCode": { "type": "string" },
    "correlationId": { "type": "string" },
    "traceId": { "type": "string" },
    "payload": {
      "type": "object",
      "required": ["userId", "sessionId", "revokedAt"],
      "properties": {
        "userId": { "type": "string", "format": "uuid" },
        "sessionId": { "type": "string", "format": "uuid" },
        "revokedAt": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

---

## 2. Event: `authentication.sessions-revoked`

- **Topic**: `authentication.session-events`
- **Trigger**: Global security version bump, password reset/change with logout-all, or admin force-logout
- **Producer**: `hros-access-service`
- **Consumer(s)**: `hros-notification-service`, audit logging service, security analytics
- **Partition Key**: `{tenantCode}:{userId}`

### JSON Schema & Sample Payload

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["eventId", "eventType", "eventVersion", "timestamp", "tenantCode", "payload"],
  "properties": {
    "eventId": { "type": "string", "format": "uuid" },
    "eventType": { "type": "string", "enum": ["authentication.sessions-revoked"] },
    "eventVersion": { "type": "integer", "const": 1 },
    "timestamp": { "type": "string", "format": "date-time" },
    "tenantCode": { "type": "string" },
    "correlationId": { "type": "string" },
    "traceId": { "type": "string" },
    "payload": {
      "type": "object",
      "required": ["userId", "revokedByUserId", "reason", "revokedAt"],
      "properties": {
        "userId": { "type": "string", "format": "uuid" },
        "revokedByUserId": { "type": "string" },
        "reason": { "type": "string" },
        "revokedAt": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

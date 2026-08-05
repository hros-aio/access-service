# API & Event Contracts: Tenant Authentication Settings

## 1. REST Endpoints

### `GET /admin/settings/authentication`
Retrieves the current authentication settings for the tenant context.

#### Headers
- `Authorization`: `Bearer <JWT_TOKEN>`

#### Request Context
Injected via `@hros/libs-apis`:
- `tenantCode`: extracted from token or request headers

#### Response `200 OK`
```json
{
  "tenantCode": "TENANT_123",
  "mfaRequired": false,
  "selfServicePasswordResetEnabled": true,
  "lockoutEnabled": true,
  "lockoutThreshold": 5,
  "ipRestrictionEnabled": false,
  "ipAllowList": ["192.168.1.0/24"],
  "version": 1,
  "updatedAt": "2026-08-05T22:00:00.000Z"
}
```

---

### `PATCH /admin/settings/authentication`
Updates configurable tenant authentication security settings.

#### Headers
- `Authorization`: `Bearer <JWT_TOKEN>`

#### Request Body (`UpdateAuthenticationSettingsDto`)
```json
{
  "mfaRequired": true,
  "selfServicePasswordResetEnabled": true,
  "lockoutEnabled": true,
  "lockoutThreshold": 3,
  "ipRestrictionEnabled": true,
  "ipAllowList": ["192.168.1.0/24", "10.0.0.0/8"],
  "version": 1
}
```

#### Response `200 OK`
```json
{
  "tenantCode": "TENANT_123",
  "mfaRequired": true,
  "selfServicePasswordResetEnabled": true,
  "lockoutEnabled": true,
  "lockoutThreshold": 3,
  "ipRestrictionEnabled": true,
  "ipAllowList": ["192.168.1.0/24", "10.0.0.0/8"],
  "version": 2,
  "updatedAt": "2026-08-05T22:05:00.000Z"
}
```

#### Error Responses
- `400 Bad Request`: Invalid payload (e.g. malformed IP CIDR or non-positive threshold limit).
- `403 Forbidden`: Caller lacks administration permission.
- `404 Not Found`: Settings record missing for tenant.
- `409 Conflict`: Version mismatch (`ConcurrentModificationError`).

---

## 2. Event Payload Contract

### Topic: `authentication.settings-events`
- **Key**: `tenantCode`
- **Event Type**: `authentication.settings-updated`

```json
{
  "eventId": "c2b3e811-9a99-4678-83bb-123456789abc",
  "eventType": "authentication.settings-updated",
  "eventVersion": "1.0.0",
  "tenantCode": "TENANT_123",
  "occurredAt": "2026-08-05T22:05:00.000Z",
  "payload": {
    "tenantCode": "TENANT_123",
    "updatedByUserId": "usr_admin_99",
    "changes": {
      "mfaRequired": { "old": false, "new": true },
      "lockoutThreshold": { "old": 5, "new": 3 },
      "ipRestrictionEnabled": { "old": false, "new": true },
      "ipAllowList": { "old": ["192.168.1.0/24"], "new": ["192.168.1.0/24", "10.0.0.0/8"] }
    },
    "updatedAt": "2026-08-05T22:05:00.000Z"
  }
}
```

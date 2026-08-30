# API Contract: Impact Analysis & Preview Endpoints

## 1. POST `/roles/:id/impact-preview`

Evaluates prospective impact for role modifications (permission set changes or deactivation intent).

### Request
- **Headers**: `Authorization: Bearer <jwt>`, `x-tenant-code: <tenantCode>`
- **URL Parameters**: `id` (UUID) - Target role ID
- **Body**:
```json
{
  "permissionCodes": ["employee.profile.view", "leave.request.create"],
  "status": "ACTIVE"
}
```

### Response (200 OK)
```json
{
  "targetType": "ROLE",
  "targetId": "d9b2d63d-a232-4d2b-9e4a-5f33f9b2d63d",
  "estimate": {
    "usersGaining": 0,
    "usersLosing": 0,
    "totalAffected": 120,
    "isHighImpact": true,
    "threshold": 100,
    "isEstimated": false
  },
  "coverageLoss": null,
  "requiresConfirmation": true
}
```

---

## 2. POST `/user-groups/:id/impact-preview`

Evaluates prospective impact for user group modifications (matching rules, scope, or role assignments).

### Request
- **Headers**: `Authorization: Bearer <jwt>`, `x-tenant-code: <tenantCode>`
- **URL Parameters**: `id` (UUID) - Target user group ID
- **Body**:
```json
{
  "matchingRule": {
    "operator": "AND",
    "conditions": [
      {
        "field": "department",
        "operator": "EQ",
        "value": "Engineering"
      }
    ]
  },
  "scopeType": "DEPARTMENT",
  "scopeRefId": "dept-eng",
  "roleIds": ["d9b2d63d-a232-4d2b-9e4a-5f33f9b2d63d"],
  "status": "ACTIVE"
}
```

### Response (200 OK)
```json
{
  "targetType": "USER_GROUP",
  "targetId": "c8a1b2c3-d4e5-4f6a-8b9c-0d1e2f3a4b5c",
  "estimate": {
    "usersGaining": 150,
    "usersLosing": 12,
    "totalAffected": 162,
    "isHighImpact": true,
    "threshold": 100,
    "isEstimated": false
  },
  "coverageLoss": null,
  "requiresConfirmation": true
}
```

---

## 3. Error Response (409 Conflict - High Impact Confirmation Required)

Returned on mutation endpoints when `isHighImpact: true` and `confirmed` is omitted or false.

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "High-impact confirmation required for this operation",
  "code": "HIGH_IMPACT_CONFIRMATION_REQUIRED",
  "details": {
    "totalAffected": 162,
    "usersGaining": 150,
    "usersLosing": 12,
    "threshold": 100,
    "requiresConfirmation": true
  }
}
```

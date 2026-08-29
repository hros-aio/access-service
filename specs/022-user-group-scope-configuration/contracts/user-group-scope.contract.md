# User Group Scope API Contracts

## 1. Get User Group Scope Configuration
- **Method / Endpoint**: `GET /user-groups/:id/scope`
- **Permissions**: `user_group.read` or `user_group.update`
- **Response `200 OK`**:
```json
{
  "userGroupId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "scopeType": "DEPARTMENT",
  "scopeRefId": "dept-engineering-01",
  "version": 3,
  "projectionVersion": 2,
  "isPendingSync": true
}
```
- **Errors**:
  - `404 Not Found`: User group does not exist or belongs to another tenant.

---

## 2. Estimate User Group Scope Impact
- **Method / Endpoint**: `POST /user-groups/:id/scope/impact-estimate`
- **Permissions**: `user_group.update`
- **Request Body**:
```json
{
  "scopeType": "TENANT_WIDE",
  "scopeRefId": null
}
```
- **Response `200 OK`**:
```json
{
  "userGroupId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "affectedUserCount": 520,
  "threshold": 100,
  "requiresConfirmation": true,
  "currentScope": {
    "scopeType": "DEPARTMENT",
    "scopeRefId": "dept-engineering-01"
  },
  "proposedScope": {
    "scopeType": "TENANT_WIDE",
    "scopeRefId": null
  }
}
```
- **Errors**:
  - `400 Bad Request`: Invalid scope type or missing reference ID.
  - `404 Not Found`: User group not found.

---

## 3. Update User Group Scope Configuration
- **Method / Endpoint**: `PUT /user-groups/:id/scope`
- **Permissions**: `user_group.update`
- **Request Body**:
```json
{
  "scopeType": "DEPARTMENT",
  "scopeRefId": "dept-engineering-01",
  "expectedVersion": 3,
  "confirmed": true
}
```
- **Response `200 OK`**:
```json
{
  "userGroupId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "scopeType": "DEPARTMENT",
  "scopeRefId": "dept-engineering-01",
  "version": 4,
  "projectionVersion": 2,
  "isPendingSync": true
}
```
- **Errors**:
  - `400 Bad Request`: Validation errors on scope type or reference ID.
  - `404 Not Found`: User group not found in tenant.
  - `409 Conflict`: Optimistic locking conflict (`expectedVersion` mismatch).
  - `422 Unprocessable Entity`: High-impact confirmation required (`requiresConfirmation: true` but `confirmed: false`).

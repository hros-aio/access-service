# API Contract: Session Bootstrap Capabilities

## Endpoint Overview

Provides the cumulative permissions, authorized navigation modules, assigned role names, and current authorization version for an authenticated user to bootstrap the client UI.

- **Method**: `GET`
- **Path**: `/auth/bootstrap/capabilities`
- **Authentication**: Required (JWT Bearer Token via `Authorization: Bearer <token>` or Session Cookie)

---

## Headers

| Header          | Type   | Required | Description                                              |
| --------------- | ------ | -------- | -------------------------------------------------------- |
| `Authorization` | string | Yes      | Bearer JWT token                                         |
| `x-tenant-code` | string | Optional | Tenant identifier (inferred from JWT/session if omitted) |

---

## Responses

### 200 OK — Successful Resolution

```json
{
  "success": true,
  "data": {
    "authorizationVersion": 4,
    "permissions": ["employee.view", "leave.apply", "leave.approve", "team.directory"],
    "modules": ["employee-directory", "leave-management"],
    "roles": ["Employee", "Team Lead"]
  }
}
```

### 200 OK — Zero Groups / No Permissions

```json
{
  "success": true,
  "data": {
    "authorizationVersion": 1,
    "permissions": [],
    "modules": [],
    "roles": []
  }
}
```

### 401 Unauthorized

```json
{
  "statusCode": 401,
  "error": "UNAUTHORIZED",
  "message": "Authentication token is missing or invalid."
}
```

### 503 Service Unavailable

```json
{
  "statusCode": 503,
  "error": "AUTHZ_STORE_UNAVAILABLE",
  "message": "Authorization store is temporarily unavailable."
}
```

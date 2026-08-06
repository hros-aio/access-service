# API Contract Specification

This document details the HTTP endpoints exposed by `hrms-access-service` for invitation and first-time access setup.

All endpoints are prefixed with `/`.

---

## 1. Validate Invitation

Verify the validity of a raw invitation token.

* **Path**: `GET /invitations/validate`
* **Query Parameters**:
  * `token` (string, required): The raw token from the invitation URL.
* **Authentication**: None (Public)

### Response

#### `200 OK`
Returned if the token is valid, active, and has not expired.
```json
{
  "valid": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "employee@company.com",
  "tenantCode": "tenant123"
}
```

#### `400 Bad Request`
Returned if the token is invalid, expired, or revoked.
```json
{
  "statusCode": 400,
  "message": "Invitation link is invalid, revoked, or has expired",
  "error": "AUTH_INVITATION_INVALID"
}
```

---

## 2. Accept Invitation and Set Password

Submit password initialization for a user matching a valid raw invitation token.

* **Path**: `POST /invitations/accept`
* **Authentication**: None (Public)
* **Headers**:
  * `Content-Type`: `application/json`
* **Body**:
```json
{
  "token": "4a1c58bc79e2a40b13d5fa6cf83d2139...",
  "password": "SecurePassword123!"
}
```

### Response

#### `200 OK`
Returned if the invitation is successfully accepted, password is set, and user account is activated.
```json
{
  "success": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### `400 Bad Request`
Returned if the token is invalid or the password violates the password policy.
```json
{
  "statusCode": 400,
  "message": "Password does not meet complexity requirements",
  "error": "INVALID_PASSWORD_POLICY"
}
```

#### `503 Service Unavailable`
Returned if the Redis server is down, preventing session/challenge revocation.
```json
{
  "statusCode": 503,
  "message": "Authentication session store is temporarily unavailable",
  "error": "AUTH_SESSION_STORE_UNAVAILABLE"
}
```

---

## 3. Admin Resend Invitation

Allows a tenant Administrator to invalidate any previous pending invitation and issue a new one.

* **Path**: `POST /admin/users/:userId/invitation/resend`
* **Authentication**: JWT Asymmetric (Private Key Signed)
* **Permissions Required**: `access.user.resend-invitation`
* **Headers**:
  * `Authorization`: `Bearer <JWT>`
  * `X-Tenant-Code`: `tenant123` (used to scope resource queries to matching Tenant)

### Response

#### `200 OK`
Returned if the invitation was successfully generated and sent.
```json
{
  "success": true,
  "invitationId": "770e8400-e29b-41d4-a716-446655441111",
  "expiresAt": "2026-07-30T22:31:13.000Z"
}
```

#### `404 Not Found`
Returned if the user does not exist or belongs to a different Tenant.
```json
{
  "statusCode": 404,
  "message": "User not found",
  "error": "RESOURCE_NOT_FOUND"
}
```

#### `409 Conflict`
Returned if the user already has an active credential.
```json
{
  "statusCode": 409,
  "message": "Cannot resend invitation: user already has an active credential",
  "error": "INVITATION_NOT_ALLOWED"
}
```

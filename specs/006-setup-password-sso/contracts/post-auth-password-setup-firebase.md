# API Contract: POST /auth/password/setup/firebase

Defines the contract for creating a password using an active SSO setup session.

## Request Details

- **Method**: `POST`
- **Path**: `/api/v1/auth/password/setup/firebase`
- **Headers**:
  - `Authorization`: `Bearer <restricted_session_token>`
  - `Content-Type`: `application/json`

### Request Body Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "password": {
      "type": "string",
      "minLength": 8,
      "description": "Plaintext password to establish. Must satisfy tenant password policy rules."
    }
  },
  "required": ["password"],
  "additionalProperties": false
}
```

---

## Response Details

### Response 1: 200 OK (Password Setup Success - MFA Not Required)

Returned when the password is successfully set up and the user does not have mandatory MFA configured. The user must perform a fresh login using their new credentials to obtain access tokens.

```json
{
  "status": "success",
  "data": {
    "mfaRequired": false
  }
}
```


### Response 2: 200 OK (Password Setup Success - MFA Required)

Returned when the password is set up, but the tenant enforces mandatory MFA and the user must enroll.

```json
{
  "status": "success",
  "data": {
    "mfaRequired": true,
    "mfaSetupToken": "mfa_setup_flow_abc123..."
  }
}
```

### Response 3: 400 Bad Request (Invalid Password Policy)

Returned when the password does not satisfy complexity requirements.

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "errorCode": "INVALID_PASSWORD_POLICY",
  "message": "Password does not meet tenant security requirements."
}
```

### Response 4: 401 Unauthorized (Expired or Missing Setup Session)

Returned when the Bearer token is invalid, expired, or has no corresponding key in Redis.

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "errorCode": "AUTH_SESSION_EXPIRED",
  "message": "Setup session has expired. Please log in via SSO again."
}
```

### Response 5: 409 Conflict (Password Already Set Up)

Returned when the user account already has an active password credential configured.

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "errorCode": "CREDENTIAL_ALREADY_EXISTS",
  "message": "User already has an active password configured."
}
```

### Response 6: 503 Service Unavailable (Redis/Session-Store Failure)

Returned when the Redis cache or session store is unreachable or encounters an internal failure.

```json
{
  "statusCode": 503,
  "error": "Service Unavailable",
  "errorCode": "AUTH_SESSION_STORE_UNAVAILABLE",
  "message": "Service temporarily unavailable. Please try again later."
}
```

**Client Retry Expectation**: Clients should implement transient fault handling and retry the request after a short, exponentially backed-off delay.


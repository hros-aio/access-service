# API Contracts: Multi-Factor Authentication (MFA)

## 1. User MFA Endpoints (`MfaController`)

### `POST /auth/mfa/enroll`
Initiates factor enrollment.

- **Request Headers**: `Authorization: Bearer <RestrictedSessionToken>`
- **Request Body**:
  ```json
  {
    "factorType": "totp | email"
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "factorId": "uuid",
    "factorType": "totp",
    "status": "pending",
    "qrCodeUrl": "otpauth://totp/HRMS:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=HRMS",
    "expiresAt": "2026-08-02T12:50:00.000Z"
  }
  ```

---

### `POST /auth/mfa/enroll/verify`
Verifies enrollment code and activates the factor.

- **Request Body**:
  ```json
  {
    "factorId": "uuid",
    "factorType": "totp",
    "code": "123456"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "status": "active",
    "isPrimary": true,
    "enrolledAt": "2026-08-02T12:46:00.000Z"
  }
  ```
- **Response `400 Bad Request`**: Code mismatch / invalid OTP.
- **Response `409 Conflict`**: Active primary factor already exists.

---

### `POST /auth/mfa/challenge/verify`
Submits challenge verification during primary login flow.

- **Request Body**:
  ```json
  {
    "challengeId": "uuid",
    "code": "123456"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "d98f...",
    "expiresIn": 3600
  }
  ```
- **Response `429 Too Many Requests`**: Max verification attempts exceeded (`MFA_CHALLENGE_LOCKED`).

---

## 2. Admin MFA Endpoints (`MfaAdminController`)

### `POST /admin/users/:userId/mfa/reset`
Resets all MFA factors for a target user and revokes their active sessions.

- **Request Headers**: `Authorization: Bearer <AdminAccessToken>`
- **Path Parameters**: `userId` (UUID)
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "targetUserId": "uuid",
    "resetAt": "2026-08-02T12:46:00.000Z",
    "revokedSessionsCount": 3
  }
  ```
- **Response `404 Not Found`**: Target user not found in admin tenant context.

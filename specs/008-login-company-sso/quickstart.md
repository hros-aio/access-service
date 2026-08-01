# Quickstart & E2E Validation Guide: Firebase SSO Login

## Prerequisites & Setup

Ensure local environment or test container services are active:
- PostgreSQL DB running on port `5432` with `schema.sql` applied.
- Redis server running on port `6379`.

---

## Runnable Verification Scenarios

### Scenario 1: Active User Full Access SSO Login (TC-SSO-01)

1. **Seed Data**: Ensure active tenant `TENANT_01`, user `user-1`, and mapping `(TENANT_01, 'firebase', 'fb_uid_001')` with active password credential exist.
2. **Execute Request**:
   ```bash
   curl -X POST http://localhost:3000/api/v1/auth/login/firebase \
     -H "Content-Type: application/json" \
     -d '{
       "tenantCode": "TENANT_01",
       "idToken": "MOCK_VALID_ID_TOKEN_FB_001"
     }'
   ```
3. **Expected Result**: HTTP `200 OK`, JSON body containing `authState: 'ACTIVE'`, `accessToken`, and `refreshToken`.
4. **Verification**: Query Redis key `auth:session:*` to confirm session stored; query `auth_security_events_outbox` to confirm `authentication.sso-login-succeeded` event logged.

---

### Scenario 2: Unmapped External Identity Hard Rejection (TC-SSO-03)

1. **Execute Request**:
   ```bash
   curl -X POST http://localhost:3000/api/v1/auth/login/firebase \
     -H "Content-Type: application/json" \
     -d '{
       "tenantCode": "TENANT_01",
       "idToken": "MOCK_VALID_ID_TOKEN_UNMAPPED_999"
     }'
   ```
2. **Expected Result**: HTTP `401 Unauthorized`, JSON body message `"Authentication failed via Single Sign-On. Please try again or contact your administrator."`.
3. **Verification**: Confirm no user account created in PostgreSQL; query `auth_security_events_outbox` to confirm `authentication.sso-login-failed` audit event.

---

### Scenario 3: Identity Conflict Rejection (TC-SSO-04)

1. **Seed Data**: Create 2 user mappings in `external_identities` pointing `fb_uid_duplicate` to `user-1` AND `user-2`.
2. **Execute Request**:
   ```bash
   curl -X POST http://localhost:3000/api/v1/auth/login/firebase \
     -H "Content-Type: application/json" \
     -d '{
       "tenantCode": "TENANT_01",
       "idToken": "MOCK_VALID_ID_TOKEN_DUPLICATE"
     }'
   ```
3. **Expected Result**: HTTP `409 Conflict`, JSON body `errorCode: 'AUTH_FIREBASE_IDENTITY_CONFLICT'`.

---

### Scenario 4: Firebase Timeout / Infrastructure Failure Fallback (TC-SSO-05)

1. **Simulate Service Error**: Configure test mock adapter to trigger network timeout (>5000ms).
2. **Execute Request**:
   ```bash
   curl -X POST http://localhost:3000/api/v1/auth/login/firebase \
     -H "Content-Type: application/json" \
     -d '{
       "tenantCode": "TENANT_01",
       "idToken": "MOCK_TIMEOUT_TOKEN"
     }'
   ```
3. **Expected Result**: HTTP `503 Service Unavailable`, JSON body message suggesting password login fallback.

---

## Unit & Integration Test Commands

```bash
# Run unit tests for Firebase SSO module
npm run test src/modules/firebase-sso

# Run integration tests with Testcontainers
npm run test:e2e test/firebase-sso.e2e-spec.ts
```

# Verification & Quickstart Guide: Log In With Email and Password

This document details the manual and automated validation scenarios to verify the correctness of the password login implementation.

## Prerequisites & Test Environment Setup

1. **Start PostgreSQL & Redis Docker Services**:
   Ensure PostgreSQL and Redis containers are running locally:
   ```bash
   docker-compose up -d postgres redis
   ```

2. **Apply Database Schema / Seed Test Data**:
   Ensure user identities, active passwords, and tenant settings exist in the local test database:
   - Tenant Code: `TENANT_TEST`
   - Test User: `employee@tenant.com` (Status: `ACTIVE`, password: `SecurePassword123!`)
   - Test MFA User: `mfa-employee@tenant.com` (Status: `ACTIVE`, password: `SecurePassword123!`, enrolled in SMS MFA)
   - Tenant Lockout Policy: Lockout enabled, threshold = 5 attempts.
   - Tenant IP Restriction Policy: Enabled, allowed range = `192.168.1.0/24`.

---

## Validation Scenarios

### Scenario 1: Successful Primary Login (No MFA)
- **Goal**: Verify that an active user with correct password and no MFA from an allowed IP is issued a full session.
- **Verification Command**:
  ```bash
  curl -i -X POST http://localhost:3000/api/v1/auth/login/password \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 192.168.1.50" \
    -d '{
      "tenantCode": "TENANT_TEST",
      "email": "employee@tenant.com",
      "password": "SecurePassword123!"
    }'
  ```
- **Expected Outcome**:
  - HTTP `200 OK`
  - Response body contains `authState: "AUTHENTICATED"` and a valid `accessToken` JWT.
  - Redis contains session key `auth:session:<sessionId>`.
  - Event `authentication.login-succeeded` is written to `auth_security_events_outbox`.

### Scenario 2: Successful Primary Login (MFA Required)
- **Goal**: Verify that an active user with correct password and enrolled MFA gets status `MFA_REQUIRED` and a challenge ID.
- **Verification Command**:
  ```bash
  curl -i -X POST http://localhost:3000/api/v1/auth/login/password \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 192.168.1.50" \
    -d '{
      "tenantCode": "TENANT_TEST",
      "email": "mfa-employee@tenant.com",
      "password": "SecurePassword123!"
    }'
  ```
- **Expected Outcome**:
  - HTTP `200 OK`
  - Response body contains `authState: "MFA_REQUIRED"` and a valid `challengeId`.
  - Redis contains challenge key `auth:mfa-challenge:<challengeId>` with 5-minute TTL.

### Scenario 3: Login Rejection (Invalid Credentials)
- **Goal**: Verify invalid credentials are rejected with a generic message and increment Redis failure counter.
- **Verification Command**:
  ```bash
  curl -i -X POST http://localhost:3000/api/v1/auth/login/password \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 192.168.1.50" \
    -d '{
      "tenantCode": "TENANT_TEST",
      "email": "employee@tenant.com",
      "password": "WrongPassword!"
    }'
  ```
- **Expected Outcome**:
  - HTTP `401 Unauthorized`
  - Body shows generic error: `"Invalid email or password."`.
  - Redis key `auth:login-failure:TENANT_TEST:<userId>` is incremented.
  - Event `authentication.login-failed` is recorded in `auth_security_events_outbox`.

### Scenario 4: Account Lockout Trigger
- **Goal**: Verify that meeting the lockout threshold transitions user status to `LOCKED` in PostgreSQL.
- **Verification Command**:
  Perform 5 consecutive failed login attempts for `employee@tenant.com` (where threshold is 5).
- **Expected Outcome**:
  - On the 5th failed request (where consecutive failures count reaches 5, thus failures >= lockout_threshold): HTTP `401 Unauthorized` with generic message.
  - Querying PostgreSQL table `users` shows `status = 'LOCKED'` for the user.
  - Subsequent login attempts (even with correct password) return HTTP `401` immediately.
  - Security event `authentication.account-locked` is recorded in the outbox.

### Scenario 5: IP Restriction Denial
- **Goal**: Verify that requests from restricted IPs are denied immediately.
- **Verification Command**:
  ```bash
  curl -i -X POST http://localhost:3000/api/v1/auth/login/password \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 8.8.8.8" \
    -d '{
      "tenantCode": "TENANT_TEST",
      "email": "employee@tenant.com",
      "password": "SecurePassword123!"
    }'
  ```
- **Expected Outcome**:
  - HTTP `401 Unauthorized` (generic message).
  - Credentials are not evaluated, and the failure counter is not incremented (IP restrictions are checked at the perimeter).

---

## Running Automated Tests
Run unit, integration, and E2E validation suites:
```bash
# Run unit tests
pnpm test src/modules/authentication

# Run E2E tests for authentication
pnpm test:e2e test/authentication.e2e-spec.ts
```
For details on database schema mappings and interfaces, see [data-model.md](./data-model.md) and [login-password-api.yaml](./contracts/login-password-api.yaml).

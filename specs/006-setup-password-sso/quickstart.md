# Quickstart Validation Guide: Password Setup via Company Single Sign-On (Fallback Path)

This guide documents the procedures to run and validate the SSO password setup fallback functionality end-to-end.

## 1. Prerequisites

Ensure local infrastructure dependencies are running and accessible:
- **PostgreSQL**: Accessible at the host configured in your local `.env`.
- **Redis**: Running and accessible at the host/port configured in your local `.env`.
- **Seed Data**: Ensure a test tenant `TENANT_ACME` exists, along with a test user `usr_test123` with:
  - `status`: `'PENDING'`
  - `credential_status`: `'EMPTY'`
  - An active invitation in the `invitations` table: status `'sent'`, user ID `'usr_test123'`.

---

## 2. Test Setup (Simulate Redis restricted session)

Simulate a successful Firebase SSO login by seeding a restricted setup session directly in Redis.

Run this command in Redis CLI:
```bash
redis-cli HMSET auth:sso-setup:flow_test_sso123 userId usr_test123 tenantCode TENANT_ACME authState sso-setup-pending
redis-cli EXPIRE auth:sso-setup:flow_test_sso123 900
```

---

## 3. Execution (Start Dev Server)

Boot the NestJS application:
```bash
pnpm install
pnpm start:dev
```

---

## 4. E2E Validation Scenario

Invoke the endpoint using `curl` to simulate the password setup request:

```bash
curl -X POST http://localhost:3000/api/v1/auth/password/setup/firebase \
  -H "Authorization: Bearer flow_test_sso123" \
  -H "Content-Type: application/json" \
  -d '{
    "password": "SecurePassword123!"
  }'
```

### Expected HTTP Outcome

You should receive a `200 OK` response.

**Scenario A: MFA Not Required (Requires fresh login to obtain tokens)**
```json
{
  "status": "success",
  "data": {
    "mfaRequired": false
  }
}
```

**Scenario B: MFA Required (MFA enrollment session is returned)**
```json
{
  "status": "success",
  "data": {
    "mfaRequired": true,
    "mfaSetupToken": "mfa_setup_flow_abc123..."
  }
}
```

---

## 5. Post-Execution Verification (PostgreSQL & Redis)

Verify the database transitions and Redis cache invalidation:

1. **Verify User transitions to `active`**:
   ```sql
   SELECT status, credential_status, security_version 
   FROM users 
   WHERE id = 'usr_test123' AND tenant_code = 'TENANT_ACME';
   -- Expected: status = 'active', credential_status = 'active', and security_version has incremented by 1 (e.g. from baseline 1 to 2)
   ```


2. **Verify Credential creation**:
   ```sql
   SELECT type, algorithm, status 
   FROM credentials 
   WHERE user_id = 'usr_test123' AND tenant_code = 'TENANT_ACME';
   -- Expected: type = 'password', algorithm = 'argon2id', status = 'active'
   ```

3. **Verify Invitation cancellation**:
   ```sql
   SELECT status 
   FROM invitations 
   WHERE user_id = 'usr_test123' AND tenant_code = 'TENANT_ACME';
   -- Expected: status = 'cancelled'
   ```

4. **Verify Outbox Events are written**:
   ```sql
   SELECT event_type, publish_status 
   FROM auth_security_events_outbox 
   WHERE aggregate_id = 'usr_test123' AND tenant_code = 'TENANT_ACME';
   -- Expected: two events: 'authentication.password-changed' and 'authentication.invitation-accepted'
   ```

5. **Verify Redis Session Deletion**:
   ```bash
   redis-cli EXISTS auth:sso-setup:flow_test_sso123
   -- Expected: 0 (Key should be deleted)
   ```

---

## 6. Automated Testing Suite

To run the automated tests covering this flow:
```bash
# Run unit and integration tests
pnpm test
```

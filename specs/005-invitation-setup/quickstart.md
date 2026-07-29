# Quickstart & Verification Guide

This guide describes how to run and verify the invitation and first-time access setup feature end-to-end.

---

## 1. Prerequisites & Services Setup

Ensure you have PostgreSQL and Redis running locally:
```bash
# Verify PostgreSQL is running
pg_isready -h localhost -p 5432

# Verify Redis is running
redis-cli ping
```

---

## 2. Bootstrapping the Application

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Run database migrations** (applies initial schemas):
   ```bash
   pnpm typeorm migration:run
   ```

3. **Start the NestJS dev server**:
   ```bash
   pnpm start:dev
   ```

---

## 3. End-to-End Verification Scenarios

### Scenario A: Validate Onboarding Invitation Link
Given a user was provisioned and has a `PENDING` invitation with token `a1b2c3d4e5f6` (token hash matches database):
```bash
curl -i -X GET "http://localhost:3000/api/v1/invitations/validate?token=a1b2c3d4e5f6"
```
* **Expected Outcome**: HTTP `200 OK` with JSON indicating validity and corresponding user context.

### Scenario B: Accept Invitation & Initialize Password
Complete the onboarding flow by setting a password:
```bash
curl -i -X POST "http://localhost:3000/api/v1/invitations/accept" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "a1b2c3d4e5f6",
    "password": "StrongPassword123!"
  }'
```
* **Expected Outcome**: HTTP `200 OK`. 
* **Database verification**:
  - The record in `invitations` matches `status = 'accepted'` and `accepted_at` is set.
  - The `users` record is updated to `status = 'active'` and `security_version` is incremented.
  - A new active credential record is created in `credentials` table with Argon2id hash.
  - A `authentication.invitation-accepted` outbox event is created in `auth_security_events_outbox`.

### Scenario C: Admin Resends Invitation Link
As a tenant administrator, trigger a resend for a user who hasn't accepted yet:
```bash
curl -i -X POST "http://localhost:3000/api/v1/admin/users/550e8400-e29b-41d4-a716-446655440000/invitation/resend" \
  -H "Authorization: Bearer <Admin_JWT_Token>" \
  -H "X-Tenant-Code: tenant123"
```
* **Expected Outcome**: HTTP `200 OK` returning the new invitation details.
* **Database verification**:
  - The old invitation record is marked `status = 'revoked'` and `revoked_at` is populated.
  - A new invitation record is created with `status = 'pending'`, a new `token_hash`, and version incremented.
  - An `authentication.invitation-resent` outbox event is created.

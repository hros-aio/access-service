# Quickstart & Validation Guide: Account Lockout

## Quickstart Run & Test Instructions

### Prerequisites
- Node.js & npm installed
- Docker (for PostgreSQL & Redis testcontainers or local services)

### Setup & Run Tests

```bash
# Install dependencies if needed
npm install

# Run unit tests for Lockout Module
npm run test src/modules/lockout

# Run integration tests for Authentication & Lockout
npm run test:e2e -- --testPathPattern=lockout
```

---

## Validation Scenarios

### Scenario 1: Account Lockout & Session Revocation (US-030)
1. **Given**: An active user account `john.doe@tenant-a.com` in tenant `TENANT_A` with 3 active sessions and `lockout_threshold = 5`.
2. **When**: Make 5 consecutive `POST /auth/login` requests with wrong passwords.
3. **Then**:
   - The first 4 requests return `401 Unauthorized`.
   - The 5th request returns `401 Unauthorized`.
   - Database record `users.credential_status` becomes `'locked'` and `security_version` increments by 1.
   - Redis keys `auth:session:*` for `john.doe` are deleted.
   - Database `auth_security_events_outbox` contains 2 new entries: `authentication.account-locked` and `authentication.sessions-revoked`.

### Scenario 2: Non-Existent and Inactive Accounts (US-031)
1. **Given**: Non-existent email `ghost@tenant-a.com` and suspended user `suspended@tenant-a.com`.
2. **When**: Make failed `POST /auth/login` requests for both accounts.
3. **Then**: Both return `401 Unauthorized` with standard generic message ("Invalid email or password"). Redis key `auth:login-failure:*` remains empty/0.

### Scenario 3: IP Restriction Failure Separation (US-032)
1. **Given**: User `alice@tenant-a.com` attempting login from unapproved IP `192.0.2.45`.
2. **When**: Make 10 failed login attempts from `192.0.2.45`.
3. **Then**:
   - `auth:ip-failure:TENANT_A:<alice_id>` reaches 10.
   - `auth:login-failure:TENANT_A:<alice_id>` remains 0.
   - User `credential_status` remains `'active'`.
   - Event `authentication.security-alert-requested` is saved to `auth_security_events_outbox`.

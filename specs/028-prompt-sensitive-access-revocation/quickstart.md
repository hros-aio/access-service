# Quickstart & Validation Guide: Prompt Revocation of Sensitive Access

## 1. Prerequisites
- Docker & Docker Compose running (PostgreSQL & Redis)
- Node.js 20+ & npm installed

## 2. Environment Setup
```bash
npm install
npm run build
```

## 3. End-to-End Validation Scenarios

### Scenario A: Synchronous Role Permission Cutoff
1. **Assign Role with Capabilities**: Assign custom role `ROLE_HR_MANAGER` (with `employees.salary.read`) to test user `U1`.
2. **Execute Authorization Check**: Verify `U1` evaluates `can('employees.salary.read') === true` against Redis runtime cache.
3. **Revoke Capability**: Call `PATCH /roles/{roleId}/permissions` with `permissions: []` (removing `employees.salary.read`).
4. **Immediate Verification**: Without waiting for any background worker, execute authorization check for `U1`. Assert `can('employees.salary.read') === false` immediately.

### Scenario B: Expedited Priority Queue Claiming
1. **Seed Queue**: Insert 5 background jobs with `priority = 'SCHEDULED'`.
2. **Enqueue Urgent Revocation**: Unassign a role from a User Group, enqueueing a job with `priority = 'URGENT'`.
3. **Run Worker Claim**: Trigger `claimNextPendingJob()`.
4. **Verification**: Assert the returned job ID matches the `URGENT` group revocation job.

### Scenario C: Cumulative Multi-Group Grant Preservation
1. **Assign Overlapping Groups**: User `U2` belongs to Group `G1` (grants `ROLE_AUDITOR`) and Group `G2` (grants `ROLE_AUDITOR`).
2. **Revoke from G1**: Remove `ROLE_AUDITOR` from Group `G1`.
3. **Run Reconciler**: Reconcile affected users for `G1`.
4. **Verification**: Assert `U2` continues to retain `ROLE_AUDITOR` in `user_effective_roles` and Redis due to `G2`.

### Scenario D: Urgent Failure Critical Alerting
1. **Simulate DB Error**: Trigger an unrecoverable failure during an `URGENT` job.
2. **Verification**: Assert `authorization_sync_jobs.status` is `FAILED` and `auth_security_events_outbox` contains an event `authorization.sync-failed` with `urgency = 'CRITICAL'`.

## 4. Running Automated Tests
```bash
npm run test -- test/authorization/prompt-revocation.e2e-spec.ts
```

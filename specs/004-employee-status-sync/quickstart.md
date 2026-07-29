# Quickstart Validation Guide: Employee Status Synchronization

This document guides you through verifying the Employee Status Synchronization feature end-to-end.

## Prerequisites

1. **Database Setup**: Ensure PostgreSQL and Redis are running.
2. **Local Environment**: Copy `.env.example` to `.env` and fill in local configs.
3. **Install Dependencies**:
   ```bash
   pnpm install
   ```

## Verification Scenarios

### Scenario 1: Verify Suspension
Simulate receiving an `employee.suspended` event.

1. **Pre-state in PostgreSQL**:
   - A user exists with status `active` and security version `1`.
   - An `employee_references` record exists for this user with `employee_id = 'c8b6b218-c51d-400b-ba62-3783a37b123d'` and `source_version = '10'`.
   - Redis has active session keys: `auth:user-sessions:TENANT1:user-uuid` and `auth:session:session-id`.

2. **Simulate Event Payload**:
   Send event on `employee.lifecycle-events` topic:
   ```json
   {
     "id": "event-uuid-1",
     "eventType": "employee.suspended",
     "timestamp": "2026-07-28T12:00:00Z",
     "tenantCode": "TENANT1",
     "payload": {
       "employeeId": "c8b6b218-c51d-400b-ba62-3783a37b123d",
       "tenantCode": "TENANT1",
       "sourceVersion": 11
     }
   }
   ```

3. **Verify Expected Post-state**:
   - **PostgreSQL**:
     - User status is `disabled`.
     - User security version is `2`.
     - `employee_references.source_version` is `'11'`.
     - An outbox record is inserted in `auth_security_events_outbox` with event type `authentication.sessions-revoked`.
   - **Redis**:
     - Session keys `auth:user-sessions:TENANT1:user-uuid` and `auth:session:session-id` are deleted.

---

### Scenario 2: Verify Termination
Simulate receiving an `employee.terminated` event.

1. **Pre-state in PostgreSQL**:
   - User exists with status `active`, security version `2`, and a pending invitation record (`status = 'pending'`).
   - `employee_references` has `source_version = '11'`.

2. **Simulate Event Payload**:
   ```json
   {
     "id": "event-uuid-2",
     "eventType": "employee.terminated",
     "timestamp": "2026-07-28T12:05:00Z",
     "tenantCode": "TENANT1",
     "payload": {
       "employeeId": "c8b6b218-c51d-400b-ba62-3783a37b123d",
       "tenantCode": "TENANT1",
       "sourceVersion": 12
     }
   }
   ```

3. **Verify Expected Post-state**:
   - **PostgreSQL**:
     - User status is `archived`.
     - User security version is `3`.
     - `employee_references.source_version` is `'12'`.
     - The invitation's status is `revoked` and `revokedAt` is set.
     - Outbox record is inserted for `authentication.sessions-revoked`.

---

### Scenario 3: Verify Reactivation
Simulate receiving an `employee.reactivated` event.

1. **Pre-state in PostgreSQL**:
   - User exists with status `archived` and security version `3`.
   - `employee_references` has `source_version = '12'`.

2. **Simulate Event Payload**:
   ```json
   {
     "id": "event-uuid-3",
     "eventType": "employee.reactivated",
     "timestamp": "2026-07-28T12:10:00Z",
     "tenantCode": "TENANT1",
     "payload": {
       "employeeId": "c8b6b218-c51d-400b-ba62-3783a37b123d",
       "tenantCode": "TENANT1",
       "sourceVersion": 13
     }
   }
   ```

3. **Verify Expected Post-state**:
   - **PostgreSQL**:
     - User status is `invited`.
     - User security version is `4`.
     - `employee_references.source_version` is `'13'`.
     - A new invitation is created with status `pending`, a secure `tokenHash`, and `expiresAt` set to 24 hours in the future.
     - Outbox record is inserted for `authentication.user-invited`.

---

### Scenario 4: Verify Idempotency and Event Ordering
Simulate stale event delivery.

1. **Pre-state in PostgreSQL**:
   - `employee_references` has `source_version = '13'`.

2. **Simulate Event Payload**:
   Send a stale event with `sourceVersion = 11`:
   ```json
   {
     "id": "event-uuid-4",
     "eventType": "employee.suspended",
     "timestamp": "2026-07-28T12:15:00Z",
     "tenantCode": "TENANT1",
     "payload": {
       "employeeId": "c8b6b218-c51d-400b-ba62-3783a37b123d",
       "tenantCode": "TENANT1",
       "sourceVersion": 11
     }
   }
   ```

3. **Verify Expected Outcome**:
   - The event is successfully processed and acknowledged by the consumer.
   - **No updates** are made to the database, user status remains `invited`, and no session revocation is triggered.

## Running Tests

To run the integration tests validating these scenarios:
```bash
pnpm test
```
To check test coverage:
```bash
pnpm run test:cov
```

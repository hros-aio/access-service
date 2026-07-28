# Quickstart Guide: Tenant Bootstrap Root Admin Provisioning

This guide outlines the steps to verify the tenant bootstrap root admin provisioning feature locally or in integration testing environments.

## Prerequisites

- PostgreSQL database instance running (or started via Docker/Testcontainers)
- Kafka cluster instance running (or mocked in test environment)
- Node.js (v22+) and pnpm (v11+) installed

---

## Runnable Verification Scenarios

### Scenario 1: E2E Bootstrap Processing

Verify that receiving a new `tenant.created` Kafka event successfully creates a root administrator and registers the outbox event.

1. **Start the Service**:
   ```bash
   pnpm run start:dev
   ```
2. **Publish Kafka Mock Event**:
   Publish a message to the `tenant.lifecycle-events` topic using the Kafka CLI or a testing tool:
   ```json
   {
     "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
     "topic": "tenant.lifecycle-events",
     "producer": "hros-tenant-service",
     "timestamp": "2026-07-27T12:00:00Z",
     "version": "1.0.0",
     "correlationId": "corr-12345",
     "payload": {
       "tenantCode": "TENANT_A",
       "rootAdminEmail": "root@tenant-a.com"
     }
   }
   ```
3. **Verify Database Records**:
   Run database queries to check that the records were inserted successfully:
   ```sql
   -- Verify User created
   SELECT id, email, protected_root_admin, status FROM users WHERE tenant_code = 'TENANT_A';
   
   -- Verify Outbox event created
   SELECT id, event_type, publish_status FROM auth_security_events_outbox WHERE tenant_code = 'TENANT_A';
   ```

### Scenario 2: Idempotency Protection

Verify that duplicate events are ignored:

1. **Publish Same Kafka Mock Event**:
   Send the exact same JSON payload from Scenario 1 a second time.
2. **Check Database Records**:
   Assert that:
   - No additional user records were created.
   - No new outbox records were created.
   - The message is processed and acknowledged as a no-op cleanly.

# Quickstart & Verification Guide: System Roles Baseline & Protection

**Feature Branch**: `016-system-roles-baseline` | **Date**: 2026-08-25

## 1. Prerequisites

- Docker / PostgreSQL / Redis running locally or via Testcontainers.
- Working NestJS service environment (`npm run test` executable).

---

## 2. Validation Scenarios

### Scenario 1: Tenant Provisioning Seeds System Roles

1. Trigger tenant provisioning workflow with tenant code `tenant-test-01`.
2. Inspect `roles` table:
   - Verifies rows for `EMPLOYEE`, `MANAGER`, and `ADMINISTRATOR` exist with `type = 'SYSTEM'`.
3. Inspect `role_permissions` table:
   - Verifies protected capabilities have `is_protected = true`.
4. Inspect Redis cache:
   - Verifies key `authz:role:tenant-test-01:<roleId>` is populated.

### Scenario 2: Attempting to Delete a System Role Fails

1. Send `DELETE /roles/:employeeRoleId` with valid admin credentials.
2. Expect HTTP `400` / `422` with message `System roles cannot be deleted`.

### Scenario 3: Attempting to Remove a Protected Capability Fails & Audits

1. Send `PUT /roles/:adminRoleId/permissions` omitting `role.manage` (a protected capability).
2. Expect HTTP `422` with `ProtectedCapabilityRemovalException`.
3. Verify `auth_security_events_outbox` contains a new event with action `role.protected-capability-violation` and payload detailing the omitted capability.
4. Verify `role_permissions` in the database remained unchanged.

### Scenario 4: Extending System Role with Valid Non-Protected Capability

1. Send `PUT /roles/:employeeRoleId/permissions` including all protected capabilities plus `location.view`.
2. Expect HTTP `200` with updated permission list.
3. Verify `role_permissions` contains `location.view` with `is_protected = false`.
4. Verify `roles.version` incremented and Redis key was updated synchronously.

### Scenario 5: Renaming System Role

1. Send `PATCH /roles/:employeeRoleId/rename` with `{ "name": "Team Member" }`.
2. Expect HTTP `200` with `name = "Team Member"` and `system_role_key = "EMPLOYEE"`.
3. Verify `auth_security_events_outbox` contains `role.renamed` audit record.

---

## 3. Automated Test Execution

```bash
# Run unit tests for Role Aggregate & Services
npm test -- src/modules/roles/services/role.application.service.spec.ts

# Run integration / e2e tests for Role Baseline & Invariants
npm test -- test/roles/system-roles.e2e-spec.ts
```

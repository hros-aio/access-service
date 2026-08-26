# Quickstart Validation Guide: Custom Role Lifecycle Management

## 1. Overview
This guide provides end-to-end operational scenarios to validate the custom role lifecycle capabilities within `hros-access-service`.

## 2. Prerequisites
- Running local instance of PostgreSQL and Redis.
- Valid tenant administrative bearer token (simulating `RequestContext` with tenant `tenant-001`).

---

## 3. Test Scenarios

### Scenario 1: Create a Custom Role with Capability Dependency Validation
1. **Invalid Capability Request**:
   - Send `POST /authorization/roles` with:
     ```json
     {
       "name": "Invalid Role",
       "permissionCodes": ["employee.update"]
     }
     ```
   - **Expected Outcome**: HTTP 422 Unprocessable Entity stating prerequisite capability `employee.view` is missing.

2. **Valid Creation**:
   - Send `POST /authorization/roles` with:
     ```json
     {
       "name": "HR Specialist",
       "description": "Handles employee profile management",
       "permissionCodes": ["employee.view", "employee.update"]
     }
     ```
   - **Expected Outcome**: HTTP 201 Created. Response returns role with `type = "CUSTOM"`, `version = 1`, `status = "ACTIVE"`, `isUnassigned = true`, and Redis key `authz:role:tenant-001:{id}` seeded.

---

### Scenario 2: Copy Role with Protection Reset
1. Send `POST /authorization/roles/{systemRoleId}/copy` with:
   ```json
   {
     "name": "Custom Manager",
     "description": "Forked from Manager System Role"
   }
   ```
2. **Expected Outcome**: HTTP 201 Created.
   - All copied permissions in `role_permissions` have `is_protected = false`.
   - `system_role_key` is `null`.
   - The role is completely decoupled from the system template.

---

### Scenario 3: Inspect Role Reach & Unassigned Indicators
1. Send `GET /authorization/roles`.
2. **Expected Outcome**:
   - Newly created custom roles show `isUnassigned: true` and `activeUserReachCount: 0`.
   - Pre-existing roles linked to User Groups show `isUnassigned: false` and accurate user counts.

---

### Scenario 4: Update Permissions & Concurrency Control
1. Send `PUT /authorization/roles/{roleId}` with stale version:
   ```json
   {
     "name": "HR Specialist Senior",
     "permissionCodes": ["employee.view", "employee.update", "department.view"],
     "version": 999
   }
   ```
   - **Expected Outcome**: HTTP 409 Conflict.

2. Send update with correct version (`version = 1`):
   - **Expected Outcome**: HTTP 200 OK. Version increments to 2, and Redis cache is synchronously updated with new permissions.

---

### Scenario 5: Deactivation with Impact Guard & Reactivation
1. For a role assigned to active User Groups, send `POST /authorization/roles/{roleId}/deactivate` without confirmation (`{ "confirmed": false }`).
   - **Expected Outcome**: HTTP 200 with `confirmationRequired: true`, returning affected user group and user counts.
2. Send deactivation with `{ "confirmed": true }`.
   - **Expected Outcome**: Role status transitions to `INACTIVE`, version increments, and Redis key is updated.
3. Send `POST /authorization/roles/{roleId}/reactivate`.
   - **Expected Outcome**: Role status transitions back to `ACTIVE`.

---

## 4. Automated Test Commands
Run unit and integration test suites:
```bash
npm run test -- src/modules/roles/services/role.application.service.spec.ts
npm run test:e2e
```

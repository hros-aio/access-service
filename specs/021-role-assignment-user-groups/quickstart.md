# Quickstart Guide: Role Assignment to User Groups

**Feature**: `021-role-assignment-user-groups`  
**Date**: 2026-08-29

## Overview
This guide describes how to run validation tests to verify that role assignments on user groups function correctly, enforce optimistic locking, calculate impact estimation, and record transactional outbox events without prematurely mutating user-effective roles.

---

## 1. Prerequisites
- Docker / PostgreSQL running locally or Testcontainers enabled for integration tests.
- Service dependencies installed (`npm install`).

---

## 2. Validation Scenarios

### Scenario A: Assign Roles to a User Group
1. Create or retrieve an active User Group (version = 1).
2. Retrieve active Role IDs from the tenant catalog (`RoleRepository.findByTenant`).
3. Call `PUT /user-groups/:id/roles` with:
   ```json
   {
     "roleIds": ["role-uuid-1", "role-uuid-2"],
     "expectedVersion": 1
   }
   ```
4. **Verification**:
   - HTTP 200 returned with the list of assigned roles.
   - User group `version` is now 2, and `projection_version` remains 0 (`isPendingSync` is true).
   - Rows exist in `user_group_roles` for `(tenantCode, userGroupId, roleId)`.
   - `auth_security_events_outbox` contains event `user_group.roles_assigned`.

### Scenario B: Unassign a Role
1. Call `PUT /user-groups/:id/roles` with:
   ```json
   {
     "roleIds": ["role-uuid-1"],
     "expectedVersion": 2
   }
   ```
2. **Verification**:
   - HTTP 200 returned containing only `role-uuid-1`.
   - The unassigned role row (`role-uuid-2`) is removed from `user_group_roles`.
   - The role entity `role-uuid-2` in `roles` table is untouched and remains active.
   - `auth_security_events_outbox` contains event `user_group.role_unassigned`.

### Scenario C: Blast Radius Impact Estimation & High-Impact Gate
1. With a group having 150 materialized members and high-impact threshold configured at 100:
2. Call `POST /user-groups/:id/roles/impact-estimate` with `{ "roleIds": ["role-uuid-3"] }`.
3. **Verification**:
   - Returns `{ "affectedUserCount": 150, "requiresConfirmation": true }`.
4. Call `PUT /user-groups/:id/roles` with `{ "roleIds": ["role-uuid-3"], "expectedVersion": 3 }` (omitting `confirmed: true`).
   - Request is rejected with HTTP 422 (`HighImpactConfirmationRequiredError`).
5. Re-send `PUT` with `{ "roleIds": ["role-uuid-3"], "expectedVersion": 3, "confirmed": true }`.
   - Request succeeds with HTTP 200.

### Scenario D: Optimistic Locking Conflict
1. Send `PUT /user-groups/:id/roles` with a stale `expectedVersion: 1` when the group is at `version: 3`.
2. **Verification**:
   - Request is rejected with HTTP 409 (`ConcurrentModificationError`).

---

## 3. Running Unit and Integration Tests

Run the test suite:
```bash
npm run test -- user-group-role
```

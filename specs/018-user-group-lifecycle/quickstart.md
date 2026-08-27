# Quickstart Validation Guide: User Group Definition & Lifecycle

## 1. Overview
This guide outlines the operational verification steps to validate user group creation, scope configuration, matching rule validation, lifecycle transitions (deactivate/reactivate), optimistic locking, and dirty-state tracking.

## 2. Prerequisites
- PostgreSQL running locally with standard schemas.
- Authenticated tenant context (`tenant-001`).

---

## 3. Test Scenarios

### Scenario 1: Create Dynamic User Group & Rule Validation
1. **Invalid Attribute Key Request**:
   - Send `POST /admin/user-groups` with:
     ```json
     {
       "name": "Invalid Group",
       "scopeType": "TENANT_WIDE",
       "matchingRule": {
         "clauses": [
           { "attribute": "salary", "operator": "GREATER_THAN", "value": "50000" }
         ]
       }
     }
     ```
   - **Expected Outcome**: HTTP 400 Bad Request indicating `salary` is not an allowed attribute.

2. **Valid Creation with Draft State**:
   - Send `POST /admin/user-groups` with:
     ```json
     {
       "name": "Engineering Leads",
       "description": "All active engineering leads",
       "scopeType": "DEPARTMENT",
       "scopeRefId": "dept-eng-01",
       "matchingRule": {
         "clauses": [
           { "attribute": "employmentStatus", "operator": "EQUALS", "value": "ACTIVE" },
           { "attribute": "departmentId", "operator": "EQUALS", "value": "dept-eng-01" },
           { "attribute": "hasReportees", "operator": "IS_TRUE" }
         ]
       },
       "roleIds": []
     }
     ```
   - **Expected Outcome**: HTTP 201 Created. Response returns `version: 1`, `projectionVersion: 0`, `isPendingSync: true`, `hasNoAssignedRoles: true`, and `ruleAttributeKeys: ["employmentStatus", "departmentId", "hasReportees"]`.

---

### Scenario 2: Concurrency Conflict Protection
1. Submit `PUT /admin/user-groups/{id}` with outdated version (`version: 999`).
   - **Expected Outcome**: HTTP 409 Conflict with `ConcurrentModificationError`.
2. Submit `PUT /admin/user-groups/{id}` with `version: 1`.
   - **Expected Outcome**: HTTP 200 OK. Group version increments to 2, `isPendingSync: true`, and outbox records `user_group.updated`.

---

### Scenario 3: Deactivation and Reactivation Lifecycle
1. Send `POST /admin/user-groups/{id}/deactivate` with `version: 2`.
   - **Expected Outcome**: HTTP 200 OK. Status transitions to `INACTIVE`, version increments to 3, `isPendingSync: true`, and outbox records `user_group.deactivated`.
2. Send `POST /admin/user-groups/{id}/reactivate` with `version: 3`.
   - **Expected Outcome**: HTTP 200 OK. Status transitions back to `ACTIVE`, version increments to 4, `isPendingSync: true`, and outbox records `user_group.reactivated`.

---

### Scenario 4: Tenant Isolation & Queries
1. Under Tenant A context, send `GET /admin/user-groups/{groupInTenantBId}`.
   - **Expected Outcome**: HTTP 404 Not Found.
2. Send `GET /admin/user-groups`.
   - **Expected Outcome**: Returns paginated list of user groups for Tenant A with `hasNoAssignedRoles` and `isPendingSync` flags.

---

## 4. Automated Test Commands
```bash
npm run test -- src/modules/user-groups/
npm run test:e2e -- test/user-groups.e2e-spec.ts
```

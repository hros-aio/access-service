# Quickstart: Pre-Commit Impact Analysis & High-Impact Warnings

## Overview
This guide validates the pre-commit impact analysis and high-impact confirmation flow across Roles and User Groups.

## Prerequisites
1. PostgreSQL container running with initialized schema and test seed data.
2. Redis container running for session and permission caching.

## Validation Scenarios

### 1. Test Impact Preview for Role Modification
- **Command**:
  ```bash
  curl -X POST http://localhost:3000/roles/11111111-1111-1111-1111-111111111111/impact-preview \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "x-tenant-code: TENANT_DEMO" \
    -H "Content-Type: application/json" \
    -d '{"permissionCodes": ["employee.profile.view"]}'
  ```
- **Expected Outcome**: Returns HTTP 200 with `estimate.totalAffected` representing distinct active holders of the role, `isHighImpact`, and `requiresConfirmation`.

### 2. Test High-Impact User Group Update (Two-Step Handshake)
- **Step 1: Submit update without confirmation**
  ```bash
  curl -X PUT http://localhost:3000/user-groups/22222222-2222-2222-2222-222222222222 \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "x-tenant-code: TENANT_DEMO" \
    -H "Content-Type: application/json" \
    -d '{"name": "All Engineers", "matchingRule": {"operator": "AND", "conditions": []}, "confirmed": false, "expectedVersion": 1}'
  ```
  - **Expected Outcome**: HTTP 409 Conflict with `HIGH_IMPACT_CONFIRMATION_REQUIRED` error and blast radius details (`usersGaining > 100`).
- **Step 2: Resubmit update with `confirmed: true`**
  ```bash
  curl -X PUT http://localhost:3000/user-groups/22222222-2222-2222-2222-222222222222 \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "x-tenant-code: TENANT_DEMO" \
    -H "Content-Type: application/json" \
    -d '{"name": "All Engineers", "matchingRule": {"operator": "AND", "conditions": []}, "confirmed": true, "expectedVersion": 1}'
  ```
  - **Expected Outcome**: HTTP 200 OK, entity version incremented to `2`, and audit event written to `auth_security_events_outbox`.

### 3. Run Automated Tests
```bash
npm run test -- src/modules/impact-analysis/
```

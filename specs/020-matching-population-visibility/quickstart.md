# Quickstart Guide: Matching Population Visibility

**Feature**: Matching Population Visibility  
**Branch**: `020-matching-population-visibility`  
**Date**: 2026-08-29  

## Overview

This guide describes how to run and verify the Matching Population Visibility feature, covering materialized group member inspection and live draft criteria previewing.

---

## 1. Prerequisites

- Node.js 20+ installed
- PostgreSQL test database or Testcontainers environment
- NestJS application dependencies installed (`npm install`)

---

## 2. Validation Scenarios

### Scenario A: Query Materialized Group Members

1. **Setup**: Ensure a User Group exists with materialized members in `user_group_memberships` joined with `employee_references`.
2. **Execute HTTP Request**:
   ```bash
   curl -X GET "http://localhost:3000/user-groups/${GROUP_ID}/members?page=1&limit=20" \
     -H "Authorization: Bearer ${ADMIN_JWT_TOKEN}" \
     -H "x-tenant-code: TENANT_A"
   ```
3. **Expected Outcome**:
   - HTTP 200 OK
   - Payload containing `{ items: [...], total: N, page: 1, limit: 20 }`
   - Employee records contain non-sensitive attributes (`employeeId`, `employeeCode`, `departmentId`, `locationId`, `employmentStatus`, `reporteesCount`).

---

### Scenario B: Real-Time Draft Criteria Preview

1. **Execute HTTP Request**:
   ```bash
   curl -X POST "http://localhost:3000/user-groups/preview-matching" \
     -H "Authorization: Bearer ${ADMIN_JWT_TOKEN}" \
     -H "x-tenant-code: TENANT_A" \
     -H "Content-Type: application/json" \
     -d '{
       "combinator": "all",
       "clauses": [
         { "attribute": "employmentStatus", "operator": "eq", "value": "ACTIVE" },
         { "attribute": "departmentId", "operator": "eq", "value": "d4e2c65a-8b1e-4c7b-8c88-1234567890ab" }
       ]
     }'
   ```
2. **Expected Outcome**:
   - HTTP 200 OK
   - Payload containing `{ matchedCount: M, sampleEmployees: [...] }`
   - `sampleEmployees` length $\le 50$.
   - Zero state mutations in `user_group_memberships` or `user_effective_roles`.

---

### Scenario C: Zero-Match Handling

1. **Execute Preview Request with Non-matching Criteria**:
   ```bash
   curl -X POST "http://localhost:3000/user-groups/preview-matching" \
     -H "Authorization: Bearer ${ADMIN_JWT_TOKEN}" \
     -H "x-tenant-code: TENANT_A" \
     -H "Content-Type: application/json" \
     -d '{
       "combinator": "all",
       "clauses": [
         { "attribute": "employmentStatus", "operator": "eq", "value": "NON_EXISTENT_STATUS" }
       ]
     }'
   ```
2. **Expected Outcome**:
   - HTTP 200 OK
   - Payload `{ matchedCount: 0, sampleEmployees: [] }`
   - No errors or unhandled exceptions thrown.

---

## 3. Running Automated Tests

Run unit and integration test suites:
```bash
# Unit tests
npm run test -- src/modules/user-groups/services/user-group-population-query.service.spec.ts
npm run test -- src/modules/user-groups/controllers/user-group-population.controller.spec.ts

# Integration tests
npm run test -- src/modules/user-groups/user-group-matching.integration.spec.ts
```

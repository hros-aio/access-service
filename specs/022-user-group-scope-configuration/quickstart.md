# Quickstart Guide: User Group Scope Configuration

This guide demonstrates how to test and validate User Group Scope Configuration end-to-end.

## Prerequisites
- PostgreSQL running with updated schema migrations.
- Redis running.
- Access Service dependencies installed (`npm install`).

## Running Tests
Run module unit and integration tests:
```bash
npm run test -- src/modules/user-groups
```

## Scenario 1: Fetch Current Scope Configuration
```bash
curl -X GET "http://localhost:3000/api/v1/user-groups/UUID_HERE/scope" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "X-Tenant-Code: tenant-default"
```

## Scenario 2: Calculate Blast Radius / Impact
```bash
curl -X POST "http://localhost:3000/api/v1/user-groups/UUID_HERE/scope/impact-estimate" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "X-Tenant-Code: tenant-default" \
  -H "Content-Type: application/json" \
  -d '{
    "scopeType": "TENANT_WIDE",
    "scopeRefId": null
  }'
```

## Scenario 3: Update Scope with Optimistic Locking
```bash
curl -X PUT "http://localhost:3000/api/v1/user-groups/UUID_HERE/scope" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "X-Tenant-Code: tenant-default" \
  -H "Content-Type: application/json" \
  -d '{
    "scopeType": "DEPARTMENT",
    "scopeRefId": "dept-engineering-01",
    "expectedVersion": 1,
    "confirmed": true
  }'
```

# Quickstart & Verification Guide: Permission Catalog & Dependency Matrix

## Overview
This guide provides actionable verification scenarios to test and validate the in-memory **Permission Catalog & Dependency Matrix** functionality locally.

---

## 1. Prerequisites
- Node.js 20+ & pnpm
- Valid static catalog bundled at `src/modules/permissions/config/permission-catalog.yaml`

---

## 2. Test Execution Commands

### Run Unit Tests
Validate DAG cycle detection, in-memory index construction, and dependency rule evaluations:
```bash
pnpm test src/modules/permissions
```

### Run Integrity & Fixture Integration Tests
Validate NestJS startup lifecycle hooks with valid and invalid (cyclic/dangling) YAML fixtures:
```bash
pnpm test:e2e test/permissions/permission-catalog.e2e-spec.ts
```

---

## 3. End-to-End Verification Scenarios

### Scenario A: Verify Startup Integrity Gate (Cycle Detection)
1. Provide a test YAML fixture containing a cyclic dependency chain: `location.update -> location.view -> location.update`.
2. Bootstrap the NestJS application context.
3. **Expected Result**: Application throws `CyclicPermissionDependencyError` during `onModuleInit()` and terminates bootstrap immediately without listening on HTTP ports.

### Scenario B: Verify Catalog Hierarchy Query API
1. Start the service with a valid `permission-catalog.yaml`.
2. Authenticate as an administrator and issue:
   ```bash
   curl -X GET http://localhost:3000/api/v1/permissions/catalog \
     -H "Authorization: Bearer <ADMIN_JWT>" \
     -H "x-tenant-code: TENANT_ALPHA"
   ```
3. **Expected Result**: Returns HTTP 200 with capabilities hierarchically grouped under modules (`setting`, `directory`, `leave`, etc.) and resources.

### Scenario C: Verify Action Dependency Validation (Grant Rule)
1. Invoke `PermissionDependencyService.validatePermissionSet(['location.update'])` (missing prerequisite `location.view`).
2. **Expected Result**: `ValidationResult.isValid === false` with error message explaining that `location.view` is required.

### Scenario D: Verify Prerequisite Retention Validation (Revoke Rule)
1. Invoke `PermissionDependencyService.validatePermissionSet(['location.update'])` when updating a role from `['location.view', 'location.update']`.
2. **Expected Result**: Validation fails because removing `location.view` while retaining `location.update` violates dependent integrity.

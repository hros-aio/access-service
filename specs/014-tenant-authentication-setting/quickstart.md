# Quickstart Validation Guide: Tenant Authentication Settings

## Prerequisites
- PostgreSQL running locally or via Testcontainers
- Node.js & npm environment configured for `auth-svc`

## Verification Scenarios

### 1. View Settings
Run unit & integration tests to verify retrieval:
```bash
npm run test -- src/modules/authentication-settings/transport/authentication-settings.controller.spec.ts
```

### 2. Valid Settings Update & Optimistic Lock Increment
Run test verifying that updating settings from `v1` to `v2` succeeds and atomically appends an outbox row:
```bash
npm run test -- src/modules/authentication-settings/application/authentication-settings.service.spec.ts
```

### 3. Concurrency Violation (HTTP 409)
Verify optimistic concurrency control under duplicate updates:
```bash
npm run test -- src/modules/authentication-settings/infrastructure/authentication-settings.repository.spec.ts
```

### 4. Input Validation Failure (HTTP 400)
Verify DTO validation rejects invalid CIDRs and negative thresholds:
```bash
npm run test -- src/modules/authentication-settings/dto/update-authentication-settings.dto.spec.ts
```

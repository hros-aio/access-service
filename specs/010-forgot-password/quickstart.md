# Quickstart & Integration Validation Guide

## Overview

This guide outlines step-by-step verification procedures for the Password Reset Workflow (Self-Service & Admin-Initiated).

## Prerequisites

1. PostgreSQL database running with `hros-access-service` schema.
2. Redis instance accessible for session & challenge storage.
3. Node.js (>=22) environment with `pnpm` installed.

## Environment Setup

```bash
# Run database migrations
pnpm run typeorm migration:run

# Start microservice in dev mode
pnpm run start:dev
```

## Validation Scenarios

### Scenario 1: Self-Service Password Reset (Happy Path)

1. **Request Reset Code**:
   ```bash
   curl -X POST http://localhost:3000/auth/password/reset/request \
     -H "Content-Type: application/json" \
     -d '{"tenantCode": "tenant-001", "email": "user@example.com"}'
   ```
   *Expected Response*: `200 OK` with `{ "message": "If an active account exists, recovery instructions have been sent." }`

2. **Verify Verification Code**:
   ```bash
   curl -X POST http://localhost:3000/auth/password/reset/verify \
     -H "Content-Type: application/json" \
     -d '{"challengeId": "<CHALLENGE_ID>", "code": "<6_DIGIT_OTP>"}'
   ```
   *Expected Response*: `200 OK` with `{ "valid": true, "resetToken": "<RESET_TOKEN>" }`

3. **Confirm Password Reset**:
   ```bash
   curl -X POST http://localhost:3000/auth/password/reset/confirm \
     -H "Content-Type: application/json" \
     -d '{"challengeId": "<CHALLENGE_ID>", "resetToken": "<RESET_TOKEN>", "newPassword": "NewSecurePassword123!"}'
   ```
   *Expected Response*: `200 OK` with `{ "success": true }`

### Scenario 2: Admin-Initiated Reset

1. **Submit Admin Request**:
   ```bash
   curl -X POST http://localhost:3000/auth/admin/users/<TARGET_USER_ID>/password-reset \
     -H "Authorization: Bearer <ADMIN_JWT>"
   ```
   *Expected Response*: `200 OK` with `{ "message": "Password reset workflow initiated for user." }`

## Automated Test Execution

```bash
# Run unit tests
pnpm test src/modules/password/services/password.service.spec.ts

# Run integration tests
pnpm test:e2e test/password-reset.e2e-spec.ts
```

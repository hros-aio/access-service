# Quickstart Guide: AWS Cognito User Provisioning Validation

**Feature Branch**: `029-create-cognito-user`  
**Date**: 2026-10-16  

---

## Overview

This guide describes how to validate the automated creation and linking of AWS Cognito user accounts after internal user creation in the HROS Access Service.

For entity definitions and state transitions, see [data-model.md](data-model.md).  
For event payloads and interface schemas, see [contracts/](contracts/).

---

## Prerequisites

1. **Local Environment**:
   - Node.js >= 22 & pnpm installed
   - Local PostgreSQL database and Redis running (e.g. via Docker Compose or Testcontainers)
2. **AWS Cognito Configuration / Mock**:
   - `AWS_REGION` (e.g. `us-east-1`)
   - `AWS_COGNITO_USER_POOL_ID` (e.g. `us-east-1_testpool`)
   - For automated integration and unit tests, `CognitoService` from `@new-hros/libs-aws` is mocked using NestJS test utilities.

---

## Validation Scenarios

### Scenario 1: Provisioning New User Automatically Creates Cognito Identity

1. **Trigger**: Invoke `ProvisioningApplicationService.bootstrapRootAdmin()` or call `CognitoUserProvisioningService.provisionCognitoUser()` with a new user payload.
2. **Execution**:
   ```bash
   pnpm test -- src/modules/provisioning/services/provisioning.application.service.spec.ts
   ```
3. **Verification**:
   - `CognitoService.createUser` is invoked with:
     - `username`: `<normalizedEmail>`
     - `userAttributes`: `{ email: '<normalizedEmail>', email_verified: 'true', 'custom:tenant_code': '<tenantCode>' }`
     - `messageAction`: `'SUPPRESS'`
   - The user record in PostgreSQL is updated with `external_identity_id = '<cognito_sub>'`.
   - An outbox security event of type `authentication.cognito-user-provisioned` is written to `auth_security_events_outbox`.

---

### Scenario 2: Idempotent Handling of Pre-Existing Cognito User

1. **Trigger**: Run user creation for an email that already exists in AWS Cognito (simulated by having `CognitoService.createUser` reject with `CognitoUserAlreadyExistsException`).
2. **Execution**:
   ```bash
   pnpm test -- src/modules/user/services/cognito-user-provisioning.service.spec.ts
   ```
3. **Verification**:
   - The service catches `CognitoUserAlreadyExistsException`.
   - The service invokes `CognitoService.getUser(normalizedEmail)` to fetch the existing Cognito `sub`.
   - `user.external_identity_id` is updated with the fetched `sub`.
   - The operation completes with HTTP 200/201 (no unhandled 409 conflict exception).
   - The outbox security event indicates `action: 'LINKED_EXISTING'`.

---

### Scenario 3: Resilient Failure & Audit Logging on Network Outage

1. **Trigger**: Simulate an AWS Cognito 500 error or network timeout.
2. **Execution**:
   ```bash
   pnpm test -- src/modules/user/services/cognito-user-provisioning.service.spec.ts
   ```
3. **Verification**:
   - The service retries up to 3 times with exponential backoff.
   - Upon final failure, a `CognitoProvisioningException` is raised.
   - A security audit event `authentication.cognito-provisioning-failed` is recorded with zero plain passwords or secrets.
   - Database integrity is preserved.

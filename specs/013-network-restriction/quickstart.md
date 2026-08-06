# Quickstart & Integration Validation Guide: Network Restriction

## Overview
This document describes how to validate the IP network location restriction feature end-to-end using automated tests and standard endpoints.

## Prerequisites
- Node.js environment with project dependencies installed.
- PostgreSQL database schema updated (`authentication_settings` with `ip_restriction_enabled` and `allowed_ip_cidrs`).
- Redis instance running for failure counter validation.

## Validation Scenarios

### Scenario 1: Allowed IP Address Access
1. Configure tenant `TENANT_01` with `ip_restriction_enabled: true` and `allowed_ip_cidrs: ["192.168.1.0/24"]`.
2. Send `POST /auth/login` request with header/context `sourceIp: "192.168.1.50"`.
3. **Expected Outcome**: HTTP 200 / Login succeeds.

### Scenario 2: Unapproved IP Address Access
1. Configure tenant `TENANT_01` with `ip_restriction_enabled: true` and `allowed_ip_cidrs: ["192.168.1.0/24"]`.
2. Send `POST /auth/login` request with header/context `sourceIp: "10.0.0.1"`.
3. **Expected Outcome**: HTTP 401 `INVALID_CREDENTIALS` (or `IpRestrictedError`), Redis counter `auth:ip-failure:TENANT_01:usr_123` increments, audit outbox entry created.

### Scenario 3: Exempt Actions (Forgot Password / Invitation)
1. Send `POST /auth/password/reset-request` from unapproved IP `10.0.0.1`.
2. **Expected Outcome**: HTTP 200 / Request processed without IP restriction blockage.

## Running Tests
Execute the unit and integration test suite:
```bash
npm run test -- src/modules/ip-restriction
```

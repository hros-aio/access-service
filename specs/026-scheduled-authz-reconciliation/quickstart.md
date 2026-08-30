# Quickstart Validation Guide: Scheduled Authorization Reconciliation

**Feature**: `026-scheduled-authz-reconciliation`
**Status**: Completed

## Overview
This guide describes how to validate the scheduled authorization reconciliation scanner, distributed locking mechanism, and convergence verification.

---

## 1. Prerequisites & Test Setup

Ensure local environment and containers are running:
```bash
# Start PostgreSQL & Redis
docker compose up -d postgres redis
```

---

## 2. Automated Test Execution

Run the unit, integration, and concurrency test suites:

```bash
# Run unit tests for scanner and distributed lock adapter
npm test -- src/modules/authorization/services/scheduled-reconciliation-scanner.service.spec.ts
npm test -- src/modules/authorization/services/distributed-lock.adapter.spec.ts
npm test -- src/modules/authorization/telemetry/scheduled-reconciliation.metrics.spec.ts

# Run end-to-end reconciliation integration tests
npm test -- test/integration/scheduled-reconciliation.e2e-spec.ts
```

---

## 3. Key Scenario Verifications

### Scenario 1: Multi-Pod Distributed Lock Contention
1. Spin up Pod A and Pod B simultaneously triggering the scheduled reconciliation method.
2. **Assertion**: Pod A acquires the advisory lock and executes the sweep; Pod B receives `lockStatus = 'contended_skipped'` and exits immediately without querying entities.
3. **Metric**: `authz_scheduled_reconciliation_lock_acquisitions_total{status="acquired"}` increments by 1; `authz_scheduled_reconciliation_lock_acquisitions_total{status="contended_skipped"}` increments by 1.

### Scenario 2: Dirty Entity Discovery & Automatic Convergence
1. In tenant `TENANT_01`, create User Group A with `version = 2` and `projection_version = 1`.
2. Create User Group B with `version = 1` and `projection_version = 1`.
3. Trigger the scanner sweep.
4. **Assertion**: A single sync job is created for User Group A with `trigger_type = 'SCHEDULED'` and `created_by = 'SYSTEM'`. User Group B is untouched.
5. Wait for worker processing: User Group A's `projection_version` becomes `2`.

### Scenario 3: Coexistence with In-Flight Manual "Sync Now"
1. In tenant `TENANT_02`, trigger manual "Sync Now" on User Group C (`version = 3`), putting job into `PROCESSING`.
2. Run scheduled reconciliation scanner.
3. **Assertion**: The scanner identifies User Group C as dirty (`3 > 2`), attempts enqueue, hits unique constraint `uq_authz_sync_jobs_in_flight`, catches error `23505`, and safely ignores it without creating a duplicate job or throwing an unhandled exception.

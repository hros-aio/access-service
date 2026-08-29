# Quickstart & Verification Guide: Dynamic Matching Criteria & Population Evaluation

**Feature Branch**: `019-user-group-dynamic-matching` | **Date**: 2026-08-28

---

## 1. Prerequisites & Environment

Ensure PostgreSQL and Redis containers/services are running:

```bash
npm run test:services:up # or docker-compose up -d
```

Run migrations to apply the extended `employee_references`, `user_group_memberships`, and `user_effective_roles` schema:

```bash
npm run typeorm migration:run
```

---

## 2. Validation Scenarios

### Scenario A: Unit Test Suite Execution

Execute unit tests for rule validation, in-memory matching engine, and reconciler:

```bash
npm run test -- src/modules/user-groups/services/user-group-matching.engine.spec.ts
npm run test -- src/modules/user-groups/domain/validators/matching-rule.validator.spec.ts
npm run test -- src/modules/user-groups/services/membership-reconciler.spec.ts
```

### Scenario B: Preview Criteria Population API

Invoke the preview API with draft criteria:

```bash
curl -X POST http://localhost:3000/user-groups/preview-matching \
  -H "Content-Type: application/json" \
  -H "x-tenant-code: TENANT_DEMO" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "combinator": "all",
    "clauses": [
      { "field": "departmentId", "operator": "eq", "value": "11111111-1111-1111-1111-111111111111" },
      { "field": "employmentStatus", "operator": "eq", "value": "ACTIVE" }
    ]
  }'
```

_Expected Outcome_: HTTP 200 with `{ "matchedCount": N, "sampleEmployees": [...] }`.

### Scenario C: Kafka Event Consumption & Attribute Propagation

Publish a simulated `employee.reporting-line-changed` event to verify manager reportee count updates and automatic manager group enrollment:

```bash
# Verify employee gained direct reports and matches manager group with hasReportees: true
```

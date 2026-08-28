# Research & Technical Decisions: Dynamic Matching Criteria & Population Evaluation

**Feature Branch**: `019-user-group-dynamic-matching` | **Date**: 2026-08-28

---

## 1. Matching Rule Grammar & Operator Evaluation

### Context & Unknowns
How should matching rule operators (`eq`, `neq`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `exists`, `IS_TRUE`, `IS_FALSE`) be modeled, validated, and evaluated in both in-memory contexts and SQL query building?

### Decision
Support normalized operator tokens (supporting both lowercase `eq`, `neq`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `exists` and uppercase enum equivalents `EQUALS`, `NOT_EQUALS`, `IN`, `NOT_IN`, `GREATER_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN`, `LESS_THAN_OR_EQUAL`, `IS_TRUE`, `IS_FALSE`).
- Strictly enforce root combinator `"all"` (logical AND across clauses).
- Closed attribute allow-list: `employmentStatus`, `companyId`, `locationId`, `departmentId`, `gradeId`, `jobTitleId`, `reporteesCount`, `hasReportees`.
- Pure in-memory evaluator: `evaluate(rule: MatchingRule, employee: EmployeeReference): boolean`.
  - `hasReportees: true` / `IS_TRUE` resolves to `reporteesCount > 0`.
  - `hasReportees: false` / `IS_FALSE` resolves to `reporteesCount === 0`.
  - `exists` resolves to `value !== null && value !== undefined && value !== ''`.

### Rationale
- Pure evaluation has no side effects, making unit testing deterministic and high performance.
- Eliminates any possibility of dynamic code execution (eval/regex) or unsafe query assembly.

### Alternatives Considered
- *JSONPath / JSONata dynamic expression evaluation*: Rejected due to potential complexity and difficulty compiling efficiently into parameterized SQL.
- *Arbitrary SQL string building*: Rejected per Constitution (SQL Injection prevention).

---

## 2. Projection Schema & Source Version Idempotency

### Context & Unknowns
How to extend `employee_references` to store directory attributes while preventing state regression from out-of-order or duplicate Kafka events?

### Decision
Extend `employee_references` table with:
- `company_id` (UUID, nullable)
- `location_id` (UUID, nullable)
- `department_id` (UUID, nullable)
- `grade_id` (UUID, nullable)
- `job_title_id` (UUID, nullable)
- `employment_status` (VARCHAR(50), not null, default `'ACTIVE'`)
- `manager_employee_id` (UUID, nullable)
- `reportees_count` (INT, not null, default 0)
- `source_version` (BIGINT, not null, default 0)

Implement atomic conditional upsert:
```sql
INSERT INTO employee_references (...)
VALUES (...)
ON CONFLICT (tenant_code, employee_id)
DO UPDATE SET
  company_id = EXCLUDED.company_id,
  location_id = EXCLUDED.location_id,
  department_id = EXCLUDED.department_id,
  grade_id = EXCLUDED.grade_id,
  job_title_id = EXCLUDED.job_title_id,
  employment_status = EXCLUDED.employment_status,
  manager_employee_id = EXCLUDED.manager_employee_id,
  source_version = EXCLUDED.source_version,
  synchronized_at = NOW()
WHERE EXCLUDED.source_version > employee_references.source_version;
```
For manager reportee counts, handle reporting line changes by querying/updating `reportees_count` atomically with `+1` / `-1` delta updates.

### Rationale
- Monotonically increasing `source_version` guarantees idempotency without distributed locks.
- Storing attributes internally satisfies the bounded context principle (no synchronous queries to Directory Service).

---

## 3. Targeted Group Lookups via Array Overlap (`rule_attribute_keys && $changed_keys`)

### Context & Unknowns
How to evaluate an employee attribute change efficiently without evaluating all User Groups across the tenant?

### Decision
When an employee attribute changes (e.g. `department_id` changes -> `['departmentId']`):
1. Query only candidate active user groups:
   ```sql
   SELECT * FROM user_groups
   WHERE tenant_code = $1
     AND status = 'ACTIVE'
     AND rule_attribute_keys && $2;
   ```
2. Also retrieve all currently assigned group memberships for that employee from `user_group_memberships`.
3. For candidate groups and existing groups, evaluate the rule in-memory using the latest employee projection.
4. Calculate new membership target set.

### Rationale
- GIN indexed `rule_attribute_keys` provides $O(\log N)$ lookup of relevant groups instead of full table scans.
- Ensures single-employee attribute propagation is fast (<10ms).

---

## 4. Membership & User Effective Role Reconciliation

### Context & Unknowns
How should `user_group_memberships` and `user_effective_roles` be updated when an employee matches or ceases matching groups?

### Decision
Create `MembershipReconciler` executing inside a database transaction:
- **Single Employee Reconciliation (`reconcileSingleEmployee`)**:
  1. Compares current active group memberships vs. target matching groups.
  2. Inserts new membership records into `user_group_memberships`.
  3. Deletes revoked membership records from `user_group_memberships`.
  4. If memberships changed, computes the complete set of effective roles from all current memberships (group roles + group scope).
  5. Applies a minimal diff (insert newly granted roles, delete revoked roles) to `user_effective_roles`.
  6. Emits `MEMBERSHIP_RECONCILED` audit records into `auth_security_events_outbox`.

- **Group Population Reconciliation (`reconcileGroupPopulation`)**:
  1. Evaluates matching rule via parameterized SQL query against `employee_references` to get `matchedEmployeeIds`.
  2. Diffs against existing `user_group_memberships` for that `group_id`.
  3. Batch inserts new members and batch deletes removed members.
  4. Cascades role updates only for affected employees.
  5. Updates `user_groups.projection_version = user_groups.version`.

### Rationale
- Idempotent and minimal diffing prevents churn on `user_effective_roles`.
- Guarantees immediate consistency between group membership and effective authorization.

---

## 5. Preview & Impact Estimation API

### Context & Unknowns
How to provide safe preview and diff calculations for administrators without mutating database state?

### Decision
Implement `UserGroupPopulationQueryService`:
- `getMatchingPopulation(tenantCode, groupId, pagination)`: Paginates over joined `user_group_memberships` and `employee_references`.
- `previewCriteriaPopulation(tenantCode, matchingRule, pagination)`: Compiles `matchingRule` into parameterized SQL, counts matching rows, and returns paginated summary.
- `estimateCriteriaDiff(tenantCode, groupId, proposedRule)`: Evaluates proposed matching rule in-memory/via query against `employee_references`, diffs against current memberships of `groupId`, and returns `{ gainingCount, losingCount, totalMatchingCount }`.

### Rationale
- Zero database writes during preview operations.
- Direct feedback for administrators before saving rule modifications.

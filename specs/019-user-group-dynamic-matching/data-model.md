# Data Model: Dynamic Matching Criteria & Population Evaluation

**Feature Branch**: `019-user-group-dynamic-matching` | **Date**: 2026-08-28

---

## 1. Entities & Schema Definitions

### 1.1 `employee_references` (Extended Projection Table)

Represents internal projection of employee business attributes received via Kafka lifecycle events from `hros-directory-service`.

| Column | Type | Nullable | Constraints & Default | Description |
|---|---|---|---|---|
| `employee_id` | UUID | No | PRIMARY KEY | Unique identifier of the employee in directory |
| `tenant_code` | VARCHAR(50) | No | NOT NULL | Tenant isolation identifier |
| `employee_code` | VARCHAR(100) | No | NOT NULL | Human-readable employee ID/code |
| `company_id` | UUID | Yes | NULL | Organization/Company identifier |
| `location_id` | UUID | Yes | NULL | Work location / office identifier |
| `department_id` | UUID | Yes | NULL | Department identifier |
| `grade_id` | UUID | Yes | NULL | Seniority/Job grade identifier |
| `job_title_id` | UUID | Yes | NULL | Job title identifier |
| `employment_status`| VARCHAR(50) | No | DEFAULT 'ACTIVE' | Employment status (`ACTIVE`, `SUSPENDED`, `TERMINATED`, `ON_LEAVE`) |
| `manager_employee_id`| UUID | Yes | NULL | Direct manager employee ID |
| `reportees_count` | INT | No | DEFAULT 0 | Derived count of direct reportees |
| `source_version` | BIGINT | No | DEFAULT 0 | Monotonic version from Directory Service for idempotency |
| `synchronized_at` | TIMESTAMPTZ | No | DEFAULT NOW() | Last projection update timestamp |

**Indexes**:
- `uq_employee_references_tenant_employee_id` UNIQUE (`tenant_code`, `employee_id`)
- `uq_employee_references_tenant_employee_code` UNIQUE (`tenant_code`, `employee_code`)
- `idx_employee_references_matching_attrs` (`tenant_code`, `department_id`, `location_id`, `company_id`, `employment_status`)
- `idx_employee_references_manager` (`tenant_code`, `manager_employee_id`)

---

### 1.2 `user_group_memberships` (Materialized Group Assignments)

Represents the active assignment of an employee to a User Group resulting from dynamic matching evaluation.

| Column | Type | Nullable | Constraints & Default | Description |
|---|---|---|---|---|
| `id` | UUID | No | PRIMARY KEY (gen_random_uuid()) | Unique membership record identifier |
| `tenant_code` | VARCHAR(50) | No | NOT NULL | Tenant isolation identifier |
| `group_id` | UUID | No | REFERENCES `user_groups(id)` ON DELETE CASCADE | User group identifier |
| `employee_id` | UUID | No | NOT NULL | Matched employee identifier |
| `matched_at` | TIMESTAMPTZ | No | DEFAULT NOW() | Timestamp when employee was matched |
| `created_at` | TIMESTAMPTZ | No | DEFAULT NOW() | Creation timestamp |

**Indexes & Constraints**:
- `uq_user_group_memberships_tenant_group_employee` UNIQUE (`tenant_code`, `group_id`, `employee_id`)
- `idx_user_group_memberships_tenant_employee` (`tenant_code`, `employee_id`)
- `idx_user_group_memberships_tenant_group` (`tenant_code`, `group_id`)

---

### 1.3 `user_effective_roles` (Flattened Effective Authorization State)

Materialized view of effective roles granted to an employee across all their matched User Groups, including group scope.

| Column | Type | Nullable | Constraints & Default | Description |
|---|---|---|---|---|
| `id` | UUID | No | PRIMARY KEY (gen_random_uuid()) | Unique effective role record identifier |
| `tenant_code` | VARCHAR(50) | No | NOT NULL | Tenant isolation identifier |
| `employee_id` | UUID | No | NOT NULL | Employee receiving the role |
| `role_id` | UUID | No | REFERENCES `roles(id)` ON DELETE CASCADE | Assigned role |
| `source_group_id`| UUID | No | REFERENCES `user_groups(id)` ON DELETE CASCADE | User group originating the grant |
| `scope_type` | VARCHAR(50) | No | NOT NULL | Scope (`SELF`, `DIRECT_REPORTEES`, `COMPANY`, `LOCATION`, `DEPARTMENT`, `TENANT_WIDE`) |
| `scope_entity_id`| UUID | Yes | NULL | Optional specific scope target ID |
| `created_at` | TIMESTAMPTZ | No | DEFAULT NOW() | Grant timestamp |

**Indexes & Constraints**:
- `uq_user_effective_roles_grant` UNIQUE (`tenant_code`, `employee_id`, `role_id`, `source_group_id`, `scope_type`, `scope_entity_id`)
- `idx_user_effective_roles_employee` (`tenant_code`, `employee_id`)
- `idx_user_effective_roles_group` (`tenant_code`, `source_group_id`)

---

## 2. Domain Value Objects & Schemas

### 2.1 `MatchingRule` (JSONB Structure in `user_groups.matching_rule`)

```typescript
export type Operator =
  | 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists'
  | 'EQUALS' | 'NOT_EQUALS' | 'IN' | 'NOT_IN' | 'GREATER_THAN' | 'LESS_THAN' | 'IS_TRUE' | 'IS_FALSE';

export type AttributeKey =
  | 'employmentStatus'
  | 'companyId'
  | 'locationId'
  | 'departmentId'
  | 'gradeId'
  | 'jobTitleId'
  | 'reporteesCount'
  | 'hasReportees';

export interface RuleClause {
  field?: AttributeKey; // or attribute for backward compatibility
  attribute?: AttributeKey;
  operator: Operator;
  value?: string | number | boolean;
  values?: Array<string | number>;
}

export interface MatchingRule {
  combinator?: 'all'; // strictly AND logic
  clauses: RuleClause[];
}
```

---

## 3. State & Reconciliation Flow

```text
[Employee Event / Admin Criteria Change]
                 │
                 ▼
  [EmployeeAttributePropagationService / Sync]
                 │
                 ▼
     [UserGroupMatchingEngine]
   (In-Memory / Parameterized SQL)
                 │
                 ▼
       [MembershipReconciler]
                 │
  ┌──────────────┴──────────────┐
  ▼                             ▼
[user_group_memberships]   [user_effective_roles]
  (Insert/Delete diff)       (Cascade minimal diff)
                 │
                 ▼
    [auth_security_events_outbox]
        (Audit Delta Log)
```

# Phase 1 Data Model: Matching Population Visibility

**Feature**: Matching Population Visibility  
**Branch**: `020-matching-population-visibility`  
**Date**: 2026-08-29  

## Entities and Projections

### 1. `user_groups` (Read-only for Visibility)
Container entity defining the user group and its configured dynamic matching rule.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `UUID` | No | Primary key |
| `tenant_code` | `VARCHAR(50)` | No | Tenant isolation identifier |
| `name` | `VARCHAR(100)` | No | Name of the user group |
| `description` | `TEXT` | Yes | Human-readable description |
| `status` | `VARCHAR(30)` | No | Lifecycle status (`DRAFT`, `ACTIVE`, `INACTIVE`) |
| `scope_type` | `VARCHAR(50)` | No | User group scope type |
| `scope_ref_id` | `UUID` | Yes | Reference ID for targeted scope |
| `matching_rule` | `JSONB` | No | AST matching rule definition |
| `rule_attribute_keys`| `TEXT[]` | No | Array of attribute keys used in rule |
| `version` | `INT` | No | Optimistic locking version |
| `projection_version`| `INT` | No | Current synced membership version |

### 2. `user_group_memberships` (Materialized Group Population)
Join table representing currently materialized employee memberships for a user group.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `UUID` | No | Primary key |
| `tenant_code` | `VARCHAR(50)` | No | Tenant isolation identifier |
| `group_id` | `UUID` | No | Foreign key referencing `user_groups(id)` |
| `employee_id` | `UUID` | No | Foreign key referencing `employee_references(employee_id)` |
| `matched_at` | `TIMESTAMPTZ`| No | Timestamp when membership was materialized |

**Indexes**:
- Composite index: `(tenant_code, group_id, employee_id)`
- Ordering index: `(tenant_code, group_id, matched_at DESC)`

### 3. `employee_references` (Read Model Projection)
Read-only workforce projection used for member detail enrichment and draft criteria preview.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `employee_id` | `UUID` | No | Primary key |
| `tenant_code` | `VARCHAR(50)` | No | Tenant isolation identifier |
| `employee_code` | `VARCHAR(100)`| No | Human-readable employee code / badge number |
| `company_id` | `UUID` | Yes | Assigned company entity reference |
| `location_id` | `UUID` | Yes | Assigned office location reference |
| `department_id` | `UUID` | Yes | Assigned organizational department reference |
| `grade_id` | `UUID` | Yes | Assigned salary/job grade reference |
| `job_title_id` | `UUID` | Yes | Assigned job title reference |
| `employment_status`| `VARCHAR(50)`| No | Employment state (e.g., `ACTIVE`, `PROBATION`, `TERMINATED`) |
| `status` | `VARCHAR(30)` | No | System active status |
| `manager_employee_id`| `UUID` | Yes | Direct reporting manager ID |
| `reportees_count` | `INT` | No | Derived direct report count (default: 0) |
| `source_version` | `VARCHAR(100)`| Yes | Monotonic version for event idempotency |
| `synchronized_at` | `TIMESTAMPTZ`| No | Last projection sync timestamp |

**Indexes**:
- Unique index: `(tenant_code, employee_id)`
- Unique index: `(tenant_code, employee_code)`
- Attribute indexes: `(tenant_code, department_id)`, `(tenant_code, location_id)`, `(tenant_code, employment_status)`

## Data Transfer Objects (DTOs)

### MatchedMemberDto
```typescript
export class MatchedMemberDto {
  employeeId: string;
  employeeCode: string;
  departmentId?: string | null;
  locationId?: string | null;
  employmentStatus: string;
  reporteesCount: number;
  matchedAt?: Date;
}
```

### PaginatedMatchingPopulationDto
```typescript
export class PaginatedMatchingPopulationDto {
  items: MatchedMemberDto[];
  total: number;
  page: number;
  limit: number;
}
```

### PreviewMatchingResponseDto
```typescript
export class PreviewMatchingResponseDto {
  matchedCount: number;
  sampleEmployees: MatchedMemberDto[];
}
```

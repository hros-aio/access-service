# Data Model: Role Assignment to User Groups

**Feature**: `021-role-assignment-user-groups`  
**Date**: 2026-08-29

## Schema & Tables

### 1. `user_groups` (Existing Aggregate Root)

Represents the security container and dynamic matching criteria.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `uuid` | NO | Primary key (UUID v4) |
| `tenant_code` | `varchar(50)` | NO | Tenant isolation identifier |
| `name` | `varchar(100)` | NO | Unique name per tenant |
| `description` | `varchar(255)` | YES | Optional description |
| `status` | `varchar(20)` | NO | `ACTIVE` or `INACTIVE` |
| `scope_type` | `varchar(30)` | NO | `SELF`, `DIRECT_REPORTEES`, `COMPANY`, `LOCATION`, `DEPARTMENT`, `TENANT_WIDE` |
| `scope_ref_id` | `varchar(100)` | YES | Identifier for location, department, or company if scoped |
| `matching_rule` | `jsonb` | NO | Dynamic matching criteria clauses |
| `rule_attribute_keys` | `text[]` | NO | Array of indexed employee attribute keys used in rule |
| `version` | `int` | NO | Optimistic locking counter. Incremented on any configuration or role change. |
| `projection_version` | `int` | NO | Version of configuration synchronized to `user_effective_roles`. Group is dirty when `version > projection_version`. |
| `created_by` | `uuid` | YES | User ID of creator |
| `updated_by` | `uuid` | YES | User ID of last updater |
| `created_at` | `timestamptz` | NO | Creation timestamp |
| `updated_at` | `timestamptz` | NO | Last modification timestamp |

---

### 2. `user_group_roles` (Many-to-Many Join Table)

Maps Platform Roles to User Groups.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `uuid` | NO | Primary key (UUID v4) |
| `tenant_code` | `varchar(50)` | NO | Tenant isolation identifier |
| `user_group_id` | `uuid` | NO | Foreign key to `user_groups.id` (ON DELETE CASCADE) |
| `role_id` | `uuid` | NO | Foreign key to `roles.id` (ON DELETE RESTRICT / CASCADE) |
| `created_at` | `timestamptz` | NO | Creation timestamp |

**Indexes & Constraints**:
- `UNIQUE (tenant_code, user_group_id, role_id)`: Enforces uniqueness per group-role pair within a tenant.
- `INDEX (tenant_code, user_group_id)`: Fast retrieval of roles for a group.
- `INDEX (tenant_code, role_id)`: Fast retrieval of groups mapped to a role.

---

### 3. `roles` (Reference Entity)

Catalog of platform and custom roles.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `uuid` | NO | Primary key (UUID v4) |
| `tenant_code` | `varchar(50)` | NO | Tenant isolation identifier |
| `name` | `varchar(100)` | NO | Role name |
| `description` | `varchar(255)` | YES | Role description |
| `type` | `varchar(20)` | NO | `SYSTEM` or `CUSTOM` |
| `status` | `varchar(20)` | NO | `ACTIVE` or `INACTIVE` |

---

### 4. `user_group_memberships` (Materialized Membership Reference)

Materialized dynamic memberships evaluated against `employee_references`.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `uuid` | NO | Primary key (UUID v4) |
| `tenant_code` | `varchar(50)` | NO | Tenant isolation identifier |
| `group_id` | `uuid` | NO | Foreign key to `user_groups.id` |
| `employee_id` | `uuid` | NO | Foreign key to `employee_references.id` |
| `matched_at` | `timestamptz` | NO | Timestamp of dynamic match |

---

### 5. `auth_security_events_outbox` (Transactional Outbox)

Transactional outbox table for audit and async reconciliation events.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `uuid` | NO | Primary key (UUID v4) |
| `tenant_code` | `varchar(50)` | NO | Tenant isolation identifier |
| `event_type` | `varchar(100)` | NO | e.g., `user_group.roles_assigned`, `user_group.role_unassigned`, `authorization.user-group-updated` |
| `aggregate_type` | `varchar(50)` | NO | `USER_GROUP` |
| `aggregate_id` | `varchar(100)` | NO | `userGroupId` |
| `payload` | `jsonb` | NO | Event payload (previous roles, new roles, version, actor ID) |
| `status` | `varchar(20)` | NO | `PENDING`, `PUBLISHED`, `FAILED` |
| `created_at` | `timestamptz` | NO | Event creation timestamp |

---

## State Transitions & Invariants

1. **Dirty Group Marking**:
   - Initial: `version = 1`, `projection_version = 0` (`isPendingSync = true`).
   - Role mutation: `version = version + 1`, `projection_version` unchanged (`isPendingSync = true`).
   - Reconciliation worker completes sync: `projection_version = version` (`isPendingSync = false`).
2. **Role Retention**:
   - Deleting a row in `user_group_roles` removes the association. The corresponding row in `roles` remains untouched and in its current status.
3. **Tenant Invariant**:
   - Every read and write query enforces `tenant_code = RequestContextService.getTenantCode()`.

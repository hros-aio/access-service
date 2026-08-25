# Data Model: System Roles Baseline & Protection

**Feature Branch**: `016-system-roles-baseline` | **Date**: 2026-08-25

## 1. Entities & Schema

### `roles` Table
Represents an authorization role within a tenant context.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_code` | `varchar(64)` | NO | - | Tenant identifier (multi-tenant isolation) |
| `name` | `varchar(128)` | NO | - | Display name (customizable by tenant admins) |
| `description` | `text` | YES | `NULL` | Optional description |
| `type` | `varchar(32)` | NO | `'CUSTOM'` | `'SYSTEM'` or `'CUSTOM'` |
| `system_role_key` | `varchar(64)` | YES | `NULL` | `'EMPLOYEE'`, `'MANAGER'`, `'ADMINISTRATOR'` (immutable) |
| `status` | `varchar(32)` | NO | `'ACTIVE'` | `'ACTIVE'` or `'INACTIVE'` |
| `version` | `integer` | NO | `1` | Optimistic concurrency control version |
| `created_at` | `timestamptz` | NO | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | NO | `now()` | Update timestamp |
| `deleted_at` | `timestamptz` | YES | `NULL` | Soft delete timestamp |

**Indexes & Constraints**:
- `PK_roles_id`: Primary key (`id`)
- `UQ_roles_tenant_name`: Unique constraint on `(tenant_code, name)` where `deleted_at IS NULL`
- `UQ_roles_tenant_system_key`: Unique constraint on `(tenant_code, system_role_key)` where `deleted_at IS NULL`
- `IDX_roles_tenant_type`: Index on `(tenant_code, type)`

---

### `role_permissions` Table
Associates permissions with a role, tracking capability protection status.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_code` | `varchar(64)` | NO | - | Tenant identifier |
| `role_id` | `uuid` | NO | - | Foreign key -> `roles.id` (CASCADE on delete) |
| `permission_code` | `varchar(128)` | NO | - | Permission identifier (`resource.action`) |
| `is_protected` | `boolean` | NO | `false` | `TRUE` if capability cannot be removed by admins |
| `created_at` | `timestamptz` | NO | `now()` | Creation timestamp |

**Indexes & Constraints**:
- `PK_role_permissions_id`: Primary key (`id`)
- `UQ_role_permissions_role_perm`: Unique constraint on `(role_id, permission_code)`
- `IDX_role_permissions_tenant_role`: Index on `(tenant_code, role_id)`
- `FK_role_permissions_role_id`: Foreign key -> `roles(id)` ON DELETE CASCADE

---

### `auth_security_events_outbox` Table (Existing)
Used for transactional event publishing and immutable security audit records.

Relevant Event Types / Actions:
- `authorization.role-updated` (`publishStatus = 'pending'`)
- `role.renamed`
- `role.permissions-updated`
- `role.protected-capability-violation`

---

## 2. Redis Cache Model

### Role Permissions Key
- **Key Pattern**: `authz:role:{tenantCode}:{roleId}`
- **TTL**: 24 hours (with synchronous invalidation/overwrite on mutation)
- **Data Structure**: JSON string or hash
```json
{
  "roleId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "tenantCode": "tenant-abc",
  "name": "Team Member",
  "type": "SYSTEM",
  "systemRoleKey": "EMPLOYEE",
  "version": 2,
  "permissions": [
    { "code": "employee.view", "isProtected": true },
    { "code": "location.view", "isProtected": false }
  ]
}
```

---

## 3. State Invariants & Business Rules

1. **Undeletable System Roles**:
   - `DELETE /roles/:roleId` MUST throw `ForbiddenException` / `CannotDeleteSystemRoleException` if `role.type === 'SYSTEM'`.
2. **Inviolable Protected Permissions**:
   - For any role where `type === 'SYSTEM'`, every `role_permissions` row where `is_protected === true` MUST remain in the resulting permission set on any update.
   - Removing or omitting any protected capability raises `ProtectedCapabilityRemovalException` and writes a `role.protected-capability-violation` audit event.
3. **Critical Role Deactivation Prevention**:
   - `role.system_role_key === 'ADMINISTRATOR'` cannot have `status` set to `'INACTIVE'`.
4. **Display Label Uniqueness**:
   - Renaming a role validates that `name` does not collide with existing active roles in the same `tenant_code`.

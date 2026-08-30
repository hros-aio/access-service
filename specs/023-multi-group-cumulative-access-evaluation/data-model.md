# Data Model: Multi-Group Cumulative Access Evaluation

## Entity Schemas & Tables

### 1. Database Projection: `user_effective_roles`

Materialized table holding active role-scope assignments per user per tenant.

```sql
CREATE TABLE IF NOT EXISTS user_effective_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_code VARCHAR(64) NOT NULL,
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    source_group_id UUID NOT NULL,
    scope_type VARCHAR(32) NOT NULL, -- 'SELF', 'DIRECT_REPORTEES', 'COMPANY', 'LOCATION', 'DEPARTMENT', 'TENANT'
    scope_ref_id UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_effective_role UNIQUE (tenant_code, user_id, role_id, source_group_id, scope_type, scope_ref_id)
);

CREATE INDEX IF NOT EXISTS idx_user_effective_roles_lookup 
    ON user_effective_roles (tenant_code, user_id);

CREATE INDEX IF NOT EXISTS idx_user_effective_roles_group 
    ON user_effective_roles (tenant_code, source_group_id);
```

---

## Redis Authorization Cache Models

### 1. User Effective Roles Cache: `authz:user:{tenantCode}:{userId}`

- **Key**: `authz:user:{tenantCode}:{userId}`
- **TTL**: Configured session TTL / cache TTL (e.g., 24h with proactive invalidation)
- **Data Structure**: JSON Object

```json
{
  "version": 4,
  "roles": [
    {
      "roleId": "550e8400-e29b-41d4-a716-446655440000",
      "scope": {
        "type": "SELF",
        "refId": null
      },
      "sourceGroupId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    },
    {
      "roleId": "660e8400-e29b-41d4-a716-446655440001",
      "scope": {
        "type": "DIRECT_REPORTEES",
        "refId": null
      },
      "sourceGroupId": "b2c3d4e5-f6a7-8901-bcde-f23456789012"
    }
  ]
}
```

### 2. Role Definition Cache: `authz:role:{tenantCode}:{roleId}`

- **Key**: `authz:role:{tenantCode}:{roleId}`
- **L1 Cache**: In-process memory cache with short TTL (e.g. 5 minutes) and Redis pub/sub invalidation.
- **Data Structure**: JSON Array of permission codes.

```json
[
  "employee.view",
  "employee.edit",
  "leave.approve"
]
```

---

## Domain Types & DTOs

### 1. `EffectiveUserRole`
```typescript
export interface EffectiveUserRole {
  roleId: string;
  scope: ScopeConstraint;
  sourceGroupId: string;
}
```

### 2. `ScopeConstraint`
```typescript
export type ScopeType = 'SELF' | 'DIRECT_REPORTEES' | 'COMPANY' | 'LOCATION' | 'DEPARTMENT' | 'TENANT';

export interface ScopeConstraint {
  type: ScopeType;
  refId: string | null;
}
```

### 3. `ResourceContext`
```typescript
export interface ResourceContext {
  employeeId?: string;
  managerId?: string;
  companyId?: string;
  locationId?: string;
  departmentId?: string;
}
```

### 4. `BootstrapCapabilitiesResponseDto`
```typescript
export interface BootstrapCapabilitiesResponseDto {
  authorizationVersion: number;
  permissions: string[];
  modules: string[];
  roles: string[];
}
```

# Phase 1 Data Model: User Group Scope Configuration

## Entity Mappings

### 1. `UserGroup` (`user_groups`)
Owned and managed by `UserGroupModule`.
- `id` (`UUID`, Primary Key)
- `tenant_code` (`varchar(50)`, Non-null, Indexed)
- `name` (`varchar(150)`, Non-null)
- `description` (`text`, Nullable)
- `status` (`varchar(20)`, Enum: `ACTIVE`, `INACTIVE`)
- `scope_type` (`varchar(50)`, Enum: `SELF`, `DIRECT_REPORTEES`, `COMPANY`, `LOCATION`, `DEPARTMENT`, `TENANT_WIDE`)
- `scope_ref_id` (`varchar(100)`, Nullable)
- `matching_rule` (`jsonb`, Non-null)
- `rule_attribute_keys` (`text[]`, Non-null)
- `version` (`int`, Non-null, Default: 1)
- `projection_version` (`int`, Non-null, Default: 0)
- `created_at` (`timestamptz`)
- `updated_at` (`timestamptz`)
- `created_by` (`uuid`, Nullable)
- `updated_by` (`uuid`, Nullable)

### 2. `AuthSecurityEventOutbox` (`auth_security_events_outbox`)
Owned by Access Service security outbox infrastructure.
- `id` (`UUID`, Primary Key)
- `tenant_code` (`varchar(50)`, Non-null)
- `user_id` (`uuid`, Nullable)
- `event_type` (`varchar(100)`, Non-null, e.g. `user_group.scope_updated`, `authorization.user-group-updated`)
- `sanitized_payload` (`jsonb`, Non-null)
- `publish_status` (`varchar(30)`, Default: `pending`)
- `attempt_count` (`int`, Default: 0)
- `created_at` (`timestamptz`)

## Domain Value Objects & Enums

### `ScopeType`
- `SELF`: Grants permissions strictly relative to the employee's own records.
- `DIRECT_REPORTEES`: Grants permissions relative to direct reportees in the reporting hierarchy.
- `COMPANY`: Grants permissions within the specified legal entity (`scope_ref_id`).
- `LOCATION`: Grants permissions within the specified workplace location (`scope_ref_id`).
- `DEPARTMENT`: Grants permissions within the specified organizational department (`scope_ref_id`).
- `TENANT_WIDE` / `TENANT`: Grants permissions across the entire tenant organization.

### `ScopeDefinition`
```typescript
export interface ScopeDefinition {
  scopeType: ScopeType;
  scopeRefId?: string | null;
}
```

## Validation Invariants
1. `scopeType` MUST be one of the defined `ScopeType` enum values.
2. If `scopeType` is in `[COMPANY, LOCATION, DEPARTMENT]`, `scopeRefId` MUST be a non-empty string.
3. If `scopeType` is in `[SELF, DIRECT_REPORTEES, TENANT_WIDE]`, `scopeRefId` MUST be `null`.

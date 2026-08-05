# Data Model: Restrict Login to Approved Network Locations

## Entities & Schemas

### 1. `AuthenticationSettings` Entity (`authentication_settings` table)

| Column Name | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Record unique identifier |
| `tenant_code` | `varchar` | FK to `tenants(tenant_code)`, Unique | Associated tenant identifier |
| `ip_restriction_enabled` | `boolean` | default `false` | Enables/disables IP network location checks |
| `allowed_ip_cidrs` | `jsonb` | default `'[]'::jsonb` | Array of IPv4/IPv6 CIDR block strings (e.g. `["192.168.1.0/24", "2001:db8::/32"]`) |
| `created_at` | `timestamp` | default `now()` | Record creation timestamp |
| `updated_at` | `timestamp` | default `now()` | Record last update timestamp |
| `version` | `integer` | default `1` | Optimistic locking version |

### 2. Redis Key Schema

- **Key**: `auth:ip-failure:{tenantCode}:{userId}`
- **Type**: String / Counter
- **Value**: Integer count of IP-based authentication denials
- **TTL**: 3600 seconds (sliding window)

### 3. Domain Interfaces

```typescript
export enum AuthActionType {
  PASSWORD_LOGIN = 'PASSWORD_LOGIN',
  MFA_VERIFY = 'MFA_VERIFY',
  SSO_LOGIN = 'SSO_LOGIN',
  INVITATION_VALIDATION = 'INVITATION_VALIDATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
}

export interface IpValidationRequest {
  tenantCode: string;
  sourceIp: string;
  actionType: AuthActionType;
  userId?: string;
}

export interface IpValidationResult {
  allowed: boolean;
  reason?: 'IP_NOT_ALLOWED' | 'INVALID_SOURCE_IP_FORMAT' | 'EXEMPTED';
}
```

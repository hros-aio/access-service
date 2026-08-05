# Phase 0 Research: Tenant Authentication Settings

## 1. Outbox Event Format and Diff Representation

### Decision
Use a standardized key-value dictionary structure for change diffs in the `sanitized_payload` JSONB column of `auth_security_events_outbox`:
```json
{
  "tenantCode": "TENANT_123",
  "updatedByUserId": "usr_admin_99",
  "changes": {
    "mfaRequired": { "old": false, "new": true },
    "lockoutThreshold": { "old": 5, "new": 3 },
    "ipAllowList": { "old": ["192.168.1.0/24"], "new": ["192.168.1.0/24", "10.0.0.0/8"]}
  },
  "updatedAt": "2026-08-05T22:00:00.000Z"
}
```

### Rationale
- Standardizes the `changes` dictionary across SIEM, audit, and notification consumers.
- Only non-secret, modified attributes are included in the diff.

### Alternatives Considered
- Full snapshot output: Rejected because consumers need explicit changed attributes for audit compliance logs without computing diffs downstream.

---

## 2. Validation Rules for IP Allow-List & CIDR Strings

### Decision
Use `class-validator` `@IsArray()`, `@IsString({ each: true })`, `@IsIP({ each: true })` or custom CIDR validator decorator in `UpdateAuthenticationSettingsDto`. Validate that if `ipRestrictionEnabled` is set to `true` (or remains `true`), `ipAllowList` MUST contain at least 1 valid IP/CIDR string.

### Rationale
- Prevents locking out administrators when enabling IP restriction without any allowed IP addresses.
- Guarantees malformed IP CIDR values are caught at the controller boundary before hitting domain/database layers.

### Alternatives Considered
- Database regex constraint: Rejected because error messages are unhelpful for REST API clients compared to HTTP 400 validation responses.

---

## 3. Optimistic Concurrency Control in TypeORM with Custom Tenant Filter

### Decision
Implement optimistic locking using TypeORM entity `@VersionColumn()` counter and execute updates via `AuthenticationSettingsRepository.updateWithOptimisticLock()`:
```ts
const result = await repo.createQueryBuilder()
  .update(AuthenticationSettings)
  .set({ ...updates, version: expectedVersion + 1, updatedAt: new Date() })
  .where('tenant_code = :tenantCode AND version = :expectedVersion', { tenantCode, expectedVersion })
  .execute();

if (result.affected === 0) {
  throw new ConcurrentModificationError('Settings have been modified by another request');
}
```

### Rationale
- Enforces strict tenant scoping alongside version matching.
- Explicitly handles missing updates as HTTP 409 `ConcurrentModificationError`.

### Alternatives Considered
- Pessimistic DB locking (`SELECT FOR UPDATE`): Rejected by Constitution VII (Performance Principles & Optimistic Concurrency).

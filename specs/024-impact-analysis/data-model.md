# Data Model: Pre-Commit Impact Analysis & High-Impact Warnings

## Value Objects & DTOs

### 1. `ImpactEstimate`
Represents the evaluated blast radius for a proposed modification.

| Field | Type | Description |
|---|---|---|
| `usersGaining` | `number` | Gross count of users gaining access / membership |
| `usersLosing` | `number` | Gross count of users losing access / membership |
| `totalAffected` | `number` | Total unique employees affected (`usersGaining + usersLosing` or active reach) |
| `isHighImpact` | `boolean` | `true` if `totalAffected >= threshold` |
| `threshold` | `number` | High-impact threshold used for evaluation (default: 100) |
| `isEstimated` | `boolean` | Flag indicating exact calculation or fallback estimation |

### 2. `CoverageLossWarning`
Represents single-holder critical capability loss indicator.

| Field | Type | Description |
|---|---|---|
| `capabilityCode` | `string` | System capability or system role key at risk (e.g. `ADMINISTRATOR`) |
| `priorHoldersCount` | `number` | Current active distinct holders of the capability |
| `projectedHoldersCount` | `number` | Projected active distinct holders after the change (if 0, flagged) |
| `isCriticalLoss` | `boolean` | `true` if `projectedHoldersCount === 0 && priorHoldersCount > 0` |

### 3. `ImpactAnalysisResult`
Composite evaluation result returned by impact estimation and preview endpoints.

| Field | Type | Description |
|---|---|---|
| `targetType` | `'ROLE' \| 'USER_GROUP'` | The entity type being evaluated |
| `targetId` | `string` | The ID of the role or user group |
| `estimate` | `ImpactEstimate` | Blast radius numbers |
| `coverageLoss` | `CoverageLossWarning \| null` | Potential loss of critical capability holder |
| `requiresConfirmation` | `boolean` | Computed as `estimate.isHighImpact` |

---

## Existing Relational Tables Leveraged (Read-Only)

1. **`roles`**: Evaluated for role type (`SYSTEM` vs `CUSTOM`), status, and permissions.
2. **`role_permissions`**: Evaluated for associated permission codes and protected capabilities.
3. **`user_groups`**: Evaluated for matching rules, scope, and status.
4. **`user_group_memberships`**: Materialized group members used for `EXCEPT` set diffing against prospective dynamic rule evaluation.
5. **`user_effective_roles`**: Materialized user effective roles for evaluating active reach and sole-holder critical capabilities.
6. **`employee_references`**: Projected workforce employee reference table against which prospective dynamic matching rules are evaluated.
7. **`auth_security_events_outbox`**: Transactional outbox table where confirmed high-impact audit events are persisted atomically upon save.

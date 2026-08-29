# Phase 0 Research: User Group Scope Configuration

## Decisions and Architecture Resolutions

### 1. Scope Type Representation & Domain Enum
- **Decision**: Align `ScopeType` values across codebase and specifications: `SELF`, `DIRECT_REPORTEES`, `COMPANY`, `LOCATION`, `DEPARTMENT`, `TENANT_WIDE` (with `TENANT` alias or normalized enum).
- **Rationale**: `src/modules/user-groups/domain/enums/scope-type.enum.ts` already defines `ScopeType` with members `SELF`, `DIRECT_REPORTEES`, `COMPANY`, `LOCATION`, `DEPARTMENT`, `TENANT_WIDE`. In API input/output, `TENANT_WIDE` and `TENANT` will be accepted seamlessly, mapping to the platform canonical definition.
- **Alternatives Considered**: Creating an entirely new enum or custom string types. Rejected to maintain consistency with existing schema and migrations.

### 2. Scope Validation Invariants
- **Decision**: Implement `UserGroupScopeValidator` (and methods on `UserGroupAggregate`):
  - If `scopeType` is `COMPANY`, `LOCATION`, or `DEPARTMENT`, `scopeRefId` is mandatory (non-empty string).
  - If `scopeType` is `SELF`, `DIRECT_REPORTEES`, `TENANT` / `TENANT_WIDE`, `scopeRefId` is forced/normalized to `null`.
- **Rationale**: Entity-anchored scopes require the specific organization unit ID to restrict reach; user-relative or tenant-wide scopes do not require or allow external target reference IDs.
- **Alternatives Considered**: Rejecting requests if `scopeRefId` is passed for `TENANT`. Auto-normalizing to `null` is more resilient for client UX while strictly rejecting missing `scopeRefId` for entity-anchored scopes.

### 3. Impact Estimation Engine
- **Decision**: Implement `UserGroupScopeImpactService` (or `ScopeImpactCalculator`):
  - Retrieves current materialized membership count (`user_group_memberships`) for the specified group.
  - Compares with platform high-impact threshold (default: 100 or configurable constant).
  - Returns `{ affectedUserCount, requiresConfirmation, threshold, previousScope, proposedScope }`.
- **Rationale**: Non-mutating pre-flight calculation allows administrators to see the blast radius before applying scope expansions or restrictions.
- **Alternatives Considered**: Recalculating dynamic matching on the fly. Reading materialized membership count is $O(1)$/$O(\log N)$ and accurately represents the active population that will experience the scope change.

### 4. Transactional Outbox & Audit Events
- **Decision**:
  - Add `USER_GROUP_SCOPE_UPDATED = 'user_group.scope_updated'` to `EventType` enum.
  - In `AuthSecurityEventOutbox`, add factory helper `fromUserGroupScopeUpdated(context, { userGroup, previousScope, newScope })`.
  - Also persist `authorization.user-group-updated` domain event for reconciliation sync worker.
- **Rationale**: Conforms to System Architecture and Constitution Section 4/8 for immutable security audit trail and reliable outbox event publishing.
- **Alternatives Considered**: Direct synchronous event publishing. Outbox pattern provides transactional atomicity with PostgreSQL.

### 5. Controller & REST Endpoints
- **Decision**: Introduce dedicated `UserGroupScopeController` (or extend under `/user-groups/:id/scope`):
  - `GET /user-groups/:id/scope` - Retrieve current scope configuration and sync status (`isPendingSync`).
  - `POST /user-groups/:id/scope/impact-estimate` - Pre-commit blast radius preview.
  - `PUT /user-groups/:id/scope` - Save scope configuration with optimistic locking and confirmation gate.
- **Rationale**: Clean separation of scope management concerns matching the pattern used by `UserGroupRoleController`.

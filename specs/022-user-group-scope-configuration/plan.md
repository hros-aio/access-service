# Implementation Plan: User Group Scope Configuration

**Branch**: `022-user-group-scope-configuration` | **Spec**: [spec.md](specs/022-user-group-scope-configuration/spec.md)

## Summary
Enable tenant administrators to configure and update the organizational scope boundary (`SELF`, `DIRECT_REPORTEES`, `COMPANY`, `LOCATION`, `DEPARTMENT`, `TENANT_WIDE`) on User Groups. Scope changes follow an asynchronous reconciliation pipeline: updating scope increments the group's `version` counter without modifying `projection_version` or mutating effective access synchronously, and records transactional audit events in the security outbox. Pre-commit impact estimation and high-impact confirmation safeguards ensure safe administration.

## Technical Context
- **Language/Framework**: TypeScript (v5.x), NestJS
- **Database**: PostgreSQL with TypeORM
- **Security & Multi-Tenancy**: `RequestContextService` tenant scoping, `@RequirePermissions('user_group.update')`
- **Transactional Outbox**: `auth_security_events_outbox` for `user_group.scope_updated` and `authorization.user-group-updated`

## Constitution Check
- [x] **Clean Architecture**: Controller (transport) -> Service (business logic) -> Repository (data access).
- [x] **Strict Multi-Tenancy**: All queries filtered by `tenantCode` from `RequestContextService`.
- [x] **Transactional Boundaries**: Atomically update `user_groups` and insert outbox records within a single database transaction.
- [x] **Deferred Reconciliation**: Does not synchronously recalculate `user_effective_roles` or cache; dirty state tracked via `version > projection_version`.
- [x] **Optimistic Locking**: Enforced via `expectedVersion` checking against `user_groups.version`.

## Design Artifacts
- **Phase 0 Research**: [research.md](specs/022-user-group-scope-configuration/research.md)
- **Phase 1 Data Model**: [data-model.md](specs/022-user-group-scope-configuration/data-model.md)
- **Phase 1 API Contracts**: [contracts/user-group-scope.contract.md](specs/022-user-group-scope-configuration/contracts/user-group-scope.contract.md)
- **Phase 1 Quickstart**: [quickstart.md](specs/022-user-group-scope-configuration/quickstart.md)

## Implementation Tasks (Overview)
1. **BE-SCOPE-001**: Implement `UserGroupScopeValidator`, `ScopeImpactCalculator`, and `UserGroupAggregate.updateScope(...)` domain methods.
2. **BE-SCOPE-002**: Implement `UserGroupScopeService` and outbox event publishing (`user_group.scope_updated`, `authorization.user-group-updated`).
3. **BE-SCOPE-003**: Implement `UserGroupScopeController` with REST endpoints (`GET /scope`, `POST /scope/impact-estimate`, `PUT /scope`).
4. **BE-SCOPE-004**: Comprehensive unit and integration test coverage for all validation rules, impact thresholds, concurrency conflicts, and isolation.

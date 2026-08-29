# Research: Multi-Group Cumulative Access Evaluation

## Research Decisions

### Decision 1: Projection Materialization Model (`user_effective_roles`)

- **Decision**: Store un-flattened role-scope associations per user in `user_effective_roles` (`tenant_code`, `user_id`, `role_id`, `source_group_id`, `scope_type`, `scope_ref_id`).
- **Rationale**: Keeps role assignments modular by tracking which user group contributed each role-scope pair. When a user is removed from one group, deleting matching rows is atomic and does not require recomputing unaffected groups.
- **Alternatives Considered**:
  - Flattening all effective permissions into DB rows: Rejected because permission flattening leads to high row explosion and makes incremental revocation / role definition updates expensive.
  - Fully dynamic on-the-fly calculation on every request without DB projection: Rejected because evaluating multi-group memberships, rules, and role matrices on every API request causes excessive latency (>50ms vs <5ms target).

### Decision 2: Redis Un-Flattened Caching & Monotonic Versioning

- **Decision**: Store user authorization state in Redis key `authz:user:{tenant}:{userId}` as JSON containing `{ "version": N, "roles": [ { "roleId", "scope": { "type", "refId" }, "sourceGroupId" } ] }` without flattening permissions into this key. Maintain role definitions in `authz:role:{tenant}:{roleId}` (accelerated with in-memory L1 cache).
- **Rationale**: Aligns with ADR-A9/ADR-A10. Decouples user-to-role assignment cache from role-to-permission definitions. When a role's permissions are edited, only the role cache is invalidated without having to invalidate every user assigned to that role.
- **Alternatives Considered**:
  - Flattening permission lists directly into user Redis keys: Rejected due to cache invalidation storms when role definitions change.

### Decision 3: Pure In-Memory Cumulative Access Evaluator (`CumulativeAccessEvaluator`)

- **Decision**: Implement access evaluation as a pure function with zero I/O. Access is granted if `targetResource` satisfies ANY matching role's scope constraint (Logical OR union).
- **Rationale**: Pure functions are deterministically testable with unit tests across all permission and scope matrix combinations. Eliminating I/O ensures sub-millisecond evaluation times inside middleware / guards.
- **Alternatives Considered**:
  - Embedding database queries inside the evaluator: Rejected per Constitution and Clean Architecture principles (evaluators must be stateless and fast).

### Decision 4: Fail-Closed Guard Strategy and Resilience

- **Decision**: The runtime `AuthorizationGuard` fails closed:
  - Cache miss on `authz:user:*` triggers lazy DB projection recovery.
  - Absence of permissions/roles returns HTTP 403 (`AUTHZ_PERMISSION_DENIED`).
  - Redis connection failure or timeout surfaces HTTP 503 (`AUTHZ_STORE_UNAVAILABLE`).
- **Rationale**: Strict fail-closed security guarantees no unauthorized access occurs during network partitions or misconfigurations.

### Decision 5: Bootstrap Capabilities Endpoint

- **Decision**: Expose `GET /auth/bootstrap/capabilities` resolving cumulative permissions and navigation modules directly from the user's cached roles and the in-memory `PermissionCatalogModule`.
- **Rationale**: Provides instant post-login frontend state without querying group membership tables or running dynamic evaluation rules.

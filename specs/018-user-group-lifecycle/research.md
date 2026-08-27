# Phase 0 Research: User Group Definition & Lifecycle

## 1. Technical Decisions and Architecture Patterns

### Decision 1: Optimistic Concurrency Control vs. Locking Strategy
- **Decision**: Enforce optimistic concurrency control on `user_groups.version` via HTTP payload `version` tokens and TypeORM `@VersionColumn()` / explicit `WHERE id = :id AND version = :expectedVersion` checks.
- **Rationale**: User Group configurations are edited by tenant administrators in web dashboards. Optimistic locking avoids row-level contention while preventing last-write-wins collisions, returning HTTP 409 Conflict if concurrent modifications occur.
- **Alternatives Considered**:
  - *Pessimistic DB Locks (`SELECT FOR UPDATE`)*: Blocks concurrent readers and introduces deadlock hazards across interactive UI workflows.

### Decision 2: Closed Allow-list Matching Rule Validation & Key Indexing
- **Decision**: Implement a domain validation engine (`MatchingRuleValidator`) that parses the JSON structure of `matching_rule`, enforcing:
  1. Strict closed allow-list of attribute keys: `employmentStatus`, `companyId`, `locationId`, `departmentId`, `gradeId`, `jobTitleId`, `reporteesCount`, `hasReportees`.
  2. Supported operators (e.g. `EQUALS`, `IN`, `GREATER_THAN`, `LESS_THAN`, `IS_TRUE`, `IS_FALSE`).
  3. Logical "AND" composition only at the top level.
  4. Automatic extraction and deduplication of referenced attribute keys into `user_groups.rule_attribute_keys` (`TEXT[]`).
- **Rationale**: Prevents arbitrary code/SQL execution, ensures dynamic membership queries remain indexable and predictable, and enables indexing by attribute key for downstream worker selective invalidation.
- **Alternatives Considered**:
  - *Dynamic script/eval execution (e.g., JavaScript expressions)*: Critical security vulnerability and impossible to index efficiently in PostgreSQL.
  - *Unvalidated JSONB storage*: Prone to runtime crashes during background worker reconciliation.

### Decision 3: Scope Type Modeling and Constraints
- **Decision**: Support exactly one `ScopeType` per group (`SELF`, `DIRECT_REPORTEES`, `COMPANY`, `LOCATION`, `DEPARTMENT`, `TENANT_WIDE`) with an optional `scope_ref_id` (used when `scope_type` is `COMPANY`, `LOCATION`, or `DEPARTMENT`).
- **Rationale**: Aligns with Authorization PRD Section 5.8 and Constitution. User group permissions are projected through this scope dimension to determine data boundaries.
- **Alternatives Considered**:
  - *Multiple scopes per group*: Overcomplicates rule evaluation and projection tables; complex scopes can be achieved by assigning distinct groups to users.

### Decision 4: Asynchronous Dirty-State Synchronization Boundary
- **Decision**: User Group creation, update, deactivation, and reactivation increment `version` without updating `projection_version`. The system evaluates dirty status as `isPendingSync: boolean = (version > projection_version)`. HTTP requests never synchronously compute memberships or write `user_group_memberships`.
- **Rationale**: Evaluating matching rules across thousands of employees can be compute-intensive. Marking the group dirty and emitting `authorization.user-group-updated` via the transactional outbox ensures responsive HTTP latencies (< 50ms) while guaranteeing eventual consistency via the reconciliation worker (`FEAT-AUTHZ-11`).
- **Alternatives Considered**:
  - *Synchronous inline membership calculation*: Causes HTTP request timeouts and connection pool exhaustion on large employee directories.

### Decision 5: Draft State & Zero-Assigned-Roles Handling
- **Decision**: Permitting `user_group_roles` to be empty upon creation or update. The query layer exposes `hasNoAssignedRoles: boolean = (assignedRoles.length === 0)`.
- **Rationale**: Administrators often configure dynamic employee segmentation rules before assigning roles or before role definitions are finalized.
- **Alternatives Considered**:
  - *Mandating at least 1 role*: Prevents staging and draft workflows.

### Decision 6: Transactional Outbox Security Events
- **Decision**: All mutations (`user_group.created`, `user_group.updated`, `user_group.deactivated`, `user_group.reactivated`) and the domain event `authorization.user-group-updated` are persisted to `auth_security_events_outbox` inside the same PostgreSQL transaction as the `user_groups` and `user_group_roles` writes.
- **Rationale**: Eliminates dual-write anomalies between PostgreSQL and Kafka/event-bus, guaranteeing audit and sync event delivery.
- **Alternatives Considered**:
  - *Publishing directly to message broker in HTTP thread*: Message could publish even if database transaction rolls back, or database could commit while message publish fails.

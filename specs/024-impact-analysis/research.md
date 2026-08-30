# Research: Pre-Commit Impact Analysis & High-Impact Warnings

## Decision 1: Domain Module Placement and Boundaries
- **Decision**: Create a dedicated `impact-analysis` module (`src/modules/impact-analysis/`) exporting `ImpactAnalysisService`, `ImpactAnalysisRepository`, and `ImpactAnalysisController`.
- **Rationale**: Keeps impact evaluation concerns isolated and reusable across both `roles` and `user-groups` modules without creating cyclic dependencies.
- **Alternatives Considered**:
  - Embedding inside `user-groups`: Violates SRP and creates awkward reverse dependencies when `roles` module needs to evaluate role permission changes and single-holder coverage loss.
  - Embedding inside `authorization`: Authorization is focused on runtime access resolution, guards, and effective role projections. Impact analysis is an administrative pre-commit simulation tool.

## Decision 2: Set-Based Non-Mutating Estimation Strategy
- **Decision**: Execute set-based read-only SQL queries (`EXCEPT`, `UNION`, `INTERSECT`, and parameterized dynamic rule matching against `employee_references` and `user_group_memberships`) using PostgreSQL parameterized queries.
- **Rationale**: Guarantees zero side effects (no rows written, no cache dirtied, no projection versions bumped) while computing exact gross additions (`projected EXCEPT current`), gross removals (`current EXCEPT projected`), and active role reach from `user_effective_roles`.
- **Alternatives Considered**:
  - In-memory JS diffing: Fails scale requirements when employee counts reach thousands.
  - Temporary tables or transaction rollbacks: Adds unnecessary write lock contention and overhead on the primary database.

## Decision 3: Sole-Holder Critical Capability Coverage Loss Detection
- **Decision**: Check whether removing a role or modifying a user group removes the last remaining active holder of critical built-in administrative roles (specifically `BUILT_IN_ADMIN` / `ADMINISTRATOR` system role).
- **Rationale**: Directly enforces PRD §9 Edge Cases and prevents organizational lockout from administrative interfaces.
- **Alternatives Considered**:
  - Purely client-side checks: Insecure and easily bypassed.
  - Generic role check: Only critical administrative roles should trigger coverage loss blocking warnings.

## Decision 4: Two-Step High-Impact Confirmation Guard Flow
- **Decision**:
  1. Frontend or API caller requests preview via `POST /roles/:id/impact-preview` or `POST /user-groups/:id/impact-preview` or submits an update directly.
  2. If `isHighImpact` is true (affected users >= threshold) and `confirmed` is falsy, the update endpoints reject the save with a `HighImpactConfirmationRequiredError` (HTTP 409) returning the evaluated blast radius.
  3. When resubmitted with `confirmed: true`, the mutation proceeds inside a transaction with optimistic locking check (`version`), records the audit event with the acknowledged blast radius in the outbox, and commits.
- **Rationale**: Follows the established patterns in `UserGroupRoleAssignmentService` and `RoleApplicationService` while standardizing the payload and response structure.

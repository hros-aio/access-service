# Research: Employee Status Synchronization

This research document consolidates architectural and technical decisions for implementing the employee status synchronization feature.

## Technical Decisions & Rationale

### 1. Event Ordering and Idempotency Strategy
* **Decision**: We will perform idempotency and event ordering checks using a monotonically increasing `sourceVersion` provided by the Directory/HR domain event payloads.
* **Rationale**: Kafka does not guarantee ordered delivery across partitions unless explicitly keyed. By comparing the event's `sourceVersion` with the persisted `employee_references.source_version` in the database, we can safely discard stale, duplicate, or out-of-order events.
* **Alternatives Considered**: 
  - *Timestamp comparison*: Rejected because clocks can skew across microservices.
  - *Kafka partition key serialization only*: Rejected because network retries or failures can still cause out-of-order delivery.

### 2. Concurrency Control
* **Decision**: Implement pessimistic row-level locking (`SELECT FOR UPDATE`) on the `User` and `EmployeeReference` records during status transitions.
* **Rationale**: Prevents race conditions if multiple lifecycle events or administrative edits occur concurrently for the same user.
* **Alternatives Considered**:
  - *Optimistic Locking*: Rejected because it requires complex retry loops for concurrent updates on the same entity and can lead to validation failures.

### 3. Safe Reactivation and Re-Onboarding
* **Decision**: Reactivation will transition the user's status to `INVITED` and generate a brand-new onboarding invitation. Existing pending invitations will be marked `REVOKED`, and old credentials will remain invalid.
* **Rationale**: Ensures complete security boundary enforcement for rehired employees. They must re-verify their identity and set up fresh credentials.
* **Alternatives Considered**:
  - *Silent reactivation*: Rejected as it exposes security risks if old passwords/keys are reused.

### 4. Active Session Revocation (Redis & PG Sync)
* **Decision**: Clear Redis session keys (`auth:session:{sid}` and `auth:user-sessions:{tenantCode}:{userId}`) immediately after committing the PostgreSQL database transaction.
* **Rationale**: Immediate revocation ensures the user cannot continue using active sessions. Doing it post-commit guarantees that we only revoke sessions if the database state transition is persisted. If Redis is temporarily unavailable, the bumped `security_version` in PostgreSQL ensures that subsequent stateless JWT authentication checks fail.

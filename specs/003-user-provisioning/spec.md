# Feature Specification: Tenant Bootstrap Root Admin Provisioning

**Feature Branch**: `003-user-provisioning`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "/speckit-specify ... User Story: US-001 · Built-In Administrator Provisioning ..."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Built-In Administrator Provisioning (Priority: P1)

Automatically create exactly one built-in administrator when a new tenant is set up, so every customer has someone able to configure and manage their tenant from day one.

**Why this priority**: It is the core bootstrapping mechanism for tenant onboarding. Without a root administrator, the tenant cannot access the system or perform administrative setup.

**Independent Test**: Can be fully tested by sending a valid `tenant.created` event to the consumer and verifying that exactly one user with `protected_root_admin = TRUE` is created in the database and an outbox event is generated.

**Acceptance Scenarios**:

1. **Given** a new tenant is being provisioned,
   **When** the `tenant.created` event is consumed,
   **Then** exactly one built-in administrator account must exist for that tenant,
   **And** that administrator must not be linked to any employee record,
   **And** that administrator must have full administrative authority within that tenant only.

2. **Given** a built-in administrator already exists for a tenant,
   **When** a `tenant.created` event is received again for the same tenant,
   **Then** no second built-in administrator must be created,
   **And** the existing administrator account must remain completely unchanged.

3. **Given** a built-in administrator exists for a tenant,
   **When** anyone attempts to delete that administrator or reduce their capability below the protected minimum,
   **Then** the attempt must be rejected.

---

### User Story 2 - Idempotent Event Consumption (Priority: P1)

Ensure duplicate Kafka events containing identical eventIds are handled idempotently to prevent processing the same creation event multiple times.

**Why this priority**: Avoids duplicate users or database write concurrency errors due to at-least-once message delivery semantics.

**Independent Test**: Can be tested by sending duplicate `tenant.created` events with the same `eventId` and confirming the second event does not trigger database user creation.

**Acceptance Scenarios**:

1. **Given** a `tenant.created` event has already been successfully processed,
   **When** a duplicate event with the same `eventId` is received,
   **Then** the event must be acknowledged cleanly as a no-op,
   **And** no new user account or outbox record must be created.

---

### User Story 3 - Outbox Security Event Relaying (Priority: P2)

Atomically write an outbox record for downstream services when a root admin is provisioned.

**Why this priority**: Guarantees that downstream services (e.g. Notification, Authorization) are notified of the new user in a reliable, eventually consistent manner.

**Independent Test**: Can be tested by creating a tenant and verifying that the `authentication.user-provisioned` event is saved in the outbox table inside the same user creation transaction.

**Acceptance Scenarios**:

1. **Given** a new tenant is being provisioned,
   **When** the root admin creation transaction commits,
   **Then** a corresponding `authentication.user-provisioned` outbox record must be atomically committed,
   **And** it must not contain any sensitive security details or secrets.

---

### Edge Cases

- **Missing rootAdminEmail**: If the consumed payload is missing the administrator email or has an invalid email format, the system must abort processing, route the event to a Dead Letter Queue (DLQ), log the event as `INVALID_EVENT_PAYLOAD`, and must not create any user or outbox records.
- **Concurrent Provisioning Events**: If two processes attempt to bootstrap the same tenant concurrently, the database partial unique index must prevent both from succeeding, raising a concurrency conflict error, which is caught and retried/resolved gracefully.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST process `tenant.created` events on the `tenant.lifecycle-events` topic to bootstrap the root administrator.
- **FR-002**: System MUST validate that the `rootAdminEmail` matches standard email format criteria.
- **FR-003**: System MUST verify that no root administrator exists for the tenant using a `SELECT FOR UPDATE` query before inserting the new user.
- **FR-004**: System MUST check Kafka `eventId` uniqueness against a processed events record to enforce consumer idempotency.
- **FR-005**: System MUST insert exactly one `User` entity with `protected_root_admin = TRUE` and status `ACTIVE`.
- **FR-006**: System MUST append an `authentication.user-provisioned` outbox message to `auth_security_events_outbox` in the same database transaction.
- **FR-007**: System MUST reject any attempt to delete or downgrade users marked with `protected_root_admin = TRUE`.

### Key Entities

- **User**: The identity representing the tenant administrator, mapping `email`, `tenantCode`, and `protectedRootAdmin`.
- **ConsumedEvent**: Record tracking processed event IDs to prevent duplicate processing.
- **AuthSecurityEventOutbox**: Outbox queue representation for reliable transactional messaging.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of valid `tenant.created` events result in exactly one built-in administrator user created and available within 2 seconds of the event being received.
- **SC-002**: 100% of duplicate Kafka events with identical `eventId`s are processed cleanly as a no-op with zero database locks or duplicate creations.
- **SC-003**: 0% of transactional write failures result in mismatched state between user accounts and outbox security events.

---

## Assumptions

- The `users` table already contains the partial unique index `uq_users_one_protected_root_admin_per_tenant` in PostgreSQL.
- An idempotency tracking database table or record exists or will be added to support event tracking.
- Downstream services (e.g. Notification) are responsible for sending the welcome email and will consume the outbox event; this service does not send emails directly.
- The `TenantProvisioningConsumer` initialized via NestJS will run on active worker pods in the Kubernetes cluster.

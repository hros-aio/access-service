# Research Report: Tenant Bootstrap Root Admin Provisioning

## 1. Idempotency Tracking

### Decision
Implement a dedicated `ConsumedEvent` entity mapping to a PostgreSQL table `kafka_consumed_events` to keep track of processed event IDs.

### Rationale
Kafka guarantees at-least-once delivery, which can result in duplicate event ingestion. To avoid creating duplicate root admin users or triggering duplicate outbox events, we must verify if the event's unique identifier (`EventEnvelope.id`) has already been processed within the same database transaction.

### Alternatives Considered
- **Redis-based tracking**: Rejected because Redis writes cannot be committed atomically with the PostgreSQL database transaction. If the DB write rolls back, the Redis lock remains, preventing retry attempts.
- **Relying solely on database constraints**: Rejecting duplicates via database constraints (`uq_users_one_protected_root_admin_per_tenant`) only protects against duplicate admin creation within the same tenant. It does not prevent recording redundant audit logs or outbox events for duplicate messages that arrive after the admin has already been created.

---

## 2. Kafka Consumer Architecture

### Decision
Leverage `@new-hros/libs-events`'s `setupKafkaMicroservice` in `main.ts` and NestJS's `@EventPattern` decorators to listen to topic `tenant.lifecycle-events` for the `tenant.created` event.

### Rationale
Using NestJS `@EventPattern` conforms to the modular structure of the project. The framework will handle message deserialization, connection lifecycle, and transport setup automatically.

---

## 3. Transaction and Locking Strategy

### Decision
Wrap user creation, outbox event generation, and idempotency recording inside a single transaction using TypeORM's `EntityManager` or QueryRunner. Scoping the lock with `SELECT FOR UPDATE` on the user entity by `tenantCode` ensures concurrent bootstrap events are safely serialized.

### Rationale
Ensures atomic "all-or-nothing" guarantees. If an event is processed successfully, the idempotency record, user, and outbox event are all written. If it fails, all changes are rolled back.

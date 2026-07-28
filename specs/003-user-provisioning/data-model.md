# Data Model: Tenant Bootstrap Root Admin Provisioning

## 1. New Entities

### ConsumedEvent

Tracks consumed Kafka events to enforce message idempotency within database transactions.

- **Table Name**: `kafka_consumed_events`
- **Fields**:
  - `id` (UUID, PRIMARY KEY): The unique ID of the event (`EventEnvelope.id`).
  - `topic` (VARCHAR(100), NOT NULL): The topic name from which the event was consumed.
  - `processedAt` (TIMESTAMP WITH TIME ZONE, NOT NULL, DEFAULT `NOW()`): Timestamp of completion.

```typescript
@Entity('kafka_consumed_events')
export class ConsumedEvent {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'topic', type: 'varchar', length: 100 })
  topic: string;

  @CreateDateColumn({ name: 'processed_at', type: 'timestamptz' })
  processedAt: Date;
}
```

---

## 2. Existing Entities Alignment

### User

No schema modifications are required. We will use the existing entity:
- `protectedRootAdmin` (boolean): Set to `TRUE` for the bootstrapped admin.
- `normalizedEmail` (string): Built-in admin's normalized email address.
- `displayEmail` (string): Raw email address format.
- `status` (string): Set to `ACTIVE`.
- `userType` (string): Set to `BUILT_IN_ADMIN` (or standard type from business rules).
- `credentialStatus` (string): Set to `pending` or `active` as per domain conventions.

### AuthSecurityEventOutbox

No schema modifications are required. We will use the existing entity:
- `eventType` (string): `authentication.user-provisioned`
- `sanitizedPayload` (jsonb): Clean metadata sent downstream.
- `publishStatus` (string): Defaults to `pending`.

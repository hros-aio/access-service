# Research & Design Decisions: Log In With Email and Password

## Key Design Decisions

### 1. Password Hashing Algorithm
- **Decision**: Use Argon2id (specifically `@new-hros/libs-core` wrappers / native `argon2` bindings in `Argon2CryptoAdapter`).
- **Rationale**: Argon2id is the state-of-the-art password hashing standard (recommended by OWASP and NIST), offering robust protection against GPU/ASIC-based brute-force attacks through memory-hard operations.
- **Alternatives Considered**: 
  - `bcrypt`: Rejected because it is less resistant to hardware-accelerated attacks compared to Argon2id.
  - `PBKDF2`: Rejected because it has weaker memory-hardness properties.

### 2. Lockout Tracking
- **Decision**: Track consecutive login failures in Redis (`auth:login-failure:{tenantCode}:{userId}`) using an atomic `INCR` operation with a rolling 15-minute TTL.
- **Rationale**: Storing ephemeral login attempt counters in Redis reduces PostgreSQL write load and provides atomic operations to prevent distributed/concurrent brute-force attempts.
- **Alternatives Considered**:
  - PostgreSQL tracking: Rejected due to unnecessary write overhead and lock contention on database rows during brute-force login attempts.

### 3. Account Lockout Concurrency Control
- **Decision**: Enforce row-level locking via `SELECT ... FOR UPDATE` on the `users` table row during credential validation.
- **Rationale**: When a user's failure count approaches the lockout threshold, concurrent incorrect login requests could execute simultaneously and bypass lockout logic. Obtaining a row-level lock on the target user guarantees that state checks and status updates (to `LOCKED`) are executed serializeably.
- **Alternatives Considered**:
  - Optimistic locking: Rejected because failure attempts are high-concurrency event bursts where blocking/serialization is the desired behavior rather than throwing optimistic lock errors to the client.

### 4. Audit Event Reliabilty (Transactional Outbox)
- **Decision**: Persist security audit events to `auth_security_events_outbox` in the same PostgreSQL transaction as user state updates.
- **Rationale**: Adheres to the Transactional Outbox pattern, preventing data discrepancies where user state is updated (e.g., status changed to `LOCKED`) but the event fails to publish to Kafka (or vice versa).
- **Alternatives Considered**:
  - Direct Kafka publishing: Rejected because it violates atomic transactional guarantees (can result in partial success/failure).

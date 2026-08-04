# Research: Account Lockout & Protection Mechanism

## Technical Decisions

### Decision 1: Modular Lockout Domain Architecture
- **Decision**: Keep `LockoutModule` focused on tracking and evaluating credential and IP failures, exposing a `LockoutService` provider for consumption by `AuthenticationModule` and `IpRestrictionModule`.
- **Rationale**: Complies with NestJS Clean Architecture guidelines (Constitution Principle I & IV). Encapsulates Redis Lua scripts and threshold checks within `src/modules/lockout/`.
- **Alternatives Considered**: Inlining failure increment logic directly into `AuthenticationService` (violates Single Responsibility Principle and duplicates IP failure counter handling).

### Decision 2: Atomic Failure Counter Tracking via Redis Lua Scripts
- **Decision**: Implement an atomic Lua script (`incr_failure_counter.lua`) in `LockoutModule` for incrementing Redis counters and applying sliding-window TTL (`900s` / 15 minutes) atomically on key creation.
- **Rationale**: Prevents race conditions during key initialization and ensures keys never persist without a TTL.
- **Alternatives Considered**: Standard multi-command `INCR` followed by `EXPIRE` in Node.js (susceptible to network interruption between INCR and EXPIRE resulting in persistent keys without TTL).

### Decision 3: Atomic Lockout Transaction & Event Outbox
- **Decision**: Execute user credential status update (`credential_status = 'locked'`, `security_version = security_version + 1`) and transactional outbox insertions (`authentication.account-locked`, `authentication.sessions-revoked`) inside a single PostgreSQL database transaction using TypeORM `EntityManager`.
- **Rationale**: Guarantees transaction atomicity. If database update succeeds, outbox event records are guaranteed to persist. Redis session eviction runs immediately after DB commit; if Redis fails, `security_version` bump invalidates any subsequent session verification attempt.
- **Alternatives Considered**: Publishing Kafka events directly without outbox (vulnerable to event loss if Kafka broker is unavailable during login failure).

### Decision 4: Constant-Time Execution for Excluded Accounts (US-031)
- **Decision**: For non-existent emails or disabled/suspended/archived users, perform a constant-time dummy bcrypt/argon2 hash comparison before returning a uniform `401 Unauthorized` generic message without touching Redis failure counters.
- **Rationale**: Prevents timing side-channel attacks for account enumeration and ensures malicious traffic against invalid accounts does not waste Redis memory or trigger unintended lockouts.
- **Alternatives Considered**: Immediate early-return without password verification (enables user enumeration timing attacks).

### Decision 5: Separate IP Restriction Counter & Alerting (US-032)
- **Decision**: Track unapproved IP network access failures using `auth:ip-failure:{tenantCode}:{userId}` Redis counter with a higher threshold (default: 10 attempts). Reaching the IP threshold triggers `SecurityEventService.append('authentication.security-alert-requested')` without updating `users.credential_status`.
- **Rationale**: Prevents weaponized account lockouts (where an attacker deliberately locks out a target user's account by guessing passwords from a blocked IP range).
- **Alternatives Considered**: Lock account on IP restriction failure (leaves users vulnerable to denial-of-service via weaponized lockouts).

# Research Notes: Password Setup via Company Single Sign-On (Fallback Path)

This document captures the technical decisions and research details for implementing the fallback SSO password setup mechanism.

## Decision 1: Password Hashing Algorithm

- **Decision**: Use Argon2id for password hashing.
- **Rationale**: Argon2id is the industry standard for password hashing, offering optimal resistance to GPU/ASIC-based brute-force attacks. It is already supported and configured in the access-service via the `argon2` library in `CredentialDomainService`.
- **Alternatives considered**:
  - *bcrypt*: Widespread but has a 72-character input limit and is less resistant to GPU-based hardware attacks.
  - *PBKDF2*: Older standard, significantly less performant and secure compared to memory-hard Argon2id.

## Decision 2: Session Tracking for Fallback SSO Flow

- **Decision**: Use Redis-cached session state with a short-lived Bearer setup-pending token.
- **Rationale**: Storing the setup state `auth:sso-setup:{flowId}` in Redis with a 15-minute TTL guarantees:
  1. High performance read/write operations.
  2. Stateless web instances (no local memory coupling).
  3. Automatic expiration cleanup.
  4. Robust replay protection: deleting the session key immediately upon successful password creation prevents reuse.
- **Alternatives considered**:
  - *Stateless signed JWTs (without DB/Cache lookup)*: Lacks instant revocation capability. If a user submits the request multiple times, or if a token is intercepted, it cannot be blacklisted without Redis tracking.
  - *Database-backed sessions*: Creates unnecessary write load on PostgreSQL for temporary flow states.

## Decision 3: Database Transaction & Locking Isolation Level

- **Decision**: Use a single PostgreSQL transaction with `READ COMMITTED` isolation combined with explicit `SELECT ... FOR UPDATE` locking on the `users` table.
- **Rationale**: Preventing double-credential setup and race conditions requires atomicity and serialization of checks.
  - Locking the `users` row at the start of the transaction blocks concurrent HTTP requests for the same account.
  - Once the lock is acquired, the system checks the credential status. If another request already created a credential, this request fails immediately with a `409 Conflict`.
- **Alternatives considered**:
  - *Serializable transaction isolation*: Higher overhead and prone to serialization failure rollbacks, which require application-level retry loops.
  - *No transactional grouping*: Risk of orphan credentials where user status transitions to ACTIVE but invitations fail to cancel, or outbox audit events are lost.

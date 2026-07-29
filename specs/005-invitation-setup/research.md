# Research Report: Invitation & First-Time Access Setup

**Branch**: `005-invitation-setup` | **Date**: 2026-07-29

This research report documents key design decisions and rationale for implementing the Invitation & First-Time Access Setup feature.

---

## 1. Token Hash Cryptography

### Decision
Use **SHA-256** via the Node.js standard library `crypto` module to hash the invitation tokens before database storage. The raw token is generated as a secure random 32-byte hex string.

### Rationale
- Securely masks tokens in the database to prevent exploitation in case of a database read breach.
- SHA-256 is highly efficient for exact-match database queries.
- No external dependencies are needed for token generation or verification.

### Alternatives Considered
- **bcrypt / Argon2id**: Rejected because invitation tokens are high-entropy (random 32-byte hex string), making brute-force attacks infeasible even without a slow/expensive hashing function. Speed is preferred here to allow fast database lookups.

---

## 2. Password Hashing

### Decision
Use **Argon2id** (via the `argon2` npm library) to hash user passwords when creating active credentials.

### Rationale
- Matches the security specification requirement.
- Argon2id is the state-of-the-art password hashing algorithm (OWASP/NIST recommended), providing customizable memory, time, and parallelism parameters to resist GPU/ASIC brute-force attacks.

### Alternatives Considered
- **bcrypt**: Rejected because Argon2id is the specified standard for the new credential module and offers better resistance to hardware-accelerated attacks.

---

## 3. Concurrency and Race Condition Management

### Decision
Implement pessimistic locking with **`SELECT ... FOR UPDATE`** on the `users` row during the transaction boundary of both invitation acceptance (`acceptInvitation`) and admin resend (`resendInvitation`). Enforce a database-level partial unique index `uq_invitations_one_pending_per_user` on `invitations(user_id) WHERE status IN ('pending', 'sent')`.

### Rationale
- Enforces mutual exclusion: if two Admins click "resend" at the exact same moment, or if a user accepts while an Admin resends, they will serialize on the `users` lock.
- The partial unique index provides a database backstop to guarantee a user can never have more than one active `PENDING` invitation.

### Alternatives Considered
- **Optimistic Locking**: Rejected because updating user-related tables (like invitations and credentials) is harder to serialize using simple version checks on the parent entity without explicit locking.

---

## 4. Session Revocation Failures (Redis)

### Decision
If the Redis connection fails during session/challenge revocation, throw a `503 AuthStoreUnavailableError` (mapped to HTTP 503) and rollback the database transaction. Do not swallow Redis exceptions.

### Rationale
- Ensures security invariants are met: a user must not be marked `ACTIVE` with a new password if their previous restricted sessions/MFA challenges could not be revoked due to a cache failure.

### Alternatives Considered
- **Silent failure / logging only**: Rejected because it leaves orphaned restricted sessions active, violating security boundaries.

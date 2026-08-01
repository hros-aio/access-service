# Phase 0 Research: Firebase SSO Login & External Identity Mapping

## 1. Firebase Admin SDK Token Verification & Circuit Breaker Isolation

- **Decision**: Integrate `firebase-admin` auth module wrapped within a circuit breaker pattern (using NestJS / RxJS / standard timeout wrapper with 5000ms threshold).
- **Rationale**: Server-side verification of RS256 ID tokens using Google's public key certs guarantees token authenticity. Wrapping the call in a circuit breaker isolates external network latency or Firebase service degradation, allowing graceful fallback to 503 Service Unavailable without stalling main API workers.
- **Alternatives Considered**:
  - Direct HTTP call to Google OAuth tokeninfo endpoint: Rejected because official `firebase-admin` SDK manages key caching, rotation, and signature verification securely.
  - Verification without circuit breaker timeout: Rejected because third-party network stalls could exhaust server connection pools.

## 2. Strict External Identity Resolution & Conflict Containment

- **Decision**: Query PostgreSQL `external_identities` table using exact lookup `(tenant_code, provider='firebase', provider_subject)`.
- **Rationale**: Enforces tenant-isolated multi-tenancy and zero identity ambiguity. If count == 0, throw `AUTH_UNMAPPED_IDENTITY` (401). If count > 1, throw `AUTH_FIREBASE_IDENTITY_CONFLICT` (409). Auto-account creation and email-based identity fallback are strictly forbidden to prevent account hijacking.
- **Alternatives Considered**:
  - Fallback matching on email address: Rejected due to security risks where external IdP email ownership might not be verified or could conflict with internal primary email records.
  - Auto-provisioning user on first SSO login: Out of scope for this feature (requires explicit provisioning flow).

## 3. Session Branching & Multi-Store Transaction Boundaries

- **Decision**:
  1. Evaluate user account status (active/locked/disabled) and IP restriction allow-list.
  2. Open DB transaction to insert audit log entry into `auth_security_events_outbox` (and update account lock state if threshold reached).
  3. Commit PostgreSQL transaction.
  4. Write session details to Redis based on user security state:
     - Mapped user missing password credential -> Restricted setup session `auth:sso-setup:{flowId}` (TTL: 15m), Status `PASSWORD_SETUP_REQUIRED`.
     - Mandatory MFA unfulfilled -> MFA challenge session `auth:mfa-challenge:{challengeId}` (TTL: 5m), Status `MFA_REQUIRED`.
     - Otherwise -> Full active HRMS session `auth:session:{sessionId}` (Sliding TTL: 15m, Max: 30d).
  5. If Redis fails after DB commit, fail closed with 503 Service Unavailable.
- **Rationale**: Guarantees audit compliance via PostgreSQL outbox while keeping Redis operations fast and post-commit. Prevents unauthorized system access when credentials/MFA are incomplete.
- **Alternatives Considered**:
  - Writing Redis session inside DB transaction: Rejected because external network calls to Redis shouldn't hold DB locks.

## 4. Audit Sanitization & Generic Error Security

- **Decision**: Sanitize all security outbox event payloads by explicitly removing `idToken`, client secrets, and raw credentials before writing JSONB payloads. Sanitize HTTP error responses for 401 Unauthorized to return a single generic message: `"Authentication failed via Single Sign-On. Please try again or contact your administrator."`
- **Rationale**: Prevents sensitive credential leakage in audit streams/logs and prevents account enumeration attacks.
- **Alternatives Considered**:
  - Detailed error messages (e.g., "User not found for subject X"): Rejected due to security risks regarding account enumeration.

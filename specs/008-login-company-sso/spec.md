# Feature Specification: Firebase SSO Login & External Identity Mapping

**Feature Branch**: `008-login-company-sso`

**Created**: 2026-08-01

**Status**: Draft

**Input**: User description: "Firebase SSO Login & External Identity Mapping"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Log In via Company Single Sign-On (Priority: P1)

As an employee using company Single Sign-On, I want to authenticate via my organization's external Identity Provider (federated via Firebase), so that I can securely log in to the system without typing internal password credentials.

**Why this priority**: Core login flow for company SSO users. High business priority for seamless corporate access.

**Independent Test**: Can be tested by sending a valid Firebase ID token for an existing mapped active user with active credentials, verifying a full active HRMS session token is issued.

**Acceptance Scenarios**:

1. **Given** a valid Firebase ID token for a mapped active user with an active password credential, allowed IP, and no unfulfilled MFA, **When** authenticating via `POST /auth/login/firebase`, **Then** the system issues an active HRMS session (`auth:session:{sessionId}`) and returns a 200 OK response with access and refresh tokens.
2. **Given** a valid Firebase ID token for a mapped user who has no active password credential set up, **When** authenticating via `POST /auth/login/firebase`, **Then** the system issues a restricted SSO setup session (`auth:sso-setup:{flowId}`) and returns a 200 OK response with status `PASSWORD_SETUP_REQUIRED`.
3. **Given** a valid Firebase ID token for a mapped user who requires MFA, **When** authenticating via `POST /auth/login/firebase`, **Then** the system issues an MFA challenge session (`auth:mfa-challenge:{challengeId}`) and returns a 200 OK response with status `MFA_REQUIRED` and challenge details.

---

### User Story 2 - Hard Reject on Identity Mismatch & Ambiguity (Priority: P2)

As a security system, I want to strictly enforce identity mapping boundaries, so that external identities that do not map to exactly one internal account are rejected immediately without auto-creating or linking accounts.

**Why this priority**: Critical security control preventing unauthorized access, account takeover, or account collision.

**Independent Test**: Can be tested by attempting SSO login with unmapped or duplicate external identity records and verifying appropriate failure responses and audit logs.

**Acceptance Scenarios**:

1. **Given** a valid Firebase ID token whose external UID is not found in the identity mapping records, **When** authenticating via `POST /auth/login/firebase`, **Then** the system denies access with HTTP 401 Unauthorized, returns a generic error message, appends an audit security event, and creates no internal account.
2. **Given** a valid Firebase ID token whose external UID maps to multiple internal user accounts (ambiguous mapping), **When** authenticating via `POST /auth/login/firebase`, **Then** the system denies access with HTTP 409 Conflict, appends an audit security event, and issues no session token.

---

### User Story 3 - Security Policy Enforcement on SSO Login (Priority: P3)

As a security administrator, I want account status, lockout counters, and IP restriction policies to be enforced during SSO login, so that locked, disabled, or untrusted network requests are blocked even with a valid Firebase token.

**Why this priority**: Ensures organization-level compliance and security controls apply equally to federated logins.

**Independent Test**: Can be tested by invoking SSO login from a restricted IP or for a locked user, ensuring access is blocked.

**Acceptance Scenarios**:

1. **Given** a valid Firebase ID token for a mapped user whose account is locked or disabled, **When** authenticating via `POST /auth/login/firebase`, **Then** the system denies access with HTTP 401 Unauthorized and logs an audit failure event.
2. **Given** a valid Firebase ID token for a mapped user requesting from an IP outside the tenant's allowed IP ranges, **When** authenticating via `POST /auth/login/firebase`, **Then** the system denies access with HTTP 401 Unauthorized and logs an audit failure event.

---

### User Story 4 - Fallback to Password Login When Single Sign-On Is Unavailable (Priority: P4)

As an employee, I want clear feedback when the external Single Sign-On service is unreachable or experiencing timeouts, so that I can fall back to standard password login.

**Why this priority**: Resilience and business continuity during third-party identity provider outages.

**Independent Test**: Can be tested by simulating a Firebase SDK network timeout/5xx error and verifying HTTP 503 response with fallback messaging.

**Acceptance Scenarios**:

1. **Given** the Firebase verification service is unreachable or times out (circuit breaker threshold exceeded), **When** authenticating via `POST /auth/login/firebase`, **Then** the system returns HTTP 503 Service Unavailable with a fallback suggestion to use password login.

---

### Edge Cases

- What happens when a raw Firebase ID token is included in request logs or security events? The system MUST sanitize and omit raw tokens from all audit events and logs.
- How does the system handle Redis session store failures after DB transaction commit? The system MUST fail closed, returning HTTP 503 Service Unavailable without granting access.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an HTTP REST endpoint `POST /auth/login/firebase` accepting `tenantCode` and `idToken`.
- **FR-002**: System MUST verify the Firebase ID token server-side against Google public keys using a circuit breaker (5000ms timeout limit).
- **FR-003**: System MUST resolve external identities strictly via exact match on `(tenant_code, provider='firebase', provider_subject)` in the external identity store.
- **FR-004**: System MUST NOT automatically create accounts or fallback to matching users by email address when an external identity mapping is absent.
- **FR-005**: System MUST reject authentication with HTTP 409 Conflict if an external identity subject resolves to more than one internal user account.
- **FR-006**: System MUST enforce user account lockout status and tenant IP allow-list restrictions during SSO authentication.
- **FR-007**: System MUST branch session creation based on user security state:
  - If password credential is missing/empty, issue restricted SSO setup session (`auth:sso-setup:{flowId}`, TTL 15m) and return `PASSWORD_SETUP_REQUIRED`.
  - If mandatory MFA is required and unfulfilled, issue MFA challenge session (`auth:mfa-challenge:{challengeId}`, TTL 5m) and return `MFA_REQUIRED`.
  - Otherwise, issue active HRMS session (`auth:session:{sessionId}`, sliding TTL 15m / max 30d) and return active session tokens.
- **FR-008**: System MUST transactionally record sanitized security audit events (`authentication.sso-login-succeeded` or `authentication.sso-login-failed`) in the outbox table.
- **FR-009**: System MUST return generic error messages on authentication failures (`"Authentication failed via Single Sign-On. Please try again or contact your administrator."`) to prevent user enumeration.

### Key Entities *(include if feature involves data)*

- **ExternalIdentity**: Represents federated identity mapping between external IdP subject (`provider_subject`), provider name (`firebase`), `tenant_code`, and internal `user_id`.
- **UserSecuritySummary**: Represents consolidated user account status, security version, credential presence, and MFA enrollment state.
- **SessionStore**: Redis-backed session data representing active sessions (`auth:session`), SSO password setup sessions (`auth:sso-setup`), or MFA challenge sessions (`auth:mfa-challenge`).
- **SecurityEventsOutbox**: Transactional outbox table storing sanitized security event payloads before asynchronous dispatch to event streams.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Valid SSO authentication requests issue appropriate session tokens in under 500ms (excluding external IdP network latency).
- **SC-002**: 100% of identity mismatch, unmapped identity, locked account, and IP restriction violations are blocked and audited.
- **SC-003**: Zero raw ID tokens or credentials leak into logs or persistent outbox entries.
- **SC-004**: Circuit breaker successfully isolates external Firebase SDK timeouts within 5000ms and returns standard fallback response.

## Assumptions

- Firebase Client SDK handles initial user authentication on the client side and provides a valid RS256 ID Token to the API request.
- Tenant configuration (including IP allow-lists and mandatory MFA rules) is cached or fast-retrievable per request context.
- Database schema `external_identities` includes composite unique constraint `(tenant_code, provider, provider_subject)`.

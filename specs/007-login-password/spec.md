# Feature Specification: Log In With Email and Password

**Feature Branch**: `007-login-password`

**Created**: 2026-07-31

**Status**: Draft

**Input**: User description: "US-014 — Log In With Email and Password"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Log In with Email and Password (No MFA) (Priority: P1)

As an employee, I want to log in using my email and password so that I can establish an active session and access the HRMS platform.

**Why this priority**: Core authentication path for all password-authenticated users.

**Independent Test**: Authenticate with active tenant, valid email, and correct password where MFA is not required or enrolled, verifying a successful session is created and tokens are returned.

**Acceptance Scenarios**:

1. **Given** a user has status `ACTIVE`, password credential status `active`, and no MFA required or enrolled, **When** they submit valid email and password via POST request from an allowed IP, **Then** the system logs them in, returns JWT access and refresh tokens, and registers the session in Redis.

---

### User Story 2 - Log In with MFA Challenge (Priority: P2)

As an employee with MFA enrolled or required, I want the system to prompt me for an MFA challenge when I log in with valid credentials, so that my account remains secure.

**Why this priority**: Crucial security layer for accounts requiring multi-factor verification.

**Independent Test**: Authenticate with valid email and password for a user requiring MFA, verifying that a temporary challenge ID is returned instead of full access tokens.

**Acceptance Scenarios**:

1. **Given** a user has status `ACTIVE`, valid credentials, and MFA is required or enrolled, **When** they submit valid email and password via POST request from an allowed IP, **Then** the system returns an MFA challenge ID and status `MFA_REQUIRED`, and stores the challenge in Redis.

---

### User Story 3 - Security Enforcement & Account Lockout (Priority: P3)

As the system, I want to block invalid login attempts, lock accounts after too many failed attempts, and restrict logins from unauthorized IPs, so that the platform is protected from brute-force and network-level attacks.

**Why this priority**: Essential security guardrail to prevent unauthorized access and brute force.

**Independent Test**: Verify that incorrect password attempts increment failure counters and lock the user account after reaching the threshold. Verify that disallowed IPs are rejected immediately.

**Acceptance Scenarios**:

1. **Given** a user is active, **When** they attempt to login with incorrect credentials, **Then** the system returns a generic 401 error, increments the failure counter in Redis, and records a failed login security event.
2. **Given** a user has a failure count at $N-1$ lockout threshold, **When** they attempt to login with incorrect credentials, **Then** the account is locked in PostgreSQL, the request returns a generic 401 error, and an account-locked security event is recorded.
3. **Given** a user requests login from a restricted IP range, **When** they submit credentials, **Then** access is denied with a generic error before checking passwords, and a security event is recorded.

---

### Edge Cases

- **IP Restriction Bypass**: What happens if an IP is not allowed but credentials are valid? (The system rejects the attempt with a 401 before password check, preventing info leakage).
- **Non-existent Email/Disabled User**: How does the system prevent account enumeration? (Returns identical generic 401 Unauthorized for invalid email, disabled user, wrong password, or locked account).
- **Concurrent Lockout Requests**: How does the system handle concurrent invalid login requests at the lockout boundary? (Enforces row-level lock `SELECT ... FOR UPDATE` on the user row, guaranteeing that the lockout status updates atomically and exactly once).
- **Redis Cache Offline**: What happens if the Redis store is down? (The system fails closed, returning HTTP 503 and preventing login since session state cannot be established).

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST authenticate users by validating email and password credentials scoped by tenant.
- **FR-002**: System MUST check IP restrictions against the tenant settings before evaluating user credentials.
- **FR-003**: System MUST enforce account lockout by transitioning `users.status` to `'LOCKED'` when consecutive login failures exceed the tenant threshold.
- **FR-004**: System MUST check if multi-factor authentication (MFA) is required or enrolled, branching to MFA challenge session if true.
- **FR-005**: System MUST prevent account enumeration by returning a generic `401 Unauthorized` response with a unified error message for all credential, status, IP, or lockout-related authentication failures.
- **FR-006**: System MUST record successful logins, failed logins, and lockout events to `auth_security_events_outbox` inside the database transaction, strictly sanitizing sensitive details (such as raw passwords/hashes).
- **FR-007**: System MUST track failure counts using atomic Redis increments with rolling TTLs.

### Key Entities *(include if feature involves data)*

- **Tenant**: Represents the organizational tenant context.
- **User**: Represents the user account, including status and security version.
- **Credential**: Holds the password hash and hashing algorithm.
- **Authentication Settings**: Holds lockout and IP restriction configuration rules.
- **MFA Method**: Represents enrolled multi-factor authentication methods.
- **OutboxEvent**: Sanitized record of security audit events.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Successful logins (without MFA) issue valid JWT access and refresh tokens.
- **SC-002**: Lockout triggers atomically and immediately when the failure threshold is exceeded.
- **SC-003**: Access from unauthorized IPs is blocked at the perimeter.
- **SC-004**: Raw credentials are never leaked in log files, audit records, or network payloads.

---

## Assumptions

- A user's email address is normalized (lowercase, trimmed) prior to querying the database.
- Standard JWT verification is used.
- Password hashes are stored using Argon2id.
- IP restrictions use standard CIDR format mapping.

---

## Appendix: Technical Implementation Reference

### In-Scope Backend Behavior

- **REST API Endpoint**: Implement `POST /auth/login/password` receiving credentials and request context.
- **IP Restriction Policy**: Enforce trusted IP validation based on tenant configurations.
- **Password Verification**: Lookup user, fetch active credential, evaluate password strength policy, and verify using Argon2id.
- **Lockout Enforcement**: Atomic failure counter increments in Redis, transition user status to locked in DB under row-level lock if threshold is exceeded.
- **Session Dispatch**: Generate full Redis-backed session if MFA is clear; generate challenge session in Redis if MFA is required or enrolled.
- **Outbox Event Dispatch**: Append audit events inside transaction, sanitizing passwords/hashes.

### Sequence Flow Diagram

```text
PasswordController (POST /auth/login/password)
→ AuthenticationApplicationService.loginWithPassword(command)
  → TenantRepositoryAdapter.findByCode(tenantCode)
  → IpRestrictionPolicy.evaluate(trustedIp, tenantSettings)
  → UserRepositoryAdapter.findByNormalizedEmail(tenantCode, normalizedEmail)
  → CredentialDomainPolicy.verifyPassword(plaintextPassword, credentialHash)
  → LockoutDomainPolicy.evaluateFailureThreshold(tenantCode, userId)
  → SessionApplicationService.createSession(...) / createMfaChallenge(...)
→ SecurityEventService.append(sanitizedAuditInput, queryRunner)
→ PostgreSQL Transaction Commit
→ Outbox Relay Worker (OutboxModule)
→ Kafka Event Publisher (@hros/libs-events)
```

### Detailed Sequence Call Map

1. **`PasswordController.login(dto)`**
   - *Input*: `LoginWithPasswordDto { tenantCode, email, password, rememberMe }`, `RequestContext` (contains trusted `sourceIp`).
   - *Output*: `LoginResponseDto` (HTTP 200) or HTTP Error (401/403/429/503).

2. **`AuthenticationApplicationService.loginWithPassword(command)`**
   - *Input*: `LoginWithPasswordCommand`.
   - *Calls*:
     1. `AuthenticationSettingsRepository.findByTenant(tenantCode)`
     2. `IpRestrictionAdapter.evaluate(sourceIp, tenantSettings)`
     3. `UserRepository.findByNormalizedEmail(tenantCode, lowerTrim(email))`
     4. `LockoutAdapter.checkLockout(tenantCode, userId)`
     5. `Argon2CryptoAdapter.verify(password, credential.password_hash)`
     6. `SessionApplicationService.issueSession(...)`
     7. `SecurityEventService.append(...)`
   - *Output*: Session DTO / Tokens / MFA Challenge DTO.

---

### Data and Transaction

- **Tables Read**:
  - `tenants` (validate active tenant) 
  - `users` (`id`, `status`, `security_version`, `user_type`) 
  - `credentials` (`password_hash`, `algorithm`, `status`) 
  - `authentication_settings` (`lockout_enabled`, `lockout_threshold`, `ip_restriction_enabled`, `allowed_ip_ranges`, `mandatory_mfa_enabled`) 
  - `mfa_methods` (check for active factors) 

- **Tables Written**:
  - `auth_security_events_outbox` (INSERT sanitized event within domain transaction) 
  - `users` (UPDATE `status = 'LOCKED'` if lockout threshold exceeded) 

- **Redis Keys**:
  - `auth:session:{sessionId}` (Hash, TTL: 15m sliding / 30d absolute cap for rememberMe) 
  - `auth:user-sessions:{tenantCode}:{userId}` (Set of sessionIds) 
  - `auth:mfa-challenge:{challengeId}` (Hash, TTL: 5 min) 
  - `auth:login-failure:{tenantCode}:{userId}` (String counter, TTL: 15 min rolling) 

- **Transaction Boundary**:
  - Authentication reads occur in `READ COMMITTED` isolation.
  - If login succeeds or fails with an audit requirement, a PostgreSQL transaction opens exclusively to insert into `auth_security_events_outbox` (and update user lockout status if triggered).
  - Redis updates execute *after* or *alongside* standard flow; Redis failure throws `503 AuthStoreUnavailableError` (fails closed).

- **Idempotency & Concurrency Control**:
  - Redis login failure counter increments use atomic Lua script `INCR` + conditional `EXPIRE`.
  - Lockout state transition uses `SELECT ... FOR UPDATE` on target `users` row to avoid concurrent login race conditions locking/unlocking simultaneously.

---

### Events

#### Event 1: `authentication.login-succeeded`
```text
eventType: authentication.login-succeeded
eventVersion: 1.0.0
topic: authentication.login-events
producer: hros-access-service
consumer: hros-notification-service, audit-service
partitionKey: {tenantCode}:{userId}
payload:
{
  "tenantCode": "TENANT_123",
  "userId": "usr_abc123",
  "sessionId": "sess_999xxx",
  "authenticationMethod": "PASSWORD",
  "rememberMe": false,
  "ipAddress": "192.168.1.50",
  "userAgent": "Mozilla/5.0..."
}
```

#### Event 2: `authentication.login-failed`
```text
eventType: authentication.login-failed
eventVersion: 1.0.0
topic: authentication.login-events
producer: hros-access-service
consumer: audit-service, security-monitoring-service
partitionKey: {tenantCode}
payload:
{
  "tenantCode": "TENANT_123",
  "userId": "usr_abc123", // null if non-existent user
  "attemptedEmail": "masked_user@domain.com",
  "failureReason": "INVALID_CREDENTIALS",
  "authenticationMethod": "PASSWORD",
  "ipAddress": "192.168.1.50",
  "userAgent": "Mozilla/5.0..."
}
```

---

### Error Handling

| Condition | Error Code | HTTP Status | Retryable | Audit Reason |
| --- | --- | --- | --- | --- |
| Invalid email or password | `AUTH_INVALID_CREDENTIALS` | 401 | No | `INVALID_CREDENTIALS` |
| User account is suspended/disabled | `AUTH_ACCOUNT_DISABLED` | 401 | No | `ACCOUNT_DISABLED` |
| User account is locked | `AUTH_ACCOUNT_LOCKED` | 401 | No | `ACCOUNT_LOCKED` |
| IP not in allowed ranges | `AUTH_IP_RESTRICTED` | 401 | No | `IP_RESTRICTION_DENIED` |
| Redis infrastructure down | `AUTH_SESSION_STORE_UNAVAILABLE` | 503 | Yes | `REDIS_UNAVAILABLE` |
| Too many attempts (Rate Limit) | `AUTH_RATE_LIMIT_EXCEEDED` | 429 | Yes | `RATE_LIMIT_EXCEEDED` |

*Note: All 401 response payloads returned to the external client expose a generic message: `"Invalid email or password."` to prevent account enumeration.*

---

### Backend Tasks

#### BE-030 — DTO & Presentation Controller for Password Login
- **Goal**: Define input/output DTOs with Validation decorators and implement `PasswordController` endpoint `POST /auth/login/password`.
- **Files**:
  - `src/modules/authentication/presentation/dto/login-with-password.dto.ts`
  - `src/modules/authentication/presentation/authentication.controller.ts`
- **Dependencies**: None.
- **Acceptance Criteria**: Request validation rejects invalid email structures with HTTP 400.
- **Tests**: Unit tests for controller delegation and DTO validation.
- **Definition of Done**: Endpoint mapped, request context extracted, 100% unit test coverage.

#### BE-031 — Application Service & Domain Execution for Password Verification
- **Goal**: Implement core password verification, credential policy check, Argon2id verification, and session branching.
- **Files**:
  - `src/modules/authentication/application/authentication-application.service.ts`
  - `src/modules/credential/domain/credential-policy.domain.ts`
  - `src/modules/credential/infrastructure/adapters/argon2-crypto.adapter.ts`
- **Dependencies**: BE-030
- **Acceptance Criteria**: Verify user credentials without leaking existence of invalid emails.
- **Tests**: Unit tests for application service and Argon2 adapter logic.
- **Definition of Done**: Application service handles password checking and returns proper session tokens or MFA challenge IDs.

#### BE-032 — Lockout & IP Restriction Integration
- **Goal**: Integrate `LockoutModule` counter evaluation and `IpRestrictionModule` allow-list checks during login execution.
- **Files**:
  - `src/modules/lockout/application/lockout.service.ts`
  - `src/modules/ip-restriction/application/ip-restriction.service.ts`
- **Dependencies**: BE-031
- **Acceptance Criteria**: Lockout triggered after $N$ failed attempts; IP violations do not lock account under normal lockout counter.
- **Tests**: Integration tests with Redis counters and DB status lock updates.
- **Definition of Done**: Lockout and IP checks correctly block unauthorized attempts and update failure counters.

#### BE-033 — Security Event Outbox Logging for Password Login
- **Goal**: Write sanitized outbox records for `authentication.login-succeeded` and `authentication.login-failed`.
- **Files**:
  - `src/modules/security-event/application/security-event.service.ts`
  - `src/modules/authentication/application/authentication-application.service.ts`
- **Dependencies**: BE-032
- **Acceptance Criteria**: Outbox record created atomically with database state changes.
- **Tests**: Unit test verifying outbox JSON payload sanitization.
- **Definition of Done**: Events written to `auth_security_events_outbox` without secret exposure.

---

### Testing Matrix

| Test ID | Test Type | Given | When | Expected Result | Expected Event |
| --- | --- | --- | --- | --- | --- |
| TC-LOG-01 | E2E | Active user, valid password, no MFA | Call `POST /auth/login/password` | HTTP 200, JWT access token + refresh cookie | `authentication.login-succeeded` |
| TC-LOG-02 | E2E | Active user, valid password, mandatory MFA enabled | Call `POST /auth/login/password` | HTTP 200, `authState: 'MFA_REQUIRED'`, `challengeId` returned | `authentication.login-succeeded` (pending MFA) |
| TC-LOG-03 | Integration | User exists, invalid password provided | Call `POST /auth/login/password` | HTTP 401 Unauthorized, generic error message | `authentication.login-failed` |
| TC-LOG-04 | Concurrency | User has failure count at $N-1$ threshold | Send 2 simultaneous wrong-password requests | Exactly 1 request locks account (`users.status = 'LOCKED'`), both return HTTP 401 | `authentication.account-locked` |
| TC-LOG-05 | Unit | Raw password passed to `SecurityEventService` | Call `append()` for login event | Outbox JSON payload contains no plaintext password or hash | N/A |

---

### Traceability Matrix

| Acceptance Criterion | Backend Task | Function / Module | Event Type | Test IDs |
| --- | --- | --- | --- | --- |
| Log In With Email and Password (US-014 Scenario 1) | BE-030, BE-031 | `AuthenticationApplicationService.loginWithPassword` | `authentication.login-succeeded` | TC-LOG-01 |
| Mandatory MFA Challenge Gate (US-014 Scenario 2) | BE-031 | `SessionApplicationService.createMfaChallenge` | N/A | TC-LOG-02 |
| Account Enumeration Prevention (US-014 Scenario 3) | BE-030, BE-032 | `AuthenticationApplicationService.loginWithPassword` | `authentication.login-failed` | TC-LOG-03 |
| Account Lockout on Consecutive Failures | BE-032, BE-033 | `LockoutService.evaluateFailureThreshold` | `authentication.account-locked` | TC-LOG-04 |
| Secret Exposure Prevention & Audit Sanitization | BE-033 | `SecurityEventService.append` | N/A | TC-LOG-05 |

---

### Gaps

- **GAP-01**: `IMPLEMENTATION_DETAIL` — Need explicit separation of Redis key structures for credential failure counters (`auth:login-failure:{tenantCode}:{userId}`) versus network IP failure counters (`auth:ip-failure:{tenantCode}:{userId}`) to enforce independent weighting rules per PRD US-032.
  - *Recommendation*: Standardize Redis key namespaces and TTLs in `SessionModule` config to 15-minute rolling windows.

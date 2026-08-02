# Feature Specification: Forgot Password Workflow

**Feature Branch**: `010-forgot-password`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "Password Reset Workflow (Self-Service & Admin-Initiated)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Self-Service Password Reset (Priority: P1)

As an active end user, I want to initiate a self-service password reset request via my email address, verify a secure verification code, and update my password so that I can regain access to my account safely without administrator intervention.

**Why this priority**: Self-service recovery is the primary, highest-frequency user flow for credential recovery. Delivering this allows users to independently regain access to their accounts.

**Independent Test**: Can be tested end-to-end by submitting a self-service reset request for an active email address, verifying the generated 6-digit code, and confirming a new password, ensuring the user can log in with the new password and older sessions are terminated.

**Acceptance Scenarios**:

1. **Given** an active user account with a valid email address and tenant self-service reset enabled, **When** the user submits a self-service password reset request, **Then** a 15-minute challenge is created in the session store, a non-secret reset requested event is queued to the outbox, and a generic success response is returned.
2. **Given** a valid reset challenge ID and matching 6-digit OTP code within 15 minutes, **When** the user submits the verification request, **Then** the challenge state is updated to verified and a short-lived proof token is issued.
3. **Given** a verified reset challenge ID and valid proof token, **When** the user submits a new compliant password, **Then** the credential status is updated to active, the user security version is incremented, all existing user sessions are invalidated, a reset completed event is queued to outbox, and the challenge is removed.

---

### User Story 2 - Administrator-Initiated Password Reset (Priority: P2)

As a tenant administrator, I want to initiate a password reset on behalf of a managed user so that account owners who cannot access self-service recovery can safely reset their credentials.

**Why this priority**: Essential administrative capability for managing user accounts when self-service recovery is unavailable or when support intervention is required.

**Independent Test**: Can be tested independently by having an authenticated administrator submit a reset request for a target user ID, verifying that the reset requested event is dispatched for the target user while keeping credentials untouched until the user completes verification.

**Acceptance Scenarios**:

1. **Given** an administrator holding `user:security:manage` permission, **When** the admin submits a reset request for a target user ID, **Then** a reset challenge and outbox event are created for the user, returning a success response without exposing any secrets to the administrator.
2. **Given** an admin-initiated reset request has been sent to the target user, **When** the account owner verifies the code and submits a new password, **Then** the user's password is updated and existing sessions are revoked globally.

---

### User Story 3 - Tenant Policy Enforcement for Password Reset (Priority: P3)

As a tenant security administrator, I want tenant-level authentication settings to control whether self-service password reset is permitted, so that organization security policies are strictly enforced.

**Why this priority**: Required for multi-tenant isolation and security compliance where specific organizations forbid self-service credential recovery.

**Independent Test**: Can be tested by setting tenant `allow_self_service_password_reset = false` and attempting a self-service reset request, verifying that the attempt is blocked while admin-initiated resets remain operational.

**Acceptance Scenarios**:

1. **Given** a tenant configuration with `allow_self_service_password_reset = false`, **When** a user submits a self-service password reset request, **Then** the system rejects the request with tenant self-service disabled guidance.

---

### Edge Cases

- **Non-existent or Inactive User Email**: When a request is made for an unregistered or inactive email address, the system MUST execute dummy cryptographic calculations to prevent timing attacks and return a generic success message without sending email events or leaking user existence.
- **Verification Code Attempt Limit Exceeded**: When a user enters an incorrect 6-digit code 3 consecutive times, the system MUST lock out further verification attempts for that challenge ID and emit a security audit event.
- **Challenge Expiration**: When a user attempts to verify a code or confirm a password after the 15-minute TTL has elapsed, the request MUST be rejected with a challenge expired response.
- **Concurrent Password Reset Confirmation**: When two requests attempt to confirm a reset for the same user concurrently, database row-level locking (`FOR UPDATE`) and security version checks MUST ensure exactly one request succeeds and outbox/audit events are generated once.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a self-service password reset request capability requiring valid tenant code and user email.
- **FR-002**: System MUST evaluate tenant authentication settings (`allow_self_service_password_reset`) before processing self-service requests.
- **FR-003**: System MUST execute timing-attack countermeasure dummy hashing whenever a non-existent or inactive user account is queried during password reset request.
- **FR-004**: System MUST support administrator-initiated password resets for specified user IDs, restricted to actors with `user:security:manage` permission.
- **FR-005**: System MUST generate cryptographically secure 6-digit OTP verification codes hashed using HMAC-SHA256, bound to a unique challenge ID with a 15-minute (900s) TTL.
- **FR-006**: System MUST enforce a maximum of 3 code verification attempts per challenge ID before locking out the challenge.
- **FR-007**: System MUST verify submitted OTP codes and issue short-lived proof tokens upon successful verification.
- **FR-008**: System MUST update user credentials using Argon2id password hashing inside a database transaction during password confirmation.
- **FR-009**: System MUST increment the user `security_version` and invalidate all active Redis user sessions upon successful password reset.
- **FR-010**: System MUST record outbox event records (`authentication.password-reset-requested` and `authentication.password-reset-completed`) within the same database transaction as credential changes.
- **FR-011**: System MUST include bounded retry fields (`attempt_count` and `last_attempted_at`) in the security events outbox table to support outbox relay retries.

### Key Entities

- **Reset Challenge**: Short-lived verification state stored in cache containing tenant code, user ID, HMAC-SHA256 hashed OTP code, verification status, proof token, attempt count, and TTL.
- **User Credential**: Persistence entity storing Argon2id password hash, status (`active` / `superseded`), and versioning.
- **Security Event Outbox**: Transactional outbox table storing event type, topic, partition key, payload, status, attempt count, and last attempted timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of password reset state modifications (credential update, security version bump, outbox insertion) execute within a single atomic database transaction.
- **SC-002**: Zero user account enumeration leakage on password reset request endpoints (constant response shape and execution timing guarantees).
- **SC-003**: 100% of active sessions and refresh token families associated with a user are invalidated immediately upon password confirmation.
- **SC-004**: Code verification attempts are strictly rate-limited and locked out after 3 consecutive failures.

## Assumptions

- Network IP restrictions do not apply to forgot-password request and code verification endpoints to permit off-network recovery.
- Email rendering and delivery mechanics are handled asynchronously by external notification services via published Kafka outbox events.
- Password complexity validation policies are governed by application-level validation rules during confirmation.

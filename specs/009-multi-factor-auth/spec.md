# Feature Specification: Multi-Factor Authentication (MFA)

**Feature Branch**: `009-multi-factor-auth`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: Multi-Factor Authentication (MFA) enrollment, login challenge, mandatory MFA enforcement, and administrator reset capability.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enroll in a Second Factor (Priority: P1)

As an authenticated user (or user in setup state), I want to enroll and verify a second authentication factor (TOTP or Email OTP) so that my account security is enhanced.

**Why this priority**: Core foundation for MFA capability; users cannot complete MFA challenges without enrolling a factor first.

**Independent Test**: Can be tested by initiating factor enrollment, receiving/generating the verification code, submitting the code, and verifying the factor becomes active.

**Acceptance Scenarios**:

1. **Given** an active user with valid primary credentials, **When** they initiate TOTP or Email factor enrollment and provide a valid verification code, **Then** the MFA factor is activated and an `authentication.mfa-enrolled` event is produced.
2. **Given** a user initiating enrollment, **When** they submit an incorrect or expired verification code, **Then** enrollment fails, the factor remains inactive, and an audit failure is logged.
3. **Given** a user who already has an active primary MFA factor, **When** they attempt to enroll another primary MFA factor, **Then** the request is rejected with a conflict error.

---

### User Story 2 - Complete a Second-Factor Challenge at Login (Priority: P1)

As a user logging in whose account requires MFA, I want to complete a second-factor challenge so that I can obtain full access to HRMS.

**Why this priority**: Critical path for users with active MFA to log in successfully and access protected resources.

**Independent Test**: Can be tested by performing primary login for an MFA-enabled user, obtaining a restricted challenge session, submitting a valid MFA code, and receiving full access tokens.

**Acceptance Scenarios**:

1. **Given** a user with active MFA who completes primary authentication, **When** they submit a valid challenge OTP code within 5 minutes, **Then** full access tokens are issued and a successful login event is recorded.
2. **Given** a user in an active MFA login challenge, **When** they exceed the maximum allowed verification attempts (e.g. 5 failed attempts), **Then** the challenge is locked and rejected with a rate limit error.
3. **Given** a user in an active MFA challenge, **When** the challenge TTL (5 minutes) expires before completion, **Then** the challenge code becomes invalid and requires initiating a new login.

---

### User Story 3 - Mandatory MFA Blocks Full Access Until Enrolled (Priority: P2)

As a user belonging to a tenant where mandatory MFA is enforced, I want to be gated into an MFA setup workflow during login so that I cannot access HRMS until I enroll an MFA factor.

**Why this priority**: Essential for tenant-wide security policy enforcement.

**Independent Test**: Can be tested by setting tenant policy to mandatory MFA, logging in as an un-enrolled user, and asserting that only restricted MFA setup access is granted until enrollment completes.

**Acceptance Scenarios**:

1. **Given** a tenant with mandatory MFA enabled and a user without active MFA, **When** the user logs in with valid primary credentials, **Then** full access is blocked and a restricted setup session (`mfaRequired: true`) is returned.
2. **Given** a user gated in mandatory setup state, **When** they successfully complete factor enrollment, **Then** they transition to fully authenticated status.

---

### User Story 4 - Administrator Resets a User's MFA (Priority: P2)

As a tenant administrator, I want to reset a user's MFA factors and revoke their active sessions so that an account can be recovered safely if the user loses access to their second factor.

**Why this priority**: Crucial operational administrative capability for account recovery and incident response.

**Independent Test**: Can be tested by invoking admin reset for a target user, verifying MFA factors are disabled, checking that active sessions are revoked, and confirming an `authentication.mfa-reset` event is produced.

**Acceptance Scenarios**:

1. **Given** an admin user within the target tenant, **When** they issue a reset request for a target user's MFA, **Then** all MFA factors for that user are disabled/soft-deleted, `security_version` is incremented, and an `authentication.mfa-reset` event is queued in the outbox.
2. **Given** an admin reset execution, **When** the operation completes, **Then** all active sessions for the target user in Redis are revoked immediately.
3. **Given** an admin attempting to reset MFA for a target user in another tenant, **When** the request is submitted, **Then** access is denied with a not found / unauthorized response.
4. **Given** a target user whose MFA was reset while tenant mandatory MFA is active, **When** the target user next logs in, **Then** they are forced back into the mandatory MFA setup workflow.

---

### Edge Cases

- What happens when Redis is unavailable during MFA challenge verification? System fails closed with a 503 Service Unavailable error (`AUTH_STORE_UNAVAILABLE`).
- How does the system handle concurrent enrollment requests for the same user? Partial unique constraints prevent creating duplicate active primary factors, returning a 409 conflict for the second request.
- What happens if the outbox relay fails to publish an MFA event immediately? The event remains safely in `auth_security_events_outbox` with retry tracking (`attempt_count` / `last_attempted_at`) until picked up by the outbox relay worker.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support enrolling and activating second-factor methods (TOTP and Email OTP).
- **FR-002**: System MUST securely encrypt stored TOTP secrets using envelope encryption (KMS DEK/KEK) before persistence.
- **FR-003**: System MUST enforce a maximum of 1 active primary MFA factor per user using database partial unique constraints.
- **FR-004**: System MUST issue restricted access sessions (`mfaRequired` or `ssoSetupPending`) when primary authentication succeeds but MFA setup or verification is pending.
- **FR-005**: System MUST block access to protected HRMS resources until MFA challenge or mandatory enrollment is fully completed.
- **FR-006**: System MUST manage short-lived login challenges (5-minute TTL) with rate-limiting and attempt counters stored in Redis.
- **FR-007**: System MUST allow tenant administrators to reset MFA factors for users within their tenant boundary.
- **FR-008**: System MUST atomically invalidate all active user sessions (Redis key deletion and PostgreSQL `security_version` increment) upon MFA reset.
- **FR-009**: System MUST record outbox audit events (`authentication.mfa-enrolled` and `authentication.mfa-reset`) transactionally alongside state changes.
- **FR-010**: System MUST track retry metadata (`attempt_count`, `last_attempted_at`) in the security events outbox table to support resilient relay execution.

### Key Entities

- **MFA Factor (`mfa_methods`)**: Represents registered user authentication factors (type, status, encrypted secret, primary flag, enrollment timestamp).
- **MFA Login Challenge**: Temporary Redis-backed state tracking pending verification codes, remaining attempt counters, and challenge expiration.
- **Security Event Outbox (`auth_security_events_outbox`)**: Transactional outbox table storing domain events for asynchronous relay to Kafka (`authentication.mfa-enrolled`, `authentication.mfa-reset`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of persisted MFA TOTP secrets are encrypted via envelope encryption prior to DB write.
- **SC-002**: Second-factor login challenge verification completes within under 200 milliseconds under normal load.
- **SC-003**: 100% of active user sessions are invalidated immediately upon administrator MFA reset execution.
- **SC-004**: Zero unauthorized access allowed to protected HRMS endpoints while in a restricted MFA-pending session state.

## Assumptions

- Email notification dispatch for Email OTP verification codes is delegated asynchronously via Kafka events to `hros-notification-service`.
- Hardware security keys (WebAuthn / Passkeys / FIDO2) and UI graphics rendering (QR codes) are out of scope for the auth backend service.
- Outbox schema update (`attempt_count`, `last_attempted_at`) will be applied via database migration.
- Admin MFA reset on a user in a tenant with mandatory MFA policy forces the user into mandatory MFA setup on their very next login attempt.

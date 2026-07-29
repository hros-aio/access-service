# Feature Specification: Invitation & First-Time Access Setup

**Feature Branch**: `005-invitation-setup`

**Created**: 2026-07-29

**Status**: Draft

**Input**: User description: 
```markdown
## 1. Implementation Scope (Story Summary)

* **User Story ID**: US-008, US-009, US-010, US-011
* **Feature Name**: Invitation & First-Time Access Setup
* **Business Objective**: Allow new employees to receive invitation links, validate them, and securely set their initial passwords; allow Administrators to resend invitation links when lost or expired without breaking email changes or generating duplicate credentials.
* **In-Scope Backend Behavior**:
1. Validate invitation token (`validateInvitation`).
2. Accept invitation and initialize password (`acceptInvitation`).
3. Admin resends invitation to an employee who has not set a password yet (`resendInvitation`).
4. Securely handle invalid invitation states (expired, already used, revoked, invalid token).
5. Ensure email changes (`employee.updated`) do not break or invalidate a `PENDING` invitation link.


* **Out-of-Scope Behavior**:
* Sending emails directly via SMTP/Third-party (handled asynchronously by `hros-notification-service` via Kafka events).
* User interface, UI routes, and styling.
* Detailed role-based access control (RBAC) beyond authentication handoff scope.


* **Preconditions**:
* User account is created for the employee with status `INVITED` or `PROVISIONING_PENDING`.
* Admin triggering the resend must hold the `access.user.resend-invitation` permission under the same Tenant.


* **Postconditions**:
* User accepting the invitation shifts status to `ACTIVE`, and a credential record is initialized.
* Any previous restricted session tokens are revoked.
* An `authentication.invitation-accepted` or `authentication.invitation-resent` event is persisted to the transactional outbox.


* **Unresolved Questions / Gaps**: Whether invitation history requires a dedicated `invitation_history` table (see Section 9 - Gap Analysis).
```

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Validate and Accept Invitation (Priority: P1)

As a new employee, I want to use my invitation link to validate my token and securely set my initial password so that I can activate my account and log in.

**Why this priority**: Core onboarding path. Without this, new employees cannot gain access to the system.

**Independent Test**: A new user with an active `PENDING` invitation validates their token and accepts the invitation. Verify user status changes to `ACTIVE` and credentials are created.

**Acceptance Scenarios**:

1. **Given** a user has status `INVITED` and a valid `PENDING` invitation token, **When** they call `/invitations/validate` with the token, **Then** the token is confirmed valid.
2. **Given** a user has status `INVITED` and a valid `PENDING` invitation token, **When** they call `/invitations/accept` with a valid password, **Then** their status changes to `ACTIVE`, the credential is created, and the invitation is marked as accepted.

---

### User Story 2 - Admin Resend Invitation (Priority: P2)

As an Administrator, I want to resend invitation links to employees who have not set a password yet, so that they can onboard if their link was lost or expired.

**Why this priority**: Essential fallback path when onboarding emails are lost or expired.

**Independent Test**: An Administrator triggers a resend for a user who has not set a password yet. Verify that the previous invitation is marked as revoked, a new one is created, and the resend event is published.

**Acceptance Scenarios**:

1. **Given** a user is `INVITED` and has a `PENDING` invitation, **When** an Admin resends the invitation, **Then** the old invitation is revoked, a new pending invitation with a new token is created, and an event is emitted.

---

### User Story 3 - Handle Invalid and Expired States (Priority: P2)

As the system, I want to securely reject invalid, expired, revoked, or already-used invitation tokens to prevent unauthorized access.

**Why this priority**: Essential for security to prevent token reuse or activation of unauthorized accounts.

**Independent Test**: Try to validate or accept an invitation with an expired (>24h), revoked, or non-existent token, and verify the system returns an error.

**Acceptance Scenarios**:

1. **Given** an invitation token is expired or already used, **When** validating or accepting, **Then** the system throws `AUTH_INVITATION_INVALID` and rejects the action.

---

### User Story 4 - E-mail Change Resilience (Priority: P3)

As a user whose email gets updated before setup, my pending invitation must still work, so that I can complete my setup.

**Why this priority**: Minor edge case, ensures administrative corrections to email addresses do not break onboarding links.

**Independent Test**: Change user's email while in `INVITED` status, verify the invitation remains `PENDING` and valid.

**Acceptance Scenarios**:

1. **Given** a user has a `PENDING` invitation, **When** their email is updated via `employee.updated` event or admin action, **Then** their invitation remains valid and can still be accepted.

---

### Edge Cases

- What happens when an Admin resends an invitation to an already active employee? The system MUST return a 409 `INVITATION_NOT_ALLOWED` error.
- How does the system handle parallel resend requests for the same user? Database row-level locking on `users` and a partial unique index on `invitations` MUST prevent concurrent duplicates, resulting in exactly one active `PENDING` invitation.
- What happens if the Redis connection fails during session/challenge revocation? The system MUST throw `503 AuthStoreUnavailableError` and must not proceed with accepting the invitation.
- What happens if an Admin from Tenant A tries to resend an invitation to an employee of Tenant B? The system MUST return `404 RESOURCE_NOT_FOUND` / `CROSS_TENANT_ACCESS_DENIED`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST validate invitation token hash by checking `tenant_code` and `token_hash` in the database.
- **FR-002**: System MUST allow setting password using Argon2id hashing when accepting invitation.
- **FR-003**: System MUST update user status to `ACTIVE` and increment `security_version` upon successful invitation acceptance.
- **FR-004**: System MUST revoke all restricted sessions in Redis for the user upon invitation acceptance.
- **FR-005**: System MUST allow an Admin with `access.user.resend-invitation` permission to resend the invitation.
- **FR-006**: System MUST revoke any existing `PENDING` invitation for the user before issuing a new one during a resend.
- **FR-007**: System MUST persist outbox events (`authentication.invitation-accepted`, `authentication.invitation-resent`) transactionally to `auth_security_events_outbox`.
- **FR-008**: Outbox event payloads MUST NOT leak sensitive secrets (e.g. `rawToken`, password hashes).
- **FR-009**: System MUST enforce database row-level locking (`SELECT ... FOR UPDATE` on `users`) on resend and accept.
- **FR-010**: System MUST enforce single pending invitation per user per tenant using partial unique index `uq_invitations_one_pending_per_user`.
- **FR-011**: System MUST NOT use a dedicated `invitation_history` table. All historical audit trails for resends and invitation attempts MUST be logged via transactional outbox security events, while the `invitations` table maintains only the latest token status in-place.

### Key Entities

- **User**: Represents the employee account. Attributes: `id`, `tenant_code`, `status` (`INVITED`, `ACTIVE`, `PROVISIONING_PENDING`), `security_version`, `updated_at`.
- **Invitation**: Represents the onboarding link record. Attributes: `id`, `tenant_code`, `user_id`, `status` (`PENDING`, `ACCEPTED`, `REVOKED`), `token_hash`, `version`, `expires_at`, `created_at`.
- **Credential**: Represents the secure login secret. Attributes: `id`, `tenant_code`, `user_id`, `password_hash`, `algorithm` (`argon2id`), `status` (`ACTIVE`).
- **SecurityEventOutbox**: Transactional event record. Attributes: `id`, `tenant_code`, `user_id`, `event_type`, `event_version`, `sanitized_payload`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete invitation validation and password setup in under 3 minutes.
- **SC-002**: 99.9% of valid invitation acceptances complete within 500ms (database updates, credential creation, outbox write).
- **SC-003**: Under concurrent resend requests, 100% of cases result in exactly one active `PENDING` invitation without duplicate credentials.
- **SC-004**: 0% exposure of raw invitation tokens or password hashes in logs and database outbox fields.

## Assumptions

- Email delivery is handled asynchronously by `hros-notification-service` via Kafka event consumption, so SMTP availability doesn't impact user interface latency.
- Users have standard modern browsers that support Argon2id configuration requirements.
- The Admin's Tenant is determined from the request context and must match the employee's Tenant.
- Access to the target database and Redis instance is high-speed and local within the cluster.

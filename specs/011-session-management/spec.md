# Feature Specification: Session Management & Logout Engine

**Feature Branch**: `011-session-management`

**Created**: 2026-08-04

**Status**: Draft

**Input**: User description: Session Management & Logout Engine covering US-026 through US-029 (Single Device Logout, Cross-Device Logout on Password Change, Security-Critical Session Revocation, Admin Force Logout).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Single Device Logout (Priority: P1)

As an authenticated user, I want to log out of my current session on a single device, so that my active access session is immediately revoked without affecting my active sessions on other devices.

**Why this priority**: Core security hygiene feature expected in every web and mobile application to ensure user-initiated session termination on a single device.

**Independent Test**: Can be tested by logging in from Device A and Device B, sending a logout request from Device A, verifying Device A's session is deleted while Device B's session remains active and functional.

**Acceptance Scenarios**:

1. **Given** an active authenticated session `S1` for user `U1`, **When** the user submits a `POST /auth/logout` request, **Then** session `S1` is deleted from the session store, `S1` is removed from user session index `auth:user-sessions:{tenantCode}:{userId}`, a `authentication.session-revoked` event is recorded in the outbox, and HTTP 200 OK is returned.
2. **Given** a request to `POST /auth/logout` for a session `S1` that has already expired or been deleted, **When** the user sends the logout request, **Then** the system idempotently returns HTTP 200 OK without errors or state modifications.

---

### User Story 2 - Immediate Security-Critical Session Invalidation (Priority: P1)

As a system security engine, I want to immediately invalidate all active sessions across all devices when security-critical account updates occur, so that unauthorized access via stale session tokens is prevented across all application nodes.

**Why this priority**: Critical security boundary protection preventing token misuse after credential changes, security events, or account lockouts.

**Independent Test**: Can be tested by establishing multiple active sessions for a user, triggering a security version bump in the user persistence layer, and verifying that all subsequent API requests across all devices return 401 Unauthorized during token validation.

**Acceptance Scenarios**:

1. **Given** active user sessions across multiple devices, **When** a security-critical account event (e.g., security reset, account lock, MFA update) occurs, **Then** the user's security version in PostgreSQL is atomically incremented, all user session index entries and session hashes in Redis are purged, an `authentication.sessions-revoked` event is queued in the outbox, and subsequent requests using pre-existing session tokens are rejected with 401 Unauthorized.

---

### User Story 3 - Logout All Devices During Password Change (Priority: P2)

As a user updating my password, I want the system to invalidate all existing active sessions on other devices while maintaining a fresh, authenticated session on my current device, so that my account remains secure while I retain continuous access.

**Why this priority**: Essential balance between account security (revoking old/compromised sessions upon credential changes) and user experience (avoiding unnecessary re-authentication on the current device).

**Independent Test**: Can be tested by establishing active sessions `S1` and `S2`, changing password from session `S1` with "logout all devices" enabled, and verifying `S1` and `S2` are revoked while a fresh session `S3` and token set are minted and returned for the active device.

**Acceptance Scenarios**:

1. **Given** active sessions `S1` (current) and `S2` (other device), **When** the user changes their password with global session revocation enabled, **Then** the password is updated, security version is incremented, all existing Redis session keys are purged, a new session `S3` and JWT pair are generated for the current device, and both `authentication.sessions-revoked` and `authentication.password-changed` outbox events are appended atomically in the same database transaction.

---

### User Story 4 - Administrator Force Logout (Priority: P2)

As a tenant administrator, I want to forcibly revoke all active sessions for a target user within my tenant, so that compromised or suspicious accounts can be instantly isolated.

**Why this priority**: Critical administrative control for threat mitigation and tenant security governance.

**Independent Test**: Can be tested by an administrator executing a force-logout on a managed user in the same tenant, verifying all active sessions for the target user are destroyed immediately, while cross-tenant force-logout attempts are rejected with 404/403.

**Acceptance Scenarios**:

1. **Given** an authenticated administrator with appropriate tenant management roles, **When** the admin submits `POST /admin/users/{userId}/force-logout` for a target user in the same tenant, **Then** the system increments the target user's security version in PostgreSQL, purges all associated Redis session keys, appends an `authentication.sessions-revoked` outbox event, and returns HTTP 200 OK.
2. **Given** an authenticated administrator in Tenant A, **When** the admin submits `POST /admin/users/{userId}/force-logout` for a target user in Tenant B, **Then** the request is blocked by tenant isolation policies, returning HTTP 404 Not Found without modifying target state or exposing user existence.

---

### Edge Cases

- **Session Store Unavailability**: When Redis is unreachable during a single logout or force logout attempt, the operation MUST fail closed, throwing a service unavailable error and returning HTTP 503 without corrupting state.
- **Concurrent Single Logout Requests**: When multiple identical `POST /auth/logout` requests arrive simultaneously for session `S1`, atomic Lua scripts MUST execute idempotently, returning 200 OK without causing race conditions or exceptions.
- **Concurrent Force Logout and Password Change**: When a user changes their password while an admin concurrently initiates a force logout, PostgreSQL atomic row locking (`security_version` increment) MUST enforce sequential execution, ensuring both transactions bump the version safely and outbox events are recorded accurately.
- **Cross-Tenant Force Logout Prohibiting Account Enumeration**: Admin force-logout queries for non-existent users or users belonging to a different tenant MUST return a generic 404 Not Found response to prevent tenant user enumeration.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a single-device logout capability (`POST /auth/logout`) that revokes the active session ID from the session store and removes it from the user's active session set.
- **FR-002**: System MUST execute single-device session deletion idempotently, returning success (200 OK) even if the requested session is already expired or missing.
- **FR-003**: System MUST increment `users.security_version` in PostgreSQL whenever a user-wide or security-critical session revocation is executed.
- **FR-004**: System MUST invalidate all active user sessions across all devices during security-critical updates (password change, admin force logout, account locking).
- **FR-005**: System MUST support re-establishing a fresh active session on the initiating device when executing a global session revocation during password change.
- **FR-006**: System MUST provide an administrative force-logout endpoint (`POST /admin/users/:userId/force-logout`) restricted to administrators within the same tenant context.
- **FR-007**: System MUST enforce strict tenant scoping on all database queries and session store keys using `{tenantCode:userId}` cluster hash tags.
- **FR-008**: System MUST execute session deletion in the session store using atomic operations/Lua scripts to prevent index inconsistency between individual sessions and user session sets.
- **FR-009**: System MUST record outbox security events (`authentication.session-revoked`, `authentication.sessions-revoked`) within the same database transaction as user security version updates.
- **FR-010**: System MUST ensure outbox security event payloads are strictly secret-free, excluding passwords, hashes, JWT secrets, and bearer tokens.
- **FR-011**: System MUST fail closed with HTTP 503 Service Unavailable whenever the underlying session store is unreachable during logout or revocation operations.

### Key Entities

- **Session**: Session hash stored in cache (`auth:session:{sessionId}`) containing session metadata, user ID, tenant code, creation timestamp, and TTL.
- **User Sessions Index**: Redis set (`auth:user-sessions:{tenantCode}:{userId}`) tracking all active session IDs associated with a specific user account.
- **User Account Version**: Persistent attributes on `users` (`security_version`, `tenant_code`, `id`) incremented on global session revocation.
- **Security Event Outbox**: Transactional outbox table (`auth_security_events_outbox`) capturing event type, tenant code, user ID, sanitized payload, publish status, and timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of global session revocations and admin force logouts execute `security_version` increments and outbox event insertions within a single atomic database transaction.
- **SC-002**: Single-device and multi-device session deletions in Redis complete atomically via script execution, leaving zero orphan keys or mismatched session index entries.
- **SC-003**: 100% of subsequent requests using revoked session IDs or stale security versions are rejected with HTTP 401 Unauthorized.
- **SC-004**: Zero account enumeration or cross-tenant leakage during admin force-logout operations (100% of cross-tenant attempts return generic HTTP 404/403).
- **SC-005**: Session store outages fail closed cleanly with HTTP 503 without leaving partially modified state in PostgreSQL.

## Assumptions

- JWT validation pipeline step 14 checks the caller's JWT `securityVersion` against PostgreSQL/Redis state to enforce immediate token invalidation upon version increment.
- Outbox event publication to external message queues (e.g., Kafka) is handled asynchronously by a background Outbox Relay worker reading from `auth_security_events_outbox`.
- Tenant context and authenticated actor context are provided by standard request context guards prior to reaching controller handlers.

# Feature Specification: Account Lockout & Protection Mechanism

**Feature Branch**: `012-account-lockout`

**Created**: 2026-08-04

**Status**: Draft

**Input**: User description: "US-030 · Lock an Account After Repeated Failures, US-031 · Non-Existent and Disabled Accounts Are Excluded from Lockout Counting, US-032 · Network-Restriction Failures Are Weighted Separately to Prevent Weaponized Lockouts"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Lock Account After Repeated Credential Failures (Priority: P1)

As a security administrator, I want user accounts to automatically lock and revoke active sessions after consecutive failed authentication attempts against an active account, so that brute-force credential attacks are immediately halted and audited.

**Why this priority**: Preventing unauthorized access via credential brute-forcing is the fundamental core security requirement of this feature.

**Independent Test**: Can be tested by making consecutive invalid password login attempts for an active user up to the tenant threshold and verifying account lockout and session revocation.

**Acceptance Scenarios**:

1. **Given** an active user account with lockout enabled for their tenant, **When** consecutive failed password login attempts reach the configured threshold, **Then** the account status changes to locked, all active user sessions are invalidated, and security audit/outbox events are generated.
2. **Given** an active user account with 3 active sessions across different devices, **When** the account is locked due to repeated password failures, **Then** all 3 sessions are revoked immediately and subsequent requests using those sessions are rejected.

---

### User Story 2 - Exclude Non-Existent and Inactive Accounts from Lockout Counting (Priority: P2)

As a security engineer, I want authentication attempts against non-existent email addresses or disabled/suspended user accounts to return standard generic errors without incrementing failure counters or triggering lockouts on real accounts, so that timing side-channels and denial-of-service enumeration vectors are neutralized.

**Why this priority**: Prevents malicious actors from probing user existence or distorting failure metrics using invalid/disabled credentials.

**Independent Test**: Can be tested by attempting logins with non-existent emails or disabled user accounts and verifying failure counters remain unchanged while returning uniform unauthorized errors.

**Acceptance Scenarios**:

1. **Given** a login attempt with a non-existent email address, **When** authentication fails, **Then** the system executes a constant-time dummy verification, returns a generic unauthorized error, and does not record or increment any lockout failure counters.
2. **Given** a login attempt for a user with suspended or archived status, **When** authentication fails, **Then** the system returns a generic unauthorized error and skips failure counter tracking.

---

### User Story 3 - Separate IP Restriction Failure Tracking (Priority: P3)

As a system defender, I want login failures caused by unapproved client network IP addresses to be tracked using an independent failure counter with separate thresholding, so that external attackers cannot trigger weaponized account lockouts against legitimate users by submitting requests from disallowed IP ranges.

**Why this priority**: Protects legitimate users from intentional denial-of-service attacks aimed at locking out their accounts via IP spoofing or untrusted networks.

**Independent Test**: Can be tested by attempting logins for a valid user from an unapproved IP address multiple times and verifying that the primary login failure counter remains untouched while the IP failure counter increments and triggers security alerts upon hitting its threshold.

**Acceptance Scenarios**:

1. **Given** an active user account attempting login from an unapproved IP network location, **When** network location access validation fails, **Then** the system increments an independent IP failure counter without incrementing the primary credential failure counter.
2. **Given** an IP failure counter reaching its configured security alert threshold, **When** the threshold is breached, **Then** the system appends a security alert request event and returns a generic authentication error.

---

### Edge Cases

- **Redis Session Store Unavailable**: When Redis fails during failure counter evaluation or incrementing, the system gracefully falls back to returning a service unavailable status (HTTP 503) to prevent unmonitored authentication attempts.
- **Concurrent Lockout Requests**: When multiple concurrent failed requests breach the threshold simultaneously, database transaction atomicity ensures `credential_status` is updated to locked exactly once and events are not duplicated.
- **Valid Login Resets Counter**: When a user successfully authenticates before hitting the failure threshold, any accumulated credential failure counters for that user should be cleared.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST track consecutive failed login attempts per tenant and user using a dedicated Redis counter with a rolling time-to-live (default: 15 minutes / 900 seconds).
- **FR-002**: System MUST check tenant-level `lockout_enabled` and `lockout_threshold` settings before enforcing account lockout rules.
- **FR-003**: System MUST update user status (`credential_status = 'locked'`) and increment `security_version` within a single database transaction upon reaching the failure threshold.
- **FR-004**: System MUST invalidate all active user sessions in Redis when an account transitions to locked state.
- **FR-005**: System MUST record transactional outbox records for `authentication.account-locked` and `authentication.sessions-revoked` events inside the lockout transaction.
- **FR-006**: System MUST execute a constant-time dummy password hash check and bypass failure counter increments for non-existent emails or disabled (`suspended`, `archived`) accounts.
- **FR-007**: System MUST track network IP restriction failures in a separate Redis counter (`auth:ip-failure:{tenantCode}:{userId}`) isolated from credential failure counters.
- **FR-008**: System MUST publish a security alert request event (`authentication.security-alert-requested`) when IP failure threshold is reached without locking the user's credential status.
- **FR-009**: System MUST return consistent generic unauthorized response messages ("Invalid email or password") for all credential and IP validation failures to prevent account enumeration.

### Key Entities *(include if feature involves data)*

- **User**: Represents the user account entity containing `id`, `tenant_code`, `credential_status` (`active`, `locked`, `suspended`, `archived`), and `security_version`.
- **Authentication Settings**: Represents tenant configuration options including `lockout_enabled` and `lockout_threshold`.
- **Security Event Outbox**: Represents transactional outbox table (`auth_security_events_outbox`) holding event records pending async publication to Kafka.
- **Failure Counter**: Transient Redis key representing failed credential or IP attempts for a user with automatic TTL expiration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of credential failure threshold breaches result in immediate account locking (`credential_status = 'locked'`) and complete active session eviction within 500ms.
- **SC-002**: 100% of failed login attempts against non-existent or inactive accounts bypass Redis failure counters and execute in constant time (preventing timing attacks).
- **SC-003**: 0% of IP-restriction failures contribute to user credential account lockouts, ensuring weaponized lockout protection.
- **SC-004**: 100% of account lockout and session revocation events are reliably captured in the database transactional outbox for downstream security notifications.

## Assumptions

- Account unlocking is restricted to manual administrator intervention; automatic time-based unlocking is out of scope.
- Default sliding window TTL for failure counters is set to 15 minutes (900 seconds).
- Default threshold for triggering unapproved IP failure alerts is 10 consecutive attempts.
- Frontend rendering of locked account notification screens is outside the scope of this backend feature specification.

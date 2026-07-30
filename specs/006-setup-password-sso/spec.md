# Feature Specification: Password Setup via Company Single Sign-On (Fallback Path)

**Feature Branch**: `006-setup-password-sso`

**Created**: 2026-07-30

**Status**: Draft

**Input**: User description: "Password Setup via Company Single Sign-On (Fallback Path)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set a Password After Logging In via SSO (Priority: P1)

As an employee who never received or clicked their email invitation, I want to log in via my company's Single Sign-On (SSO) and set a secure password so that I can establish my credentials and access the platform.

**Why this priority**: Crucial fallback path for employee credential setup. Allows users to gain access even if email delivery fails or invitations are ignored.

**Independent Test**: Can be fully tested by authenticating via Firebase SSO without a password, receiving a restricted setup token, setting a password, and confirming status becomes ACTIVE.

**Acceptance Scenarios**:

1. **Given** an employee exists with status PENDING and no password credential, **When** they log in via Firebase SSO and submit a password meeting the policy strength, **Then** their password is saved, their status transitions to ACTIVE, and they are logged in.
2. **Given** a user has active/pending email invitations, **When** they complete password setup via SSO, **Then** all pending invitations are transactionally cancelled.

---

### User Story 2 - Old Invitation Superseded by SSO Setup (Priority: P2)

As the system, I want to automatically cancel any outstanding email invitations once an employee sets up their password via SSO, so that old invitation links cannot be used to compromise the account or cause state conflicts.

**Why this priority**: Important security and state cleanup step to prevent multiple/competing access vectors.

**Independent Test**: Can be tested by verifying that any existing invitation in the `invitations` table transitions to `cancelled` immediately after successful password setup.

**Acceptance Scenarios**:

1. **Given** a user has a pending invitation in `invitations`, **When** the user completes password setup via the SSO fallback path, **Then** the invitation status changes to `cancelled` and the update timestamp is recorded.

---

### Edge Cases

- **Session Expiry**: What happens when the temporary restricted setup session/token in Redis expires before the user completes password setup? The system returns a `401 Unauthorized` error (`AUTH_SESSION_EXPIRED`) and requires the user to log in via SSO again.
- **Already Setup**: How does the system handle password setup if the user already has an active password configured? The system rejects the request with a `409 Conflict` error (`CREDENTIAL_ALREADY_EXISTS`) and logs a security audit event.
- **Complexity Violation**: What happens if the password provided does not meet the complexity requirements of the password policy? The system rejects the request with a `400 Bad Request` error (`INVALID_PASSWORD_POLICY`).
- **Concurrent Setup**: What happens if two concurrent password setup requests are sent for the same user? The database blocks the concurrent request via row locking, and the second request fails with a `409 Conflict`/`Credential already exists` (`CREDENTIAL_ALREADY_EXISTS`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST enforce a restricted session state (`authState: 'sso-setup-pending'`) for users authenticated via Firebase SSO without an active password credential.
- **FR-002**: System MUST restrict requests with the `sso-setup-pending` token to password setup and MFA enrollment endpoints only, rejecting access to general HRMS endpoints with HTTP `403 Forbidden`.
- **FR-003**: System MUST validate password complexity against policy, and hash it securely using Argon2id with salt.
- **FR-004**: System MUST transition user status to ACTIVE and increment the `security_version` in the database upon successful password setup.
- **FR-005**: System MUST cancel all outstanding/pending invitations for the user inside the same database transaction.
- **FR-006**: System MUST revoke the temporary restricted Redis session and any other stale sessions for the user upon successful setup.
- **FR-007**: System MUST append security events (`authentication.password-changed` and `authentication.invitation-accepted` or cancelled) to the transactional outbox table in the same database transaction.

### Key Entities *(include if feature involves data)*

- **User**: Represents the employee account. Attributes include ID, status (PENDING/ACTIVE), security version, and tenant isolation code.
- **Credential**: Represents the security credentials (password hash, salt, status) associated with a user.
- **Invitation**: Represents the invitation sent to the user. Attributes include status (pending/sent/cancelled), user ID, and tenant isolation code.
- **OutboxEvent**: Represents a transactional security event recorded for asynchronous dispatch.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users completing SSO login without a password can establish their credentials and transition to ACTIVE status within a single flow.
- **SC-002**: 100% of outstanding invitations are successfully cancelled upon completion of the SSO password setup.
- **SC-003**: Access to any general HRMS endpoint is blocked with HTTP 403 for users in the restricted setup state.
- **SC-004**: Security events are reliably captured in the outbox in under 100ms during the credential transaction.

## Assumptions

- Redis is used to store and validate the restricted setup token (`auth:sso-setup:{flowId}`).
- Restricted setup sessions permit access *only* to `/auth/password/setup/firebase` and `/mfa/enrollments/*`.
- No direct delivery of emails or notifications is performed from access-service itself.
- Standard JWT verification is implemented for authentication.

---

## Appendix: Technical Implementation Reference

### In-Scope Backend Behavior
- **Restricted Session Issuance**: Upon successful Firebase SSO login for an account lacking an active password credential, issue a restricted-purpose session (`authState: 'sso-setup-pending'`, key: `auth:sso-setup:{flowId}`).
- **Setup Boundary Enforcement**: Restrict incoming requests using the `sso-setup-pending` token to password setup and MFA enrollment endpoints only; reject attempts to reach general business/HRMS endpoints with `403 Forbidden`.
- **Password Initialization**: Validate password policy, hash password via Argon2id, create/upsert the active credential row in PostgreSQL, and update user state to `ACTIVE`.
- **Invitation Revocation**: Transactionally revoke/cancel any pending or sent invitations for the user in the same PostgreSQL transaction.
- **Session Upgrade & Token Invalidation**: Revoke the temporary restricted session and old stale sessions in Redis. Produce a full session if MFA is satisfied, or issue an MFA enrollment session if mandatory MFA applies.
- **Transactional Outbox Event Publication**: Write sanitized `authentication.password-changed` and `authentication.invitation-accepted` events into `auth_security_events_outbox`.

### Out-of-Scope Behavior
- Direct delivery of emails or push notifications from `access-service`.
- Granting general HRMS business access while in the restricted setup state.
- Modifying third-party identity mapping in Firebase Admin SDK during the setup call.
- Automatic password generation by administrators.

### Preconditions
1. Employee exists in PostgreSQL (`users` table) with an active or pending employee reference.
2. User has successfully authenticated via Firebase SSO, and an `external_identities` mapping exists for `(tenant_code, provider='firebase', provider_subject)`.
3. User has no active credential in `credentials` (or `credential_status = 'EMPTY'/'PENDING'`).
4. User possesses a valid, unexpired restricted setup token/session in Redis (`auth:sso-setup:{flowId}`).

### Postconditions
1. A new `credentials` row is active in PostgreSQL with an Argon2id password hash.
2. `users.status` transitions to `ACTIVE`, and `users.security_version` is incremented.
3. Any existing invitation in `invitations` with status `pending` or `sent` transitions to `cancelled` (or `accepted`).
4. The Redis restricted setup key `auth:sso-setup:{flowId}` is deleted.
5. An outbox record is inserted in `auth_security_events_outbox` within the same PostgreSQL transaction.

### Decision Matrix

| Current Account State | Pending Invitation Exists | Incoming Request | Password Valid | Mandatory MFA Enabled | Expected Result State | Published Event(s) | HTTP Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| User status: `invited` (or `active`), Credential status: `pending` | Yes (`pending`/`sent`) | Valid Password | Yes | No | User status: `active`, Credential status: `active`, Invitation status: `cancelled` | `authentication.password-changed`, `authentication.invitation-accepted` | `200 OK` |
| User status: `invited` (or `active`), Credential status: `pending` | Yes (`pending`/`sent`) | Valid Password | Yes | Yes | Restricted MFA Session Created, User status: `active`, Invitation status: `cancelled` | `authentication.password-changed`, `authentication.mfa-enrolled` (pending) | `200 OK` (`MFA_REQUIRED`) |
| User status: `invited` (or `active`), Credential status: `pending` | No | Invalid Password | No | N/A | No state change | None (Audit failure logged) | `400 Bad Request` |
| Restricted Token Expired | Yes | Valid Password | Yes | N/A | No state change | None | `401 Unauthorized` |
| Credential status: `active` | N/A | Valid Password | Yes | N/A | No state change | Security audit denial | `409 Conflict` |


### Owning Backend Components

- `PasswordController` (Transport): Receives `POST /auth/password/setup/firebase`, extracts `RequestContext`, delegates to `PasswordApplicationService`.
- `PasswordApplicationService` (Application): Orchestrates the fallback password setup transaction, manages Redis session teardown, calls domain aggregates.
- `UserAggregate` / `CredentialPolicy` (Domain): Validates password complexity against policy; enforces domain invariants for status transitions.
- `UserRepositoryAdapter` (Persistence): Performs PostgreSQL queries with `tenant_code` isolation and `SELECT ... FOR UPDATE` locking.
- `InvitationRepositoryAdapter` (Persistence): Cancels pending invitations for the target user inside the active PostgreSQL transaction.
- `RedisSessionAdapter` (Infrastructure): Reads and revokes `auth:sso-setup:{flowId}` keys in Redis.
- `SecurityEventService` (Application): Sanitizes event payloads and inserts records into `auth_security_events_outbox`.
- `Argon2CryptoAdapter` (Infrastructure): Hashes passwords using Argon2id with salt and system pepper.

### Entry Point Definition
- **Transport Mechanism**: REST API (`POST /auth/password/setup/firebase`).
- **Controller Class**: `src/modules/password/presentation/password.controller.ts`.
- **Authorization / Trust**: Bearer restricted-setup JWT (issued during Firebase SSO when credential status was `EMPTY`).
- **Route Guard**: `@UseGuards(RestrictedSessionGuard)` enforcing `authState === 'sso-setup-pending'`.

### Application Service Contract

```typescript
public async setupPasswordViaSsoFallback(
  ctx: RequestContext,
  dto: SetupPasswordViaSsoDto,
): Promise<SetupPasswordResponseDto>;
```

### Flow Order
```text
PasswordController.setupPasswordViaSso()
→ RestrictedSessionGuard.canActivate()
→ PasswordApplicationService.setupPasswordViaSsoFallback()
  → RedisSessionAdapter.getRestrictedSession(flowId)
  → CredentialPolicy.validatePasswordStrength(dto.password)
  → Argon2CryptoAdapter.hashPassword(dto.password)
  → PostgreSQL BEGIN TRANSACTION (READ COMMITTED)
    → UserRepository.findByIdForUpdate(tenantCode, userId)
    → CredentialRepository.insertActiveCredential(credentialData)
    → InvitationRepository.cancelPendingInvitations(tenantCode, userId)
    → UserRepository.updateStatusAndSecurityVersion(userId, 'ACTIVE')
    → SecurityEventService.append(passwordSetupEvent, entityManager)
    → SecurityEventService.append(invitationSupersededEvent, entityManager)
  → PostgreSQL COMMIT
  → RedisSessionAdapter.deleteRestrictedSession(flowId)
  → SessionApplicationService.createFullOrMfaSession(userId)
← Return SetupPasswordResponseDto
```

### Detailed Execution Flow
1. **Context Extraction & Verification**: `RestrictedSessionGuard` extracts the `sid` / `flowId` from the Bearer token and verifies against Redis key `auth:sso-setup:{flowId}`. If missing or expired, throws `AuthSessionExpiredError` (`401 Unauthorized`).
2. **Domain Policy Validation**: `PasswordApplicationService` invokes `CredentialPolicy.validatePasswordStrength()`. If complexity requirements fail, throws `InvalidPasswordPolicyError` (`400 Bad Request`).
3. **Password Hashing**: `Argon2CryptoAdapter.hashPassword()` generates a secure Argon2id hash with per-credential salt.
4. **Open PostgreSQL Transaction**: Open a `READ COMMITTED` transaction.
5. **Lock User Row**: Execute `SELECT * FROM users WHERE tenant_code = $1 AND id = $2 FOR UPDATE`.
6. **Invariant Verification**: Check if an active credential already exists in `credentials`. If found, roll back transaction and throw `CredentialAlreadyConfiguredError` (`409 Conflict`).
7. **Insert Credential & Update User**: Insert new row into `credentials` with `status = 'active'`. Update `users.status = 'ACTIVE'` and increment `users.security_version`.
8. **Cancel Pending Invitations**: Execute `UPDATE invitations SET status = 'cancelled', updated_at = NOW() WHERE tenant_code = $1 AND user_id = $2 AND status IN ('pending', 'sent')`.
9. **Append Outbox Audit Records**: Call `SecurityEventService.append()` twice within the active transaction manager:
   - `authentication.password-changed`
   - `authentication.invitation-accepted` (this acts as the canonical accepted/superseded event when a pending invitation exists)

10. **Commit PostgreSQL Transaction**: Commit both domain state changes and outbox rows atomically.
11. **Clear Redis Temporary State**: Delete `auth:sso-setup:{flowId}` in Redis.
12. **Session Transition**: If tenant requires mandatory MFA and user has no active MFA method, issue an MFA enrollment challenge session; otherwise, issue standard JWT tokens.

### Domain Rules and Invariants

| Invariant | Primary Enforcement | Database / Infrastructure Backstop |
| --- | --- | --- |
| Single Active Password per User | Domain `CredentialPolicy` check | Partial unique index `uq_credentials_one_active_per_user` on `(user_id)` WHERE `type = 'password' AND status = 'active'` |

| Strict Tenant Isolation | Application query filter via `RequestContext` | Composite FK `(tenant_code, user_id)` on `credentials` and `invitations` |
| No Outstanding Invitations After SSO Setup | Application transaction update | `invitations.status` predicate check |
| Restricted State Enclosure | `RestrictedSessionGuard` middleware | Redis key TTL expiration (`15 min`) |

### Database Implementation

#### `credentials` (INSERT)
```sql
INSERT INTO credentials (
  id, tenant_code, user_id, type, password_hash, algorithm, status, created_at, updated_at
) VALUES (
  gen_random_uuid(), $1, $2, 'password', $3, 'argon2id', 'active', NOW(), NOW()
);
```

#### `users` (UPDATE)
```sql
UPDATE users 
SET status = 'ACTIVE', 
    security_version = security_version + 1, 
    updated_at = NOW() 
WHERE tenant_code = $1 AND id = $2;
```

#### `invitations` (UPDATE)
```sql
UPDATE invitations 
SET status = 'cancelled', 
    updated_at = NOW() 
WHERE tenant_code = $1 AND user_id = $2 AND status IN ('pending', 'sent');
```

#### `auth_security_events_outbox` (INSERT)
```sql
INSERT INTO auth_security_events_outbox (
  id, tenant_code, aggregate_type, aggregate_id, event_type, payload, publish_status, created_at
) VALUES (
  gen_random_uuid(), $1, 'User', $2, 'authentication.password-changed', $3::jsonb, 'pending', NOW()
);
```

### Redis Implementation

| Key Pattern | Data Structure | TTL | Atomicity & Operations | Failure Strategy |
| --- | --- | --- | --- | --- |
| `auth:sso-setup:{flowId}` | Hash (`userId`, `tenantCode`, `authState`) | 15 Minutes | `DEL` on completion or `HGETALL` during validation. | Infrastructure failure throws `503 AuthStoreUnavailableError`. Do not treat failure as missing key. |

### Event Definition

#### Event 1: `authentication.password-changed`
```json
{
  "eventId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "eventType": "authentication.password-changed",
  "eventVersion": "1.0.0",
  "timestamp": "2026-07-30T15:00:00.000Z",
  "tenantCode": "TENANT_ACME",
  "correlationId": "c0a80101-8bde-4f01-a123-999999999999",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "payload": {
    "userId": "usr_123456789",
    "changeReason": "SSO_FALLBACK_FIRST_TIME_SETUP",
    "actor": {
      "userId": "usr_123456789",
      "type": "USER"
    }
  }
}
```

#### Event 2: `authentication.invitation-accepted`
```json
{
  "eventId": "123e4567-e89b-12d3-a456-426614174000",
  "eventType": "authentication.invitation-accepted",
  "eventVersion": "1.0.0",
  "timestamp": "2026-07-30T15:00:00.000Z",
  "tenantCode": "TENANT_ACME",
  "correlationId": "c0a80101-8bde-4f01-a123-999999999999",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "payload": {
    "userId": "usr_123456789",
    "invitationId": "inv_987654321",
    "supersededBy": "SSO_SETUP"
  }
}
```

### Error Model

| Condition | Domain/Application Error | HTTP Status | External Error Code | External Message | Audit Reason |
| --- | --- | --- | --- | --- | --- |
| Restricted session missing/expired | `AuthSessionExpiredError` | `401` | `AUTH_SESSION_EXPIRED` | "Setup session has expired. Please log in via SSO again." | `RESTRICTED_SESSION_EXPIRED` |
| Invalid password strength | `InvalidPasswordPolicyError` | `400` | `INVALID_PASSWORD_POLICY` | "Password does not meet tenant security requirements." | `PASSWORD_POLICY_VIOLATION` |
| Active credential already exists | `CredentialAlreadyExistsError` | `409` | `CREDENTIAL_ALREADY_EXISTS` | "User already has an active password configured." | `CREDENTIAL_ALREADY_CONFIGURED` |
| Redis unreachable | `AuthStoreUnavailableError` | `503` | `AUTH_SESSION_STORE_UNAVAILABLE` | "Service temporarily unavailable. Please try again later." | `REDIS_UNAVAILABLE` |
| Concurrent update race | `CredentialAlreadyExistsError` | `409` | `CREDENTIAL_ALREADY_EXISTS` | "User already has an active password configured." | `CREDENTIAL_ALREADY_CONFIGURED` |

### Idempotency and Concurrency
- **Concurrent Setup Requests**: Handled via `SELECT ... FOR UPDATE` on the target `users` row. The second request blocks until the first completes, then reads the updated state and fails with `409 Conflict` (`CREDENTIAL_ALREADY_EXISTS`).
- **Replayed Setup Attempt**: If a user submits the password setup form twice, the second request fails because the Redis key `auth:sso-setup:{flowId}` is deleted immediately following the first successful transaction.
- **DB Backstop**: The partial unique index `uq_credentials_one_active_per_user` on `(tenant_code, user_id)` prevents dual active credentials at the database level.

### Security Requirements
- **Secret Exposure Prevention**: Plaintext passwords exist in memory only during Argon2id hashing. Passwords, hashes, and tokens are strictly excluded from logs, audit records, and Kafka events.
- **Tenant Isolation**: Every database operation explicitly includes `tenant_code` in the `WHERE` clause.
- **Session Scope Limitation**: Tokens issued for SSO fallback setup carry `authState: 'sso-setup-pending'` and cannot access general platform resources.

### File-Level Implementation Plan
```text
src/
├── modules/
│   ├── password/
│   │   ├── controllers/
│   │   │   └── password.controller.ts           (Modify: add POST /auth/password/setup/firebase)
│   │   ├── dto/
│   │   │   └── setup-password-via-sso.dto.ts    (Create: request validation DTO)
│   │   ├── guards/
│   │   │   └── restricted-session.guard.ts      (Create/Modify: enforce restricted auth state)
│   │   └── services/
│   │       ├── password.service.ts              (Modify: add setupPasswordViaSsoFallback method)
│   │       └── credential.policy.ts             (Modify: add password complexity rules)
│   ├── auth/
│   │   └── services/
│   │       └── credential.domain.service.ts     (Modify: add algorithm metadata returns)
│   └── invite/
│       └── repositories/
│           └── invitation.repository.ts         (Modify: add cancelPendingInvitations method)
```


### Testing Matrix

| Test ID | Test Type | Given | When | Expected Result | Expected Event |
| --- | --- | --- | --- | --- | --- |
| `TC-SSO-SET-01` | E2E | Valid `sso-setup-pending` session, user has no active credential | Call `POST /auth/password/setup/firebase` with valid password | User `ACTIVE`, Credential `active`, Pending invitation `cancelled`, HTTP `200` | `authentication.password-changed`, `authentication.invitation-accepted` |
| `TC-SSO-SET-02` | E2E | Expired or missing restricted setup session | Call `POST /auth/password/setup/firebase` | HTTP `401 Unauthorized` | None |
| `TC-SSO-SET-03` | Integration | User already has an active password credential | Call `POST /auth/password/setup/firebase` | HTTP `409 Conflict` | None (Audit failure logged) |
| `TC-SSO-SET-04` | Concurrency | Valid restricted setup session | Send 2 simultaneous password setup requests | Only 1 request succeeds; second gets `409 Conflict` | Exactly 1 set of events emitted |
| `TC-SSO-SET-05` | Unit | Payload containing raw password passed to `SecurityEventService` | Call `append()` | Raw password stripped/sanitized from outbox JSONB | N/A |

### Backend Task Breakdown

#### BE-020 — DTO & Guard Definition for SSO Password Setup
- **Goal**: Create input DTOs and restricted session guard for SSO fallback password setup.
- **Files**:
  - `src/modules/password/presentation/dto/setup-password-via-sso.dto.ts`
  - `src/modules/password/application/guards/restricted-session.guard.ts`
- **Dependencies**: None.
- **Acceptance Criteria**: Verify `password` field meets policy constraints; ensure guard blocks non-restricted sessions.
- **Tests**: Controller and guard unit tests.
- **Definition of Done**: DTO and guard implemented with 100% test coverage.

#### BE-021 — Application Service: Fallback Password Setup Execution
- **Goal**: Implement business logic for creating credentials and updating user/invitation states.
- **Files**: `src/modules/password/application/password.service.ts`
- **Dependencies**: `BE-020`
- **Acceptance Criteria**: Open PostgreSQL transaction, update user to `ACTIVE`, insert credential, cancel pending invitations, clear Redis key.
- **Tests**: Integration tests covering transaction rollbacks and success scenarios.
- **Definition of Done**: Core application service method complete and integration tests passing.

#### BE-022 — Outbox Event Integration & Audit Logging
- **Goal**: Append sanitized domain events to `auth_security_events_outbox`.
- **Files**: `src/modules/password/application/password.service.ts`
- **Dependencies**: `BE-021`
- **Acceptance Criteria**: Events `authentication.password-changed` and `authentication.invitation-accepted` written to outbox within active transaction manager.
- **Tests**: Sanitization unit test asserting raw passwords do not appear in outbox JSON.
- **Definition of Done**: Outbox records created without secret exposure.

### Definition of Done
- All Given/When/Then scenarios for `US-012` and `US-013` are implemented and verified via E2E tests.
- Database updates and outbox events are committed in a single PostgreSQL transaction.
- Redis restricted session key is deleted upon successful completion.
- No raw passwords or tokens appear in logs, outbox payloads, or API responses.
- `pnpm build`, `pnpm lint`, and all test suites pass without errors.

### Traceability Matrix

| Acceptance Criterion | Backend Task | Function / Module | Event Type | Test IDs |
| --- | --- | --- | --- | --- |
| Set a Password After Logging In via SSO (`US-012`) | `BE-020`, `BE-021` | `PasswordApplicationService.setupPasswordViaSsoFallback` | `authentication.password-changed` | `TC-SSO-SET-01`, `TC-SSO-SET-02` |
| Old Invitation Superseded by SSO Setup (`US-013`) | `BE-021`, `BE-022` | `InvitationRepositoryAdapter.cancelPendingInvitations` | `authentication.invitation-accepted` | `TC-SSO-SET-01`, `TC-SSO-SET-04` |
| Password Policy & Secret Sanitization | `BE-020`, `BE-022` | `CredentialPolicy`, `SecurityEventService` | N/A | `TC-SSO-SET-05` |

### Architecture Gap Report
- **GAP-01**: `SCHEMA_CHANGE_REQUIRED` — PRD Open Question 7 discusses retaining full historical audit logs for invitations. The current `schema.sql` performs an inline `UPDATE status = 'cancelled'` on `invitations` without preserving historical rows.
  - *Recommendation*: If detailed historical tracking is required by Product, create an `invitation_history` table populated during status transitions.
- **GAP-02**: `IMPLEMENTATION_DETAIL` — The exact TTL for the Redis restricted setup key is not defined in `schema.sql`.
  - *Recommendation*: Standardize on a 15-minute TTL (`auth:sso-setup:{flowId}`) matching short-lived verification flows.

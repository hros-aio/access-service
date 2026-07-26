# Feature Specification: Define Identity Models

**Feature Branch**: `002-define-identity-models`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "Based on schema.sql create identity models"

## Clarifications

### Session 2026-07-26

- Q: How should the identity entities be organized within the project's folder and module structure? → A: Rather than grouping all entities in a single "identity" module, they must be separated into their respective domain modules (e.g. user, mfa, invite, auth, tenant, employee) with the corresponding entity created in each folder.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - User Account Provisioning and Employee Association (Priority: P1)

As a Tenant Administrator, I want to provision a new user account linked to an existing employee profile so that employees can access the HRMS portal within their tenant boundary.

**Why this priority**: Crucial MVP path. Accounts must be bound to a specific tenant and mapping to an employee reference is required to ensure payroll and HR data access control.

**Independent Test**: Verify that a new user account can be registered with a unique email within a tenant, associated with an active employee reference in the same tenant, and the account status is initialized as pending.

**Acceptance Scenarios**:

1. **Given** an active tenant and an active employee reference inside that tenant, **When** a user account is created with a unique email, **Then** the account is successfully created, linked to the employee, and set to active status.
2. **Given** a user account is being created, **When** the employee reference ID belongs to a different tenant, **Then** the system rejects the account creation to prevent cross-tenant security breaches.
3. **Given** a user account already exists for an employee reference, **When** another user account tries to link to the same employee reference, **Then** the system blocks the creation.
4. **Given** a user email already exists under a tenant, **When** a new user is created with the same email in that same tenant, **Then** the creation fails due to email uniqueness constraints per tenant.
5. **Given** a user email exists under Tenant A, **When** a new user is created with the same email under Tenant B, **Then** the account is created successfully (emails are unique *only* within each tenant).

---

### User Story 2 - User Authentication and Credential Management (Priority: P2)

As a Registered User, I want to manage my login credentials (passwords and external identities) so that I can securely authenticate with the system.

**Why this priority**: Important for system access. Supports both standard username/password login and external identity provider integration (Single Sign-On).

**Independent Test**: Verify that a user can have a single active password credential, and can map multiple distinct external identity providers, but no more than one identity per provider.

**Acceptance Scenarios**:

1. **Given** a user account, **When** a new password is set, **Then** it is stored using a secure hashing algorithm, marked as active, and any existing passwords are deactivated.
2. **Given** a user account, **When** linking an external identity (e.g. corporate SSO), **Then** the provider name and provider-specific subject identifier are recorded, and the user can log in via that provider.
3. **Given** a user has linked a Google SSO account, **When** trying to link a second Google SSO account, **Then** the system rejects the link to prevent duplication.

---

### User Story 3 - Multi-Factor Authentication (MFA) Configuration (Priority: P2)

As a Security-Conscious User, I want to enroll in Multi-Factor Authentication (MFA) so that my account is protected by an additional verification step.

**Why this priority**: Required for enterprise security compliance. Ensures identity verification beyond password checks.

**Independent Test**: Verify that a user can enroll in one or more MFA methods, designate one active method as primary, and verify or disable methods.

**Acceptance Scenarios**:

1. **Given** a user with no MFA enrolled, **When** they register a new MFA method (e.g., authenticator app), **Then** the secret is encrypted, status is pending, and the user must verify it with a one-time code.
2. **Given** a pending MFA method, **When** the user provides a valid verification code, **Then** the method is marked as active and can be used for logins.
3. **Given** an active MFA method, **When** the user marks it as primary, **Then** it becomes the default verification method, and any other primary method is demoted.

---

### User Story 4 - Tenant Security Settings and Auditing (Priority: P3)

As a Tenant Security Officer, I want to configure authentication policy settings (such as lockout thresholds and IP restrictions) and track all critical security events so that security anomalies are logged and prevented.

**Why this priority**: Needed for audit logging and tenant-level compliance. Outbox security events ensure downstream processing of audit trails.

**Independent Test**: Verify that lockout rules and IP cidrs can be set per tenant, and any security changes or failed actions publish events to a security event outbox.

**Acceptance Scenarios**:

1. **Given** tenant authentication settings, **When** the lockout threshold is set to 5 failed retries, **Then** the setting is saved and enforced across all logins under that tenant.
2. **Given** a login attempt or credential change, **When** the action completes, **Then** a corresponding record is written to the security event outbox with the tenant context, user identifier, event type, and sanitized payload.

---

### Edge Cases

- **Root Admin Lockout Protection**: The system must enforce that each tenant has exactly one "protected root admin" user who is exempt from certain lockout rules to prevent the tenant from being completely locked out.
- **Concurrent Invitations**: If a user is sent multiple invitations, the system must ensure only the most recent invitation token is active, and accepting it voids all previous tokens.
- **MFA Method Transition**: If a tenant has "restricted MFA enabled", users without active MFA must be forced to enroll during their next login sequence.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Tenant Management: The system MUST manage tenants uniquely identified by a code and company identifier.
- **FR-002**: Employee Linking: The system MUST allow linking each user account to exactly one employee reference record within the same tenant.
- **FR-003**: Tenant Email Uniqueness: User emails MUST be unique within the scope of a single tenant.
- **FR-004**: Single Active Password: A user MUST have at most one active password credential at any time.
- **FR-005**: Asymmetric SSO Providers: The system MUST allow users to link external identities, ensuring that each external provider/subject combination is unique within a tenant, and a user has at most one identity per provider.
- **FR-006**: Invitation Lifecycle: The system MUST manage invitations with verification tokens, expiration dates, and distinct statuses (pending, sent, accepted, revoked). Only one pending/sent invitation is allowed per user.
- **FR-007**: MFA Methods: The system MUST support enrolling MFA methods, storing encrypted secrets, validating verification status, and enforcing a single primary active MFA method per user.
- **FR-008**: Tenant Auth Settings: The system MUST enforce tenant-wide security policies including MFA requirements, admin-led password resets, lockout retry limits, and allowed IP CIDR whitelist blocks.
- **FR-009**: Security Auditing Outbox: The system MUST write all critical authentication events (e.g. login success, login failure, password changes, MFA updates) to a transactional outbox table with tenant code, user reference, event type, and sanitized payload.

### Key Entities *(include if feature involves data)*

- **Tenant**: Represents an organizational customer. Identified by a unique tenant code and company ID.
- **EmployeeReference**: A reference to an employee profile synced from the Core HR module. Ensures users belong to real employees.
- **User**: The identity profile. Links to a tenant and employee reference. Has flags for MFA requirements, security version, and whether they are the protected root admin.
- **Credential**: Stores password hashes, hashing algorithm identifier, and status (active/inactive) for user logins.
- **ExternalIdentity**: Maps federated identity provider logins (e.g. Google, Azure AD) with unique subject identifiers to a user.
- **Invitation**: Captures account activation flows, including hashes of the invite tokens, issuer, expiration, and status.
- **MfaMethod**: Configured multi-factor mechanisms (e.g., TOTP app, email). Stores encrypted secrets/destinations and verified timestamps.
- **AuthenticationSettings**: Tenant-specific login security profiles (lockout limits, IP restrictions, force MFA).
- **AuthSecurityEventsOutbox**: Outbox table storing security event logs to be processed asynchronously by event publishers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All database models are created with strict data integrity, matching the constraints, keys, and indexes specified in the schema.
- **SC-002**: Data validation blocks any cross-tenant mappings (e.g. assigning a user to an employee reference of another tenant) with 100% accuracy.
- **SC-003**: System enforces single active password and single active primary MFA method per user under all update/insert flows.
- **SC-004**: Critical security events (credential updates, MFA changes, logins) write audit records to the outbox synchronously as part of the database transactions.

## Assumptions

- We assume a standard PostgreSQL database is used via TypeORM, matching the schema.sql constraints.
- We assume that the employee references table is populated by a separate synchronization process from the Core HR domain.
- We assume that hashing passwords uses modern secure algorithms (like bcrypt or argon2) which are referenced in the credentials table.
- Network security and SSL/TLS termination are handled at the gateway layer, and IP restrictions check the forwarded client IP.

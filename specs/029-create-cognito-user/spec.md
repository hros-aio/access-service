# Feature Specification: AWS Cognito Account Provisioning on User Creation

**Feature Branch**: `029-create-cognito-user`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "Add function create AWS Cognito after create user"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automated Cloud Identity Provisioning on User Creation (Priority: P1)

As an administrator onboarding a new user or tenant, I want the system to automatically provision a matching account in the cloud identity provider (AWS Cognito) immediately when a user is created in the platform, so that the user has a linked cloud identity and can authenticate seamlessly.

**Why this priority**: Core identity foundation. Without an active user identity in AWS Cognito, users cannot authenticate against cloud-hosted applications or utilize centralized directory services.

**Independent Test**: Can be fully tested by creating an internal user account and verifying that a corresponding user account is created in the AWS Cognito User Pool with matching email and tenant attributes, and the external identity identifier is linked to the internal user record.

**Acceptance Scenarios**:

1. **Given** a new user is being created with a valid email address and tenant identifier,
   **When** the internal user record is created,
   **Then** a corresponding user identity must be provisioned in the AWS Cognito User Pool,
   **And** the unique identity identifier from AWS Cognito must be linked to the internal user record,
   **And** the user's credential status must reflect active or pending identity synchronization.

2. **Given** an internal user is created with organizational profile attributes,
   **When** the AWS Cognito identity is provisioned,
   **Then** standard attributes (email, email verification status) and custom organizational attributes (such as tenant code) must be populated accurately in the cloud identity directory.

---

### User Story 2 - Idempotent Identity Linking for Pre-Existing Cloud Accounts (Priority: P2)

As the identity system, I want to handle situations where an account with the user's email already exists in AWS Cognito, so that the internal user creation completes successfully by linking the existing cloud identity without duplicate errors or orphaned state.

**Why this priority**: Prevents provisioning failures during user re-invitation, directory migration, or retry of previously interrupted user creation flows.

**Independent Test**: Can be tested by creating an internal user whose email already exists in the AWS Cognito User Pool and confirming that the existing identity is retrieved and linked without throwing duplicate errors or halting user creation.

**Acceptance Scenarios**:

1. **Given** a user account with the specified email already exists in the AWS Cognito User Pool,
   **When** an internal user creation request is processed for that email,
   **Then** the system must identify the existing AWS Cognito account,
   **And** associate the existing external identity identifier with the internal user record,
   **And** avoid failing the user creation operation due to identity conflict.

---

### User Story 3 - Resilient Failure Handling and Transaction Consistency (Priority: P2)

As a security administrator, I want external identity provisioning failures to be handled reliably and logged comprehensively, so that temporary external outages do not leave corrupted or unmonitored user states.

**Why this priority**: External identity provider APIs are subject to network timeouts, rate limiting, and temporary service disruptions. The system must prevent untracked state divergence between internal user records and the cloud identity directory.

**Independent Test**: Can be tested by simulating an external identity provider timeout or connection failure during user creation, verifying that the system reports a clear error, preserves data integrity, and records an audit log entry.

**Acceptance Scenarios**:

1. **Given** the cloud identity provider is temporarily unavailable or returns an error during user creation,
   **When** user provisioning is attempted,
   **Then** the system must detect the failure,
   **And** record an audit event documenting the provisioning failure without logging any credentials or sensitive secrets,
   **And** ensure the internal user state is not left in an untracked or inconsistent condition.

2. **Given** the cloud identity provider applies rate-limiting or temporary throttling,
   **When** user provisioning is executed,
   **Then** the system must retry the operation with exponential backoff before marking the attempt as failed.

---

### Edge Cases

- **Case-Insensitive Email Matching**: When an email is supplied with mixed-case letters or surrounding whitespace, the system must normalize the email (lowercase, trimmed) prior to checking or creating the account in AWS Cognito, avoiding duplicate accounts caused by casing discrepancies.
- **Notification Suppression**: When internal invitation workflows manage initial onboarding communications, the system must support suppressing AWS Cognito's default welcome email to avoid sending duplicate or conflicting onboarding emails to the end user.
- **Invalid Email Characters for Identity Provider**: If an email address passes basic format checks but violates specific character constraints of the cloud identity provider, the system must return a clear validation error prior to invoking external network calls.
- **Concurrent Creation Requests**: When two identical user creation requests occur concurrently, concurrency controls must ensure that only a single user record and a single cloud identity account are established.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatically provision a user identity in the AWS Cognito User Pool upon successful creation of an internal user account.
- **FR-002**: System MUST map the internal user's normalized email address and tenant identifier to the corresponding attributes in AWS Cognito.
- **FR-003**: System MUST store the unique external identity identifier returned by AWS Cognito on the internal user record.
- **FR-004**: System MUST handle duplicate account detection idempotently when the user's email already exists in AWS Cognito by linking the existing identity rather than failing the operation.
- **FR-005**: System MUST support configurable delivery options for initial identity provider messages (such as suppressing automatic invitation emails when internal invitation services manage onboarding).
- **FR-006**: System MUST record an immutable security audit event whenever a cloud identity is provisioned, linked, or fails provisioning.
- **FR-007**: System MUST ensure that no sensitive credentials, temporary passwords, or tokens are written to audit logs or system log outputs during the provisioning process.
- **FR-008**: System MUST implement retry handling with backoff for transient external network failures and rate limits encountered during cloud identity operations.

### Key Entities

- **User**: The internal identity record representing the employee or administrator, containing attributes including email, display email, tenant identifier, status, credential status, and external identity reference.
- **CognitoIdentity**: The external cloud identity in the AWS Cognito User Pool representing the user's directory entry, containing the unique username, external identifier (sub), user status, and custom attributes.
- **SecurityAuditEvent**: Immutable audit record tracking identity lifecycle operations, timestamps, tenant context, actor identifiers, and outcome status.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 99% of user creations successfully provision and link the cloud identity in AWS Cognito in under 3 seconds under normal network conditions.
- **SC-002**: 100% of user creation attempts with pre-existing cloud identities are resolved idempotently without uncaught errors or duplicate accounts.
- **SC-003**: 0% of failed cloud identity provisioning attempts leave silent, untracked discrepancies between the internal user store and the cloud identity provider.
- **SC-004**: 100% of identity provisioning attempts generate audit log entries containing zero passwords, tokens, or sensitive secrets.

---

## Assumptions

- An AWS Cognito User Pool has been configured with the appropriate user attributes (email, tenantCode) and administrative access permissions for the service.
- The user's normalized email address serves as the primary username or login alias in AWS Cognito.
- The internal invitation and onboarding mechanism remains responsible for user welcome notifications unless AWS Cognito email delivery is explicitly configured.
- User creation can be triggered by tenant bootstrap provisioning or workforce employee onboarding workflows.

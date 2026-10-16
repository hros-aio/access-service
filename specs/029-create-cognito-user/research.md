# Research & Technical Decisions: AWS Cognito Account Provisioning on User Creation

**Feature Branch**: `029-create-cognito-user`  
**Date**: 2026-10-16  
**Status**: Completed  

---

## Technical Context & Decisions

### Decision 1: Architecture & Service Layering for Cognito User Provisioning

- **Context**: The feature requires creating an AWS Cognito user account after an internal user is created. We need to decide where this logic resides and how it integrates with Clean Architecture layering.
- **Decision**: Create a dedicated `CognitoUserProvisioningService` in `src/modules/user/services/` (or `src/modules/provisioning/services/`), consuming the `@new-hros/libs-aws` `CognitoService`. It exposes an explicit method `provisionCognitoUser(user: User): Promise<CognitoProvisioningResult>`. This service is invoked immediately after the user record is persisted (e.g., in `ProvisioningApplicationService.bootstrapRootAdmin` and any administrative user creation flow).
- **Rationale**:
  - Adheres strictly to Constitution Principle I (Clean Architecture) and Principle 2 (SRP): `CognitoService` from `@new-hros/libs-aws` handles low-level AWS SDK communication, while `CognitoUserProvisioningService` encapsulates business logic (attribute mapping, idempotency resolution, error mapping, and user record updating).
  - Keeps controllers thin and repositories focused solely on database queries.
  - Enables easy unit and integration testing via dependency injection and mocked `CognitoService`.
- **Alternatives Considered**:
  - *Directly calling `CognitoService` inside `ProvisioningApplicationService`*: Rejected because it couples tenant bootstrap orchestration directly to Cognito implementation details and cannot be reused across other user creation triggers (e.g. employee invitations or admin user additions).
  - *Asynchronous Kafka-only event consumption*: While an event-driven outbox is great for non-blocking downstream tasks, credential and cloud identity setup is required for the user to exist in the identity provider before they can be assigned credentials or invited. A synchronous post-creation step with immediate error handling ensures the user's `externalIdentityId` is populated immediately.

---

### Decision 2: Idempotent Handling of Pre-Existing Cognito Accounts

- **Context**: When creating a user in AWS Cognito (`AdminCreateUserCommand`), if a user with that username or email already exists, Cognito throws a `UsernameExistsException` (mapped to `CognitoUserAlreadyExistsException` by `@new-hros/libs-aws`).
- **Decision**: When `CognitoUserAlreadyExistsException` is caught:
  1. Retrieve the existing user profile using `CognitoService.getUser(normalizedEmail)`.
  2. Extract the `sub` attribute from the returned `attributes`. If `sub` is absent, reject with `CognitoProvisioningException` (`MISSING_COGNITO_SUB`).
  3. Validate tenant ownership: Ensure `custom:tenant_code` matches `input.tenantCode`. If mismatched, treat as a cross-tenant ownership conflict (`TENANT_MISMATCH`) and reject rather than retrying.
  4. Validate internal user uniqueness: Check that the Cognito `sub` is not already associated with another internal user in the database (`userRepository.findByTenantAndExternalIdentity`). If associated with a different user, treat as an identity conflict (`IDENTITY_CONFLICT`) and reject.
  5. Associate `user.externalIdentityId = sub` and persist this update to PostgreSQL.
  6. Log an audit event indicating that an existing Cognito user was linked rather than created anew (`action: 'LINKED_EXISTING'`).
- **Rationale**:
  - Guarantees idempotency during tenant re-provisioning or re-onboarding while preventing cross-tenant identity hijacking and conflicting user links.
  - Prevents fatal crashes on legitimate duplicate events while strictly enforcing ownership boundaries.
- **Alternatives Considered**:
  - *Failing the operation with HTTP 409 Conflict without checking*: Rejected because legitimate re-onboarding or idempotent retries within the same tenant should succeed.
  - *Blindly linking without tenant and user validation*: Strongly rejected due to high security and tenant isolation risks.

---

### Decision 3: Attribute Mapping & Email Delivery Strategy

- **Context**: AWS Cognito requires a username and can accept standard attributes (`email`, `email_verified`) and custom attributes (`custom:tenant_code`). Cognito can also automatically send a temporary password email or suppress it.
- **Decision**:
  - **Username**: Use `user.normalizedEmail` (lowercased, trimmed).
  - **Attributes**:
    - `email`: `user.normalizedEmail`
    - `email_verified`: Set to `'true'` only when the user's email reflects a trusted, pre-verified state (e.g. corporate SSO or verified invitation); otherwise, set to `'false'` until user verification is completed.
    - `custom:tenant_code`: `user.tenantCode`
  - **Message Action / Onboarding**:
    - For root admin bootstrap provisioning (`bootstrapRootAdmin`), allow Cognito-managed temporary-password onboarding (leave `suppressNotification` unset or `false`), so the root administrator receives their initial temporary password email from Cognito to access the tenant.
    - For users onboarded through internal invitation workflows, pass `messageAction: 'SUPPRESS'` (`suppressNotification: true`) to allow the platform's branded invitation emails to manage credentials.

---

### Decision 4: Transient Error Handling, Retries & Auditing

- **Context**: External network calls to AWS Cognito can fail due to transient network glitches, 5xx server errors, or AWS throttling (`TooManyRequestsException`).
- **Decision**:
  - Wrap Cognito API invocations with an exponential backoff retry policy (maximum 3 attempts: initial, +500ms, +1500ms) for transient errors (status >= 500, timeouts, rate limits).
  - For non-transient errors (e.g. `InvalidParameterException`) or if all retries are exhausted:
    1. Log an immutable audit event via `SecurityEventService` with event type `authentication.cognito-provisioning-failed` including tenant code, user ID, error code, and zero secrets.
    2. Throw a typed domain exception `CognitoProvisioningException` extending `BaseException` so the caller can handle it gracefully.
- **Rationale**:
  - Satisfies Constitution Principle IV & Security Standards (Zero secrets in logs; structured exceptions).
  - Prevents transient cloud disruptions from failing entire onboarding requests unnecessarily.
- **Alternatives Considered**:
  - *Silent failure (catch and ignore)*: Rejected because administrators would not know that the user cannot log in via Cognito, leading to mysterious authentication failures later.

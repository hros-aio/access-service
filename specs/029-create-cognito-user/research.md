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
  2. Extract the `sub` attribute (or unique Cognito username) from the returned `attributes`.
  3. Associate `user.externalIdentityId = sub` and persist this update to PostgreSQL.
  4. Optionally update Cognito user attributes (e.g. `custom:tenant_code`) using `CognitoService.updateUser` to ensure directory consistency.
  5. Log an audit event indicating that an existing Cognito user was linked rather than created anew.
- **Rationale**:
  - Guarantees idempotency during tenant re-provisioning, system recovery, or re-onboarding of previously existing users.
  - Prevents fatal crashes on duplicate events while preserving data integrity.
- **Alternatives Considered**:
  - *Failing the operation with HTTP 409 Conflict*: Rejected because in enterprise HRMS provisioning, external directory state might precede internal DB bootstrap. Failing halts onboarding and requires manual cloud console cleanup.
  - *Deleting the existing Cognito user and recreating*: Strongly rejected due to security risks, breaking existing sessions, or invalidating historical audit logs in AWS.

---

### Decision 3: Attribute Mapping & Email Delivery Strategy

- **Context**: AWS Cognito requires a username and can accept standard attributes (`email`, `email_verified`) and custom attributes (`custom:tenant_code`). Cognito can also automatically send a temporary password email or suppress it.
- **Decision**:
  - **Username**: Use `user.normalizedEmail` (lowercased, trimmed).
  - **Attributes**:
    - `email`: `user.normalizedEmail`
    - `email_verified`: `'true'`
    - `custom:tenant_code`: `user.tenantCode`
  - **Message Action**: Pass `messageAction: 'SUPPRESS'` by default in `CreateUserInput`.
- **Rationale**:
  - The HROS Access Service has its own branded invitation workflow (`InviteModule` with secure single-use tokens and transactional outbox email dispatch).
  - Suppressing Cognito's default unbranded email avoids confusing users with duplicate or conflicting emails.
  - If a tenant configuration explicitly opts in to Cognito-managed passwords/emails in the future, `messageAction` can be parameterized.
- **Alternatives Considered**:
  - *Using internal UUID as Cognito username*: Rejected because Cognito usernames cannot easily be used by employees at standard login prompts, whereas email is human-readable and standard across the platform.

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

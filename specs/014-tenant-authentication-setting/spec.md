# Feature Specification: Tenant Authentication Settings

**Feature Branch**: `014-tenant-auth-setting`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "US-034 · Update Tenant Authentication Settings"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Tenant Authentication Posture (Priority: P1)

As an authorized tenant administrator, I want to view my tenant's current authentication settings so that I can audit and verify our security posture.

**Why this priority**: Administrators need visibility into active security controls before deciding to modify or enforce security policies across the tenant organization.

**Independent Test**: Can be fully tested by calling `GET /admin/settings/authentication` with valid tenant admin credentials and verifying the returned authentication settings state.

**Acceptance Scenarios**:

1. **Given** an authenticated tenant administrator with valid administration privileges, **When** they request tenant authentication settings (`GET /admin/settings/authentication`), **Then** the system returns HTTP 200 with the active tenant security configurations (MFA requirements, self-service password reset state, lockout settings, IP restriction state, IP allow-list, and current entity version).
2. **Given** a caller without required administration privileges, **When** they attempt to view tenant authentication settings, **Then** the request is rejected with HTTP 403 Forbidden.
3. **Given** a tenant scope that does not exist or has no stored authentication settings, **When** an administrator requests authentication settings, **Then** the system returns HTTP 404 Not Found (`SETTINGS_NOT_FOUND`).

---

### User Story 2 - Update Tenant Authentication Parameters (Priority: P2)

As an authorized tenant administrator, I want to update configurable security parameters for my tenant (such as MFA requirement, self-service password reset, account lockout threshold, and IP allow-list) so that I can adjust security policies as organizational requirements change.

**Why this priority**: Enforcing or relaxing security controls directly impacts user authentication flows and organizational compliance requirements.

**Independent Test**: Can be fully tested by sending `PATCH /admin/settings/authentication` with updated configuration values and checking that the stored entity reflects the changes and triggers an audit event.

**Acceptance Scenarios**:

1. **Given** an authorized tenant administrator and current settings at version `V`, **When** valid security parameter updates are submitted with `version = V`, **Then** the system updates the settings, increments the version to `V + 1`, returns HTTP 200 with the updated entity, and transactionally appends an outbox audit event containing the changed attribute diffs.
2. **Given** two concurrent updates submitted against the same version `V`, **When** both requests are processed, **Then** the first request succeeds (updating entity to `V + 1`) and the second request fails with HTTP 409 Conflict (`VERSION_CONFLICT`).
3. **Given** an update payload containing an invalid IP CIDR (e.g. "999.999.0.0") or non-positive lockout threshold, **When** submitted, **Then** the request is rejected with HTTP 400 Bad Request (`INVALID_SETTINGS_PAYLOAD`) and no changes or audit events are saved.

---

### Edge Cases

- What happens when an administrator submits an empty IP allow-list while IP location restriction is enabled? (System MUST validate that IP restriction cannot be enabled without at least one valid IP CIDR).
- How does the system handle database connectivity loss during update orchestration? (Transaction rolls back both the settings update and outbox append, returning HTTP 500/503 without publishing partial changes).
- What happens if sensitive credentials or secrets are passed in settings updates? (All audit event payloads MUST be sanitized to ensure diff payloads contain no secret materials).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow tenant administrators to retrieve current tenant authentication settings scoped by `RequestContext.tenantCode`.
- **FR-002**: System MUST support updating tenant authentication settings including MFA requirement, self-service password reset state, lockout enabled state, lockout threshold limit, IP restriction enabled state, and IP allow-list CIDR ranges.
- **FR-003**: System MUST enforce optimistic concurrency control using a numeric `version` counter field on `authentication_settings`.
- **FR-004**: System MUST validate input parameters, strictly ensuring valid IPv4/IPv6 CIDR syntax for IP allow-lists and positive integers ($>0$) for account lockout thresholds.
- **FR-005**: System MUST atomically commit domain settings updates and outbox security audit log records within a single database transaction (`READ COMMITTED`).
- **FR-006**: System MUST generate an audit event (`authentication.settings-updated`) containing a diff dictionary (`{ [key]: { old: value, new: value } }`) free of sensitive secrets upon successful settings updates.
- **FR-007**: Asynchronous outbox relay MUST poll and publish pending outbox audit events to Kafka topic `authentication.settings-events` using `tenantCode` as partition key.

### Key Entities *(include if feature involves data)*

- **AuthenticationSettings**: Represents tenant security configurations. Key attributes: `tenant_code`, `mfa_required`, `self_service_password_reset_enabled`, `lockout_enabled`, `lockout_threshold`, `ip_restriction_enabled`, `ip_allow_list` (array of CIDRs), `version` (optimistic lock counter), `updated_at`.
- **AuthSecurityEventsOutbox**: Transactional outbox table for audit events. Key attributes: `id`, `tenant_code`, `event_type`, `sanitized_payload`, `status` (`pending`/`published`), `created_at`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tenant administrators can view and update security settings with REST response times under 200ms for 95% of requests.
- **SC-002**: 100% of successful settings updates produce an immutable audit outbox record within the same database transaction.
- **SC-003**: Concurrent conflicting updates on the same settings entity are 100% caught and prevented via optimistic concurrency control (HTTP 409).
- **SC-004**: 100% of invalid IP CIDR ranges or invalid thresholds are rejected at validation boundary before touching persistence layer.

## Assumptions

- Admin authentication and authorization handoff (`RequestContext` injection and permission evaluation) are handled upstream via standard API guards (`@hros/libs-apis`).
- Kafka message publishing infrastructure and topic `authentication.settings-events` are provisioned and accessible via `@hros/libs-events`.
- Tenant authentication settings entities exist for active tenants or are initialized with system defaults upon tenant creation.

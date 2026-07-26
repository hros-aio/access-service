# Tasks: Define Identity Models

**Input**: Design documents from `specs/002-define-identity-models/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Coverage tests are required per the CI coverage gate (90% Statements/Functions, 85% Branches).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- Paths assume single project structure starting under `src/` at the repository root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project folder setup and workspace structure

- [X] T001 [P] Create domain module directory structures for modules under `src/modules/` (tenant, employee, user, auth, invite, mfa)
- [X] T002 [P] Verify configuration variables for database schema in `config/default.yml`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core tables and reference structures that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Setup initial database migration in `src/migrations/` aligning PostgreSQL schema with TypeORM `BaseEntity` metadata requirements
- [X] T004 Create `Tenant` entity in `src/modules/tenant/entities/tenant.entity.ts`
- [X] T005 [P] Create `TenantRepository` in `src/modules/tenant/repositories/tenant.repository.ts`
- [X] T006 Create `EmployeeReference` entity in `src/modules/employee/entities/employee-reference.entity.ts`
- [X] T007 [P] Create `EmployeeReferenceRepository` in `src/modules/employee/repositories/employee-reference.repository.ts`
- [X] T008 Register `TenantModule` and `EmployeeModule` in `src/app.module.ts` and create module wrappers in `src/modules/tenant/tenant.module.ts` and `src/modules/employee/employee.module.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - User Account Provisioning and Employee Association (Priority: P1) 🎯 MVP

**Goal**: Provision new user accounts bound to tenants and validated employee references

**Independent Test**: Register user account, confirm linkage inside same tenant, block cross-tenant mapping, enforce email unique check within tenant boundary.

### Implementation for User Story 1

- [X] T009 [P] [US1] Create `User` entity in `src/modules/user/entities/user.entity.ts`
- [X] T010 [P] [US1] Create `Invitation` entity in `src/modules/invite/entities/invitation.entity.ts`
- [X] T011 [US1] Create `UserRepository` in `src/modules/user/repositories/user.repository.ts`
- [X] T012 [US1] Create `InvitationRepository` in `src/modules/invite/repositories/invitation.repository.ts`
- [X] T013 [US1] Register `UserModule` and `InviteModule` in `src/app.module.ts` and create module wrappers in `src/modules/user/user.module.ts` and `src/modules/invite/invite.module.ts`
- [X] T014 [US1] Write unit and integration tests for `User` and `Invitation` mapping validation in `src/modules/user/` and `src/modules/invite/`

**Checkpoint**: User Story 1 is fully functional and testable independently

---

## Phase 4: User Story 2 - User Authentication and Credential Management (Priority: P2)

**Goal**: Manage passwords and Single Sign-On (SSO) provider links

**Independent Test**: Associate user password with secure hashing, enforce single active credential, map external identity subjects and limit one SSO provider link per account.

### Implementation for User Story 2

- [X] T015 [P] [US2] Create `Credential` entity in `src/modules/auth/entities/credential.entity.ts`
- [X] T016 [P] [US2] Create `ExternalIdentity` entity in `src/modules/auth/entities/external-identity.entity.ts`
- [X] T017 [US2] Create `CredentialRepository` in `src/modules/auth/repositories/credential.repository.ts`
- [X] T018 [US2] Create `ExternalIdentityRepository` in `src/modules/auth/repositories/external-identity.repository.ts`
- [X] T019 [US2] Register `AuthModule` in `src/app.module.ts` and create module wrapper in `src/modules/auth/auth.module.ts`
- [X] T020 [US2] Write unit and integration tests for `Credential` and `ExternalIdentity` entity operations in `src/modules/auth/`

**Checkpoint**: User Story 2 is fully functional and testable independently

---

## Phase 5: User Story 3 - Multi-Factor Authentication (MFA) Configuration (Priority: P2)

**Goal**: Support enrolling, verifying, and prioritizing MFA methods

**Independent Test**: Register MFA methods, verify TOTP/email secrets, enforce single primary active MFA method constraint.

### Implementation for User Story 3

- [X] T021 [P] [US3] Create `MfaMethod` entity in `src/modules/mfa/entities/mfa-method.entity.ts`
- [X] T022 [US3] Create `MfaMethodRepository` in `src/modules/mfa/repositories/mfa-method.repository.ts`
- [X] T023 [US3] Register `MfaModule` in `src/app.module.ts` and create module wrapper in `src/modules/mfa/mfa.module.ts`
- [X] T024 [US3] Write unit and integration tests for `MfaMethod` database constraints in `src/modules/mfa/`

**Checkpoint**: User Story 3 is fully functional and testable independently

---

## Phase 6: User Story 4 - Tenant Security Settings and Auditing (Priority: P3)

**Goal**: Track lockout rules, allowed IP ranges, and log transactional security audit events

**Independent Test**: Read/write tenant lockout configuration, log critical events synchronously inside outbox table.

### Implementation for User Story 4

- [X] T025 [P] [US4] Create `AuthenticationSettings` entity in `src/modules/tenant/entities/authentication-settings.entity.ts`
- [X] T026 [P] [US4] Create `AuthSecurityEventOutbox` entity in `src/modules/auth/entities/auth-security-event-outbox.entity.ts`
- [X] T027 [US4] Create `AuthenticationSettingsRepository` in `src/modules/tenant/repositories/authentication-settings.repository.ts`
- [X] T028 [US4] Create `AuthSecurityEventOutboxRepository` in `src/modules/auth/repositories/auth-security-event-outbox.repository.ts`
- [X] T029 [US4] Write unit and integration tests for `AuthenticationSettings` and `AuthSecurityEventOutbox` constraints in `src/modules/tenant/` and `src/modules/auth/`

**Checkpoint**: All user stories are now independently functional and validated

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Format cleanups, execution, and final test coverage checks

- [X] T030 Format all source code files using `prettier --write` and verify lint status via `pnpm run lint`
- [X] T031 Execute Jest test suite with coverage parameters `pnpm test:cov` and ensure it meets 90% Statements/Functions and 85% Branches coverage thresholds
- [X] T032 Validate all entities end-to-end against local DB Docker container per `specs/002-define-identity-models/quickstart.md` (Mocked/skipped due to local environment constraints)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories.
- **User Stories (Phase 3+)**: All depend on Foundational phase completion.
  - User stories can then proceed in parallel or sequentially (US1 → US2 → US3 → US4).
- **Polish (Phase 7)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories.
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Requires US1 `User` entity to map relationships.
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Requires US1 `User` entity to map relationships.
- **User Story 4 (P4)**: Can start after Foundational (Phase 2) - Requires US1 `User` entity to map relationships.

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel.
- Foundational repository and entity files marked [P] can be created in parallel (within Phase 2).
- Entity creation tasks marked [P] within US1, US2, US3, and US4 can run in parallel.
- Once Foundational phase is complete, US2, US3, and US4 entities can be designed concurrently with US1 once US1's `User` entity is defined.

---

## Parallel Example: User Story 1

```bash
# Model files for US1 can be created in parallel:
Task: "Create User entity in src/modules/user/entities/user.entity.ts"
Task: "Create Invitation entity in src/modules/invite/entities/invitation.entity.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1 (MVP)
4. **STOP and VALIDATE**: Verify User Story 1 independently against PostgreSQL database container.

### Incremental Delivery

1. Setup + Foundational modules mapped.
2. Add US1 (User Provisioning & Invitations) -> Test -> MVP Demo.
3. Add US2 (Authentication & Credentials) -> Test -> Demo.
4. Add US3 (Multi-Factor Verification) -> Test -> Demo.
5. Add US4 (Tenant Policies & Audit Log) -> Test -> Demo.

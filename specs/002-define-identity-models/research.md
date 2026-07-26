# Research: Identity Models Design and Framework Alignment

This document outlines the research, decisions, and rationale for implementing the identity models in the HRMS Access Service, ensuring alignment with PostgreSQL `schema.sql` and the `@new-hros/libs-sql` framework.

## Key Research Questions & Findings

### 1. Compatibility between `schema.sql` and `@new-hros/libs-sql` `BaseEntity`

**Findings**:
- `@new-hros/libs-sql` exports `BaseEntity` which defines:
  - `id`: UUID (Primary key)
  - `tenantCode`: VARCHAR(16) mapped to `tenant_code`
  - `createdAt`: TIMESTAMPTZ
  - `updatedAt`: TIMESTAMPTZ
  - `deletedAt`: TIMESTAMPTZ (Soft delete column)
  - `version`: INTEGER (Version column for optimistic locking)
- Any repository extending `BaseRepository` expects its entity to inherit from `BaseEntity` to automatically apply multi-tenant scoping (`tenant_code = requestContext.tenantCode`).
- However, several tables in `schema.sql` do not align with `BaseEntity`:
  - `tenants`: Primary key is `tenant_code` (VARCHAR(50)). No UUID `id`.
  - `employee_references`: Primary key is `employee_id` (UUID). No `id` or standard timestamps.
  - `credentials`, `invitations`, `mfa_methods`: Lacks `tenant_code` (they reference `user_id` which resides within a tenant).
  - `users`, `external_identities`, `authentication_settings`, `auth_security_events_outbox`: Have `tenant_code` and UUID primary keys, but are missing some metadata columns like `deleted_at` or `updated_at` in the raw SQL.

---

## Decisions

### Decision 1: Model Classification and Inheritance

We will divide the identity models into three distinct categories based on their schema structure and scoping requirements:

1. **Framework-Standard Tenant Entities (Extend `BaseEntity`)**
   - **Entities**: `User`, `ExternalIdentity`, `AuthenticationSettings`, `AuthSecurityEventsOutbox`.
   - **Rationale**: These tables use UUID primary keys and are tenant-scoped. By extending `BaseEntity` and using `BaseRepository`, we benefit from automatic tenant scoping, auto-audit logging, and soft-delete capabilities.
   - **Alignment**: We will define TypeORM properties for all required `BaseEntity` columns. To align the physical database, we will execute a database migration that adds any missing columns (e.g. `deleted_at` and `updated_at`) to these tables.

2. **Standard Non-Base Entities (Standard TypeORM Entities)**
   - **Entities**: `Tenant`, `EmployeeReference`.
   - **Rationale**: 
     - `Tenant` uses a custom natural primary key (`tenant_code`).
     - `EmployeeReference` uses `employee_id` as its primary key.
     - Neither can inherit from `BaseEntity` because of PK mismatch. Their repositories will extend the standard TypeORM `Repository` class rather than `BaseRepository`, and we will manually enforce tenant check constraints if needed.

3. **Child / Dependent Entities (Standard TypeORM Entities, Scoped by User)**
   - **Entities**: `Credential`, `Invitation`, `MfaMethod`.
   - **Rationale**: These tables are owned by a `User` (via `user_id`) and do not contain `tenant_code` directly. They do not need `BaseRepository`'s automatic tenant scoping because they are always queried in the context of an already tenant-scoped user. They will be defined as standard TypeORM entities.

---

### Decision 2: Database Schema Synchronization

**Decision**:
- We will write a NestJS/TypeORM database migration under `src/migrations/` to update the database tables so they match the TypeORM entity definitions.
- Specifically, the migration will:
  - Add `deleted_at` TIMESTAMPTZ NULL column to `users`, `external_identities`, `authentication_settings`, and `auth_security_events_outbox` tables to support TypeORM soft-deletion.
  - Add missing `created_at` / `updated_at` timestamps and `version` columns where required by `BaseEntity`.

**Rationale**: Ensures database query execution does not throw "column does not exist" runtime errors, while fully preserving all constraints and keys from `schema.sql`.

---

## Alternatives Considered

### Alternative 1: Avoid using `BaseEntity` and `BaseRepository` entirely
- **Description**: Map all tables to standard TypeORM entities and write custom repositories for every entity.
- **Why Rejected**: This duplicates tenant scoping logic in every repository, violating the "Shared Library-First Approach" and "No Duplication" rules in the Constitution. It increases the risk of cross-tenant data leaks.

### Alternative 2: Add `tenant_code` to all child tables (Credentials, MFA Methods, etc.)
- **Description**: Modify `schema.sql` to add `tenant_code` to all tables to force them to extend `BaseEntity`.
- **Why Rejected**: This introduces unnecessary denormalization and database columns since a user's credentials or MFA methods are already transitively bound to the tenant through the `users` table relationship.

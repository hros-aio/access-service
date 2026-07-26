# Quickstart & Verification Guide: Identity Models

This guide outlines the steps to verify the TypeORM entity mappings against the PostgreSQL schema and run the persistence unit/integration tests.

## Prerequisites

1. **Docker**: Make sure a Docker daemon is running locally for Postgres/Redis test instances.
2. **Node.js**: Ensure Node.js (>=22) and `pnpm` are installed.
3. **Local Database**: Start the local PostgreSQL instance via docker-compose:
   ```bash
   docker compose up -d postgres redis
   ```

## Setup & Database Alignment

Before starting the service, execute the migration to update the base PostgreSQL schema with the standard `BaseEntity` metadata fields (e.g., `deleted_at`, `updated_at`, `version` where missing):

1. **Compile the project**:
   ```bash
   pnpm run build
   ```
2. **Apply migrations**:
   ```bash
   # Run TypeORM migrations to align schema.sql modifications
   npx typeorm-ts-node-commonjs migration:run -d src/config/typeorm.config.ts
   ```

## Verification Scenarios

### Scenario 1: Metadata Validation and Database Connection
Verify that TypeORM successfully loads all entities and validates the schema metadata against the active database schema without mapping discrepancies.

**Execution Command**:
```bash
# Verify NestJS application bootstraps without TypeORM metadata exceptions
pnpm start:dev
```
**Expected Outcome**:
- NestJS application starts successfully.
- No `TypeORM Column Mismatch` or `QueryFailedError: relation does not exist` errors are thrown.
- Database logs show successful tables inspection.

### Scenario 2: Repository Integration Tests
Run the entity integration test suite using real database connections (or in-memory mock repositories if offline).

**Execution Command**:
```bash
# Run identity persistence module tests
pnpm test
```
**Expected Outcome**:
- All tests pass (100% success rate).
- Statements/Functions coverage > 90%, Branches coverage > 85% for files in `src/modules/identity/`.

### Scenario 3: Tenant Isolation Boundary Verification
Ensure that the `BaseRepository` automatic scoping correctly intercepts queries and appends `tenant_code` clauses matching the active request context.

**Verification Steps**:
1. Run repository E2E tests simulating multi-tenant request headers.
2. Verify that queries executed on `UserRepository` under Tenant A do not return users belonging to Tenant B.

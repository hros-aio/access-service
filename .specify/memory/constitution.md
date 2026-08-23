<!--
Sync Impact Report:
- Version change: 1.0.0 -> 1.1.0
- List of modified principles:
  - Core Principles: Refined domain scope to encompass both Authentication and Authorization domains based on updated authentication-prd.md and authorization-prd.md.
  - Section 1 (Project Philosophy & Domain Scope): Expanded to establish domain boundaries and cross-cutting product governance for HROS Access Service (Authentication & Authorization).
  - Section 2 (Architecture Principles): Added authorization evaluation and scope boundary governance (RBAC with User Groups & Scope, Dynamic Matching, Synchronized vs. Immediate Access Revocation).
  - Section 4 (Repository Organization): Updated internal module layout to explicitly reflect Access Service domains (`identity`/`auth`, `users`, `roles`, `permissions`, `user-groups`, `audit`).
  - Section 8 & Development Lifecycle (Security & Audit Standards): Added comprehensive audit immutability, zero-secret logging, dynamic user group resolution, and prompt security revocation rules.
- Added sections:
  - None (expanded existing sections with Authentication and Authorization PRD specifications).
- Removed sections:
  - None.
- Templates requiring updates:
  - .specify/templates/plan-template.md (✅ Validated: fully aligned)
  - .specify/templates/spec-template.md (✅ Validated: fully aligned)
  - .specify/templates/tasks-template.md (✅ Validated: fully aligned)
- Follow-up TODOs:
  - None
-->

# Enterprise HRMS / HROS Backend Constitution

## Core Principles

### I. Clean Architecture & Layering
All service implementations MUST strictly follow Clean Architecture layering: Controller (transport) -> Service (business logic/use case orchestration) -> Repository (data access). Dependencies MUST point inward. A repository MUST NOT call a service. A controller MUST NOT access a repository or database directly. 
- *Rationale*: Enforces strict separation of concerns, keeps transport details independent of business rules, and simplifies testing and maintainability.

### II. Bounded Contexts & Bounded Databases
Each microservice corresponds to a single domain bounded context and MUST own its database schema exclusively. Cross-service database queries or joins are forbidden. Cross-service boundaries are strictly network-enforced and communication MUST happen only via versioned REST APIs or Kafka events.
- *Rationale*: Prevents database-level coupling, allowing individual services to scale and deploy independently without affecting other domains.

### III. Shared Library-First Approach
All domain-agnostic shared infrastructure and utility logic MUST reside in published, versioned shared library npm packages (`@hrms/libs-core`, `@hrms/libs-sql`, and `@hrms/libs-apis`). Duplicate code is forbidden. If a logic pattern is used in three or more places across domain services, it MUST be refactored into a shared library.
- *Rationale*: Avoids logic duplication, standardizes cross-cutting concerns (logging, authentication, database configurations), and makes the entire system easier to update.

### IV. Strict Type Safety & Code Cleanliness
The TypeScript configuration MUST have `strict: true` enabled and must never be bypassed. The use of `any` is forbidden; use `unknown` and narrow the type when shapes are undetermined. Every exported API, function, and class member MUST declare an explicit return type. Functions MUST remain small and focused (under 30 lines where possible).
- *Rationale*: Catches contract violations at compile-time to guarantee that authentication, authorization, payroll, leave, and compliance business rules do not fail silently.

### V. Test-Driven Development & Quality Gates
Every pull request introducing new business logic MUST be covered by unit tests. Mocks MUST be used at architectural boundaries, never within a layer. Integration tests using real databases/cache via Testcontainers are required for persistence logic. CI pipelines MUST enforce strict coverage thresholds: 90% Statements, 90% Functions, and 85% Branches.
- *Rationale*: Prevents regressions, guarantees implementation correctness, and provides a runnable specification of the business rules.

---

## Technical and Operational Standards

### 1. Project Philosophy & Domain Scope
This project is built to deliver an enterprise-grade HRMS / HROS backend (`hrms-access-service` / `auth-svc`). It enforces Clean Architecture, Modular Design, and SOLID design principles. It values the DRY (Don't Repeat Yourself) principle for shared infrastructure, and the KISS (Keep It Simple, Stupid) principle for domain implementations. Solutions MUST prioritize maintainability, reliability, and long-term readability over clever abstractions.

The Access Service comprises two primary domains:
- **Authentication Domain**: Identity verification (Password, Single Sign-On), credential management, user provisioning from workforce events, employment status synchronization, MFA enrollment and verification, session management/revocation, account lockout, IP restriction, and tenant authentication settings.
- **Authorization Domain**: Platform-defined Permission catalog (`resource.action`), Role Matrix and Role management (System & Custom Roles with inviolable protected capabilities), dynamic User Group matching based on employee attributes, User Group Scope (`Self`, `Direct Reportees`, `Company`, `Location`, `Department`, `Tenant-wide`), impact analysis for configuration changes, and authorization synchronization (Sync Now and scheduled reconciliation).

### 2. Architecture Principles
- **SRP (Single Responsibility)**: Split classes and services that perform unrelated functions (e.g., separating token signing from credential hashing or user group dynamic matching from role assignment).
- **OCP (Open/Closed)**: Model extensible behaviors (like authentication providers, MFA methods, notification channels, or user matching strategies) as strategy providers injected via factories rather than branching `if/else` logic.
- **LSP (Liskov Substitution)**: Inherited repositories and entities must fully adhere to base class behaviors without narrowing their contracts.
- **ISP (Interface Segregation)**: Prefer small, client-specific interfaces (e.g., `Readable`, `Writable`) over large repositories.
- **DIP (Dependency Inversion)**: Services depend on repository interfaces or tokens rather than concrete database classes.
- **Dependency Direction**: Within a service, modules can depend on each other only through exported providers (`index.ts`). Across services, dependencies are network-enforced REST/Kafka contracts.
- **Access Propagation & Revocation**: Sensitive access revocations (e.g., user suspension, termination, forced logout, password change, MFA reset, account lock) MUST take effect immediately everywhere. Broad population recalculations (dynamic User Group re-matching) may proceed via synchronized or scheduled reconciliation cycles.

### 3. Technology Standards
- **Framework**: NestJS (latest stable) for opinionated modular structure and first-class DI.
- **Language**: TypeScript (v5.x+) for compile-time safety and self-documenting code.
- **Database**: PostgreSQL (v15+) for relational data modeling, transaction guarantees, and robust indexing.
- **ORM**: TypeORM for native NestJS decorator integration, active-record-free patterns, and migrations.
- **Cache**: Redis for session storage, cached permission lookups, and slow-moving configuration data.
- **Authentication**: JWT RS256 (asymmetric signing). Auth service holds the private key; all other services verify with the public key.
- **Validation**: `class-validator` + `class-transformer` for edge DTO checking, integrated with a global `ValidationPipe` that strips unvalidated fields.
- **Documentation**: Swagger/OpenAPI generated directly from code decorators on controllers and DTOs.
- **Tooling**: ESLint, Prettier, Husky, Commitlint.

### 4. Repository Organization
Repositories are organized as single, deployable standalone services (Polyrepo layout: `hrms-<domain>-service`). Inside each repository, code is structured as NestJS modules:
- `src/modules/<domain>/`: Standard domain module structure:
  - `controllers/`: Thin HTTP handlers, Swagger decorators, DTO mappings. Business logic and direct DB/repository access are forbidden.
  - `services/`: Core business logic, rule validation, transaction management, caching decisions. Service methods MUST NOT access HTTP `Request`/`Response` objects.
  - `repositories/`: Custom query logic, joins, and pagination. Business rule evaluation is forbidden.
  - `entities/`: Database schema representations. Input validation decorators are forbidden.
  - `dto/`: Immutable request/response shapes (using `readonly` fields).
  - `interfaces/` / `enums/`: Compile-time contracts and stable named domain concepts.
  - `index.ts`: Barrel file exposing public providers only. Internal details MUST remain hidden.
- `src/kafka/`: Service-specific consumers and producers for cross-service events (e.g., workforce employee lifecycle sync).
- `src/migrations/`: Service-specific database migrations (one schema per microservice).
- `src/main.ts`: Application bootstrap file configuring global filters, versioning, and Swagger.

#### Access Service Modules Layout (`auth-svc` / `hrms-access-service`)
- `auth`: Login, JWT issuance/refresh, SSO fallback, password reset, MFA verification.
- `users`: User provisioning, account lifecycle, employment status sync.
- `invitations`: Invitation issuance, validation, expiration, and resend.
- `mfa`: Multi-factor enrollment, authenticator app, email codes, admin reset.
- `sessions`: Session tracking, remember-me handling, single/all-device logout, admin forced logout.
- `roles`: Role catalog, System Roles (with protected capabilities), Custom Roles, Role Matrix.
- `permissions`: Platform-defined Permission catalog (`resource.action`), dependency validation.
- `user-groups`: Dynamic matching rules, scope evaluation (`Self`, `Direct Reportees`, `Company`, `Location`, `Department`, `Tenant-wide`), Role assignment, synchronization tracking (Sync Now, scheduled reconciliation).
- `auth-settings`: Tenant authentication settings (mandatory MFA, lockout thresholds, IP allow-lists, self-service reset toggles).
- `audit`: Immutable security audit log producer/recorder.

#### Shared Libraries (Consumed as npm packages)
- **`@hrms/libs-core`**: Contains the `CacheManager`, `AppLogger` (structured JSON logging via Pino), standard exceptions (`BaseException` hierarchy), and stateless utilities.
- **`@hrms/libs-sql`**: Contains the shared TypeORM config, `BaseEntity` (id, timestamps, version, and `deletedAt`), `BaseRepository`, pagination helpers, and `AuditSubscriber`.
- **`@hrms/libs-apis`**: Contains Swagger configuration, URI versioning, CORS rules, `JwtAuthGuard`, `PermissionGuard` (`@Permissions()`), and standard request/response DTOs.

### 5. Coding Standards
- **File Naming**: Pattern `<name>.<type>.ts` in kebab-case and singular domain noun (e.g., `employee-summary.interface.ts`).
- **Code Naming**:
  - Class: PascalCase, suffixed by role (e.g., `EmployeeService`).
  - Interface: PascalCase, without `I` prefix (e.g., `EmployeeSummary`).
  - Type: PascalCase.
  - Enum: PascalCase name, PascalCase or SCREAMING_SNAKE members with explicit string values (e.g., `EmploymentStatus.Active = 'active'`).
  - Method/Function/Variable: camelCase. Verb-first for functions (e.g., `calculateLeaveBalance()`).
  - Boolean: prefix with `is`, `has`, `can`, or `should` (e.g., `isActive`).
  - Constant/Injection Token: SCREAMING_SNAKE_CASE (e.g., `EMPLOYEE_REPOSITORY`).
- **TypeScript Usage**:
  - Prefer `interface` for data contracts; `type` for unions/tuples/utility mappings.
  - Use `class` for NestJS DI targets or TypeORM entities.
  - Use `abstract class` only for shared implementation code (e.g., `BaseRepository`).
  - Do not use default exports; use named exports exclusively.
  - One exported concept per file, matching the filename.
- **File Layout Standard**:
  1. Static readonly fields
  2. Instance fields (injected dependencies first, `private readonly`)
  3. Constructor
  4. Public methods (in caller order)
  5. Private methods (in caller order)
- **Imports**: Grouped and alphabetized: (1) Node modules, (2) `@hrms/libs-*` packages, (3) local relative imports.

### 6. API Standards
- **Restful Naming**: URI paths MUST use plural, kebab-case nouns (e.g., `/auth/sessions`, `/roles`, `/user-groups`).
- **HTTP Mapping**: Map HTTP status codes strictly (200 for successful queries, 201 for creations, 400 for input validation errors, 401 for missing/invalid auth, 403 for insufficient permissions, 404 for missing entities, 409 for conflicts, 422 for business validations, 5xx for infrastructure failures).
- **Generic Error Responses for Auth**: Login, invitation validation, and password reset failures MUST return generic, non-enumerating error messages to clients while logging detailed reasons internally for audit.
- **Versioning**: Versioning is configured in `libs-apis`. Additive changes stay within the same major version; breaking changes require a new version.
- **Pagination**: All list endpoints MUST implement offset/cursor pagination using the `libs-sql` paginate utility. Unbounded `findAll()` is forbidden.
- **Validation**: Incoming requests MUST use class-validator DTOs.
- **Errors**: Domain code throws typed exceptions extending `BaseException`. Global exception filter handles formatting.
- **Responses**: Enforced JSON response structure via `@hrms/libs-apis` `ResponseInterceptor`.
- **Swagger**: Every endpoint and DTO property MUST be fully decorated to maintain OpenAPI spec sync.

### 7. Database Rules
- **Transactions**: Explicit transactions MUST be used for multi-statement writes that require atomic guarantees (e.g., user provisioning + invitation creation, role permission updates). Single-row CRUD operations do not require transactions.
- **N+1 Prevention**: Loops containing database calls (e.g., `await repo.find()`) are strictly forbidden. Use relational joins or DataLoader batching.
- **Optimistic Locking**: Apply `@VersionColumn()` to tables subject to high concurrent updates (e.g., user account state, role matrix configurations). Handle `OptimisticLockVersionMismatchError` gracefully.
- **Soft Delete**: Entities inheriting `BaseEntity` use `deletedAt` for soft-deletion. Hard deletion is reserved for audit-logged GDPR purges.
- **Indexes**: Mandatory on foreign keys, `WHERE` clauses, and list sorting columns. Lead with `tenant_id` for composite keys in multi-tenant schemas.
- **Migrations**: Database updates must use hand-reviewed migrations under `src/migrations/`. `synchronize: false` in non-local environments. Every migration MUST include a `down()` rollback method.

### 8. Cache Rules
- **Redis Integration**: Use the `@hrms/libs-core` `CacheManager` namespaces. Direct `ioredis` imports are forbidden in domain modules.
- **Keys**: Standardized namespacing `<domain>:<entity>:<id>` (e.g., `auth:session:<sessionId>`, `authz:perms:<userId>`).
- **TTL**: Explicit TTLs are mandatory for all cache entries.
- **Invalidation**: Invalidation MUST occur actively in the service layer as part of write transactions.
- **What to cache**: Sessions, resolved RBAC permissions, and slow-moving configuration/settings tables.
- **What not to cache**: In-flight temporary tokens, single-use reset codes, mutable transactional state.

---

## Development Lifecycle, Testing, and Security

### 1. Security Standards
- **Asymmetric JWT Verification**: The authentication service signs tokens with a private key; all other microservices verify tokens using the public key. Symmetric keys are forbidden.
- **Edge Authentication & Session Cookies**: All APIs MUST be authenticated. Browser session cookies MUST use security flags: `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict`), and the name prefix `__Host-` or `__Secure-`.
- **Stateless Tokens**: Validate the `exp` claim and enforce the correct signature algorithm. Reject any token with a `none` algorithm.
- **RBAC & Authorization Guarding**: Access permissions MUST be verified at the controller level using `PermissionGuard` and the `@Permissions()` decorator. Service-level checks verify database resource ownership and User Group Scope boundaries (`Self`, `Direct Reportees`, `Company`, `Location`, `Department`, `Tenant-wide`).
- **System Roles Protection**: Protected capabilities on System Roles (e.g. Employee, Manager, Built-in Administrator) are inviolable and CANNOT be removed by tenant administrators.
- **SQL Injection Prevention**: All queries MUST use TypeORM query builders or parameterized bindings. No string interpolation in SQL sinks.
- **Zero Secrets in Audit Logs**: Full PII (SSN, credit cards) MUST be masked in response bodies (`***-***-1234`). Passwords, password hashes, raw MFA secrets, raw OTP codes, and raw invitation tokens MUST NEVER be written to log files or audit records.
- **Secure File Handling**: Sanitize all uploaded filenames (e.g., using `path.basename()`). Upload directories MUST exist outside the web root, be non-executable, and restrict access through authorization logic. Serve uploads with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- **Process Executions**: Do not pass raw inputs to command sinks (`exec`, `spawn`). Match paths and arguments against a strict allow-list.

### 2. Testing Standards
- **Pyramid Focus**: 70% Unit, 20% Integration, 10% E2E.
- **Unit Tests**: Test classes in isolation, mocking all collaborators. Use Nest's `Test.createTestingModule` + `overrideProvider`. Call `jest.clearAllMocks()` in `afterEach` to prevent test contamination.
- **Integration Tests**: Verify service logic and ORM mappings against PostgreSQL and Redis using Testcontainers. Wrap assertions in database transactions that roll back afterward.
- **E2E Tests**: Use `supertest` against a fully bootstrapped Nest instance. Mock only third-party integrations (emails, external SSO providers).
- **AAA Pattern**: Arrange, Act, Assert blocks MUST be clearly defined and visually separated.
- **Naming**: Test files must follow `<name>.spec.ts` (unit/integration) or `<name>.e2e-spec.ts` (E2E) conventions.

### 3. Performance Principles
- **Database Minimization**: Query only the required columns (avoid `select *`) and request only necessary relations.
- **Batch Processing**: Use queue workers (BullMQ/Kafka) for bulk updates, synchronization jobs, and report generation, returning job tokens immediately to HTTP clients.
- **Bulk CRUD**: Use TypeORM `createQueryBuilder().insert().values([...])` or `upsert()` for multi-row operations instead of looping single saves.
- **Concurrency**: Leverage database optimistic locking to handle concurrent updates rather than pessimistic thread-locking.

### 4. Pull Request Standards
- **Conventional Commits**: Every commit MUST match the conventional commits specification (e.g., `feat(auth): add MFA challenge endpoint`, `fix(authz): enforce role matrix dependency check`).
- **PR Gating**:
  - Standard checklist: All tests pass, lint rules are satisfied, coverage thresholds are met, and manual self-review has removed all debugging leftovers.
  - Reviewer criteria: Thin controllers, focused services under 300 lines, SQL query indexes defined in migrations, complete Swagger documentation.

### 5. AI Agent Rules
Every AI-assisted implementation inside this repository MUST strictly follow these rules:
1. **Constitution First**: Read and follow this constitution before writing any code.
2. **Architecture Integrity**: Never introduce new architectural layers, design patterns, or frameworks without explicit team justification.
3. **Shared First**: Always search and reuse patterns from `@hrms/libs-core`, `@hrms/libs-sql`, and `@hrms/libs-apis` before writing new helper logic.
4. **No Duplication**: Do not copy or duplicate logic within or across modules.
5. **Layout Adherence**: Keep files in their designated folder structure exactly (e.g., controllers in `controllers/`, DTOs in `dto/`).
6. **Business in Services**: Encapsulate all business rules and operations inside NestJS services; keep controllers thin and transport-only.
7. **Database Isolation**: Repositories MUST only interact with the database; do not put business rules or DTO maps inside them.
8. **Composition over Inheritance**: Inject collaborators instead of subclassing (except when extending `BaseRepository`/`BaseEntity`).
9. **Focused Units**: Keep functions short, focused, and single-responsibility.
10. **Production-Ready**: Write clean, fully implemented code. Do not write mock implementations or comments like `// TODO: implement later`.
11. **Auto-Compliance**: Automatically ensure all new files satisfy ESLint naming patterns and Prettier formatting rules.
12. **Testability**: Ensure every new service method is testable in isolation.

---

## Governance

### 1. Supreme Development Document
This Constitution is the single source of truth and supreme development document for the HRMS / HROS backend (`hrms-access-service`). It supersedes all other developer documentation, repository readme files, and local module guidelines. All code commits and pull requests MUST comply with this document.

### 2. Amendment Procedure
Amendments to this Constitution require:
1. Documentation of the proposed change and its engineering justification.
2. Team lead approval.
3. A migration plan if the amendment introduces breaking changes to existing architecture or shared libraries.
4. Updating the version and date below, and adding a record to the Sync Impact Report at the top of this file.

### 3. Versioning Policy
- **MAJOR**: Backward-incompatible governance or architectural changes (e.g., changing JWT RS256 to a different scheme, repository structure redesign).
- **MINOR**: Additions of new principles, sections, or significant expansions of existing rules (e.g., expanding domain scope to include comprehensive Authentication and Authorization PRD mandates).
- **PATCH**: Non-semantic updates, wording clarifications, typos, and formatting fixes.

**Version**: 1.1.0 | **Ratified**: 2026-07-12 | **Last Amended**: 2026-08-23

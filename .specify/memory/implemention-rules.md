# Implementation Rules

Enterprise HRMS Backend — NestJS / TypeScript

This document defines binding implementation rules. `coding-conventions.md` governs *how code looks*; this document governs *how the system is built*.

---

## 1. Architecture Principles

- **Clean Architecture layering:** Controller (transport) → Service (business logic/use case) → Repository (persistence). Dependencies point inward only — a repository never calls a service; a controller never calls a repository directly.
- **Modular design:** every business domain (employee, department, leave, payroll, …) is an isolated NestJS module. Modules expose a narrow public contract (their service's public methods) and hide entities/repositories as internals.
- **SOLID** is enforced at review time, specifically:
  - *SRP*: a service with unrelated responsibilities (e.g. `EmployeeService` sending emails and computing payroll) must be split.
  - *OCP*: extend behavior via new providers/strategies (e.g. a new `NotificationChannel` implementation), not by branching on type inside existing services.
  - *LSP*: subclasses of `BaseRepository`/`BaseEntity` must not narrow or violate the base contract's behavior.
  - *ISP*: prefer several small interfaces (`Readable`, `Writable`) over one large repository interface when consumers only need part of it.
  - *DIP*: services depend on repository **interfaces/injection tokens**, not concrete TypeORM repository classes, where testability across DB engines matters.
- **DRY**: shared logic goes into `libs-core`/`libs-sql`/`libs-apis`. Two occurrences of similar logic is a signal, not yet a violation; three occurrences must be refactored into a shared provider/utility.
- **KISS**: prefer the straightforward solution. Generic/abstracted code is justified only once a second concrete use case exists — do not pre-abstract for hypothetical future needs.
- **Dependency Injection**: all cross-cutting concerns (cache, logger, config, HTTP clients) are injected via Nest providers, never imported and instantiated inline.

## 2. NestJS Rules

| Rule | Detail |
|---|---|
| One module per business domain | `EmployeeModule`, `DepartmentModule`, `LeaveModule`, etc. A module maps 1:1 to a bounded context, not to a single entity — e.g. `LeaveModule` may own `LeaveRequest` and `LeaveType` entities together. |
| Controller only handles HTTP | Route definition, request/response DTO mapping, status codes, Swagger decorators, guard/interceptor wiring. **No business logic, no direct repository/DB access, no try/catch for business errors** (let the global exception filter in `libs-apis` handle it). |
| Service contains business logic | Validation of business rules, orchestration across repositories, transaction boundaries, cache read/write decisions, event emission. Services never touch `Request`/`Response` objects. |
| Repository only accesses database | Query building, joins, pagination cursors. No business rule evaluation, no DTO transformation beyond entity↔row mapping. Repositories extend `BaseRepository` from `libs-sql`. |
| Providers are the extension point | Cross-domain behavior variation (e.g. different approval workflows) is modeled as an injectable strategy provider, resolved via a factory token, not `if/else` chains in the service. |

```typescript
// Controller — transport only
@Post()
async create(@Body() dto: CreateEmployeeDto): Promise<EmployeeResponseDto> {
  const employee = await this.employeeService.create(dto);
  return EmployeeResponseDto.fromEntity(employee);
}

// Service — business logic + transaction boundary
async create(dto: CreateEmployeeDto): Promise<EmployeeEntity> {
  await this.assertEmailIsUnique(dto.email);
  return this.employeeRepository.runInTransaction(async (manager) => {
    const employee = await this.employeeRepository.createWithManager(manager, dto);
    await this.eventBus.publish(new EmployeeCreatedEvent(employee.id));
    return employee;
  });
}
```

## 3. Database Rules

- **Transactions only when necessary**: wrap multi-statement writes that must be atomic (e.g. create employee + create default leave balances). Single-row CRUD does not need an explicit transaction — TypeORM's per-query connection handling covers it.
- **Avoid N+1 queries**: use `relations`/`QueryBuilder` joins or `DataLoader`-style batching for list endpoints. Any loop containing an `await repository.find...` call is a review blocker.
- **Pagination**: every list endpoint uses the cursor/offset pagination helper from `libs-sql`; raw `findAll()` without limits is forbidden on any table expected to grow past a few hundred rows.
- **Indexes**: every foreign key and every column used in a `WHERE`/`ORDER BY` on a list endpoint must have a migration-defined index. Composite indexes for tenant-scoped queries lead with `tenant_id`.
- **Soft delete**: entities extending `BaseEntity` inherit `deletedAt`. Hard deletes are reserved for GDPR-style erasure requests and go through an explicit, audited service method — never a generic `remove()`.
- **Optimistic locking**: apply `@VersionColumn()` on entities subject to concurrent updates (e.g. payroll run status, leave balance) to prevent lost updates; handle `OptimisticLockVersionMismatchError` as a business exception (409).

## 4. Caching Rules (Redis via `libs-core` cache manager)

**Cache:**
- Session data
- Resolved permission sets (role → permission mapping)
- Frequently accessed, slow-changing master data (departments, locations, job titles, leave types)

**Never cache:**
- Mutable transactional data (leave requests, attendance records, payroll runs, anything with an in-flight workflow state)

Rules:
- All cache keys are namespaced: `<domain>:<entity>:<id>` and go through `CacheManager` from `libs-core` — no direct `ioredis` calls in domain modules.
- Every cached key has an explicit TTL; indefinite TTLs require a documented invalidation path (write-through invalidation on the corresponding entity's update/delete).
- Cache invalidation happens in the service layer, in the same method that performs the write, not via a separate cron sweep unless the data is bulk-imported.

## 5. Validation

- Every controller input is a DTO decorated with `class-validator` decorators; no raw `@Body() body: any`.
- Transformation (`class-transformer`) strips unknown fields (`whitelist: true`, `forbidNonWhitelisted: true` at the global `ValidationPipe` level, configured once in `libs-apis`).
- Cross-field or DB-dependent validation (e.g. uniqueness, existence of a referenced department) is **not** a `class-validator` decorator — it's a service-level check that throws a business exception, because it requires a repository call.

## 6. Error Handling

Three exception categories, all extending a common `BaseException` in `libs-core/exceptions`:

| Category | Example | HTTP mapping |
|---|---|---|
| Business exception | `EmployeeAlreadyExistsException`, `InsufficientLeaveBalanceException` | 409 / 422 |
| Validation exception | DTO validation failures (raised automatically by the global `ValidationPipe`) | 400 |
| Infrastructure exception | DB connection failure, Redis timeout, downstream service unavailable | 502 / 503 |

All exceptions are caught by the global exception filter (`libs-apis`), which produces a consistent response envelope and logs with correlation/request IDs. Domain code throws typed exceptions; it never constructs raw `HttpException` inline.

## 7. Logging

- Structured JSON logging via the `AppLogger` in `libs-core` (wraps pino or nestjs-pino) — no `console.log`.
- Every log entry includes: `requestId`, `sessionId` (if authenticated), `tenantCode` (multi-tenant context), `module`, and `level`.
- Request ID and tenant context are attached at the middleware layer and propagated via `AsyncLocalStorage`, so services don't need to thread them through every method signature.
- Log business-significant events at `info` (employee created, leave approved); log validation failures at `warn`; log infrastructure failures at `error` with stack trace.

## 8. Security

- **JWT RS256**: access tokens are signed with the private key (held by the auth service only); all other services verify with the public key. No shared symmetric secret across services.
- **RBAC**: roles and permissions are resolved once per request (cached, see §4) and enforced by the `PermissionGuard` from `libs-apis`, declared per-route via a `@Permissions()` decorator — never checked ad hoc inside a service.
- **Permission validation** happens at the controller boundary via guards; services may re-check ownership/ scoping (e.g. "manager can only approve their own team's leave") as a business rule, not a permission rule.
- **Input validation** per §5 blocks injection at the edge; in addition, all queries use TypeORM parameter binding or the query builder — string-concatenated SQL is forbidden, enforced by lint rule and code review.
- **SQL injection prevention**: no raw `query()` calls with interpolated strings; if raw SQL is unavoidable, use parameterized placeholders exclusively.

## 9. Performance

- Avoid unnecessary joins — select only the relations the endpoint actually returns.
- Avoid `select *` — TypeORM entities specify explicit `select` arrays for list endpoints returning partial projections.
- Batch processing for bulk operations (payroll runs, mass imports) uses queue-backed workers, not synchronous request-handling loops.
- Bulk insert/update uses TypeORM's `createQueryBuilder().insert().values([...])` / `upsert()` rather than looping single-row saves.
- Long-running or non-request-critical work (report generation, notification fan-out) is asynchronous via a queue (BullMQ/Kafka), with the HTTP endpoint returning immediately with a job reference.

## 10. API Versioning

- API versioning configured in `libs-apis`. A new major version is introduced only for breaking changes; additive fields/endpoints stay within the current version.
- Deprecated versions are marked in Swagger (`deprecated: true`) with a documented sunset date before removal.

## 11. Swagger

- Every controller and DTO carries `@ApiTags`, `@ApiOperation`, `@ApiResponse` (success and documented error cases), and DTO property decorators (`@ApiProperty`) — generated purely from code, never hand-written OpenAPI JSON.
- Swagger config itself (bootstrap, auth scheme, server URLs) lives in `libs-apis`; domain modules only decorate.

## 12. Migration Strategy

- All schema changes are TypeORM migrations under `libs-sql/migrations`, generated from entity diffs and reviewed by hand before merge — `synchronize: true` is forbidden outside local sandbox environments.
- Migrations are additive and backward-compatible with the currently deployed application version (expand/contract pattern): add nullable column → deploy code that writes to it → backfill → deploy code that requires it → drop old column in a later migration.
- Every migration has a corresponding `down()` implementation.

## 13. Code Review Checklist

- [ ] Controller has no business logic or direct repository access
- [ ] Service methods are single-responsibility and under ~30 lines where reasonable
- [ ] No `any`, no non-null assertions without justification
- [ ] DTOs validated with `class-validator`; no unchecked `@Body()`
- [ ] No N+1 query patterns; pagination applied to list endpoints
- [ ] New/changed queries have supporting indexes in the migration
- [ ] Transactions used where multi-statement atomicity is required
- [ ] Cache reads/writes go through `CacheManager`; no direct Redis client usage; TTL set
- [ ] Exceptions are typed (`BaseException` subclasses), not raw `HttpException`
- [ ] Logging includes structured context, no `console.log`
- [ ] New permissions/roles enforced via `@Permissions()` + `PermissionGuard`
- [ ] Swagger decorators complete and accurate for all new/changed endpoints
- [ ] Unit tests cover new service logic; coverage thresholds met (see `testing-strategy.md`)
- [ ] Migration included for any entity change, with a working `down()`

## 14. Pull Request Checklist

- [ ] PR title follows Conventional Commits format (see `tech-stack.md`)
- [ ] Linked to a ticket/issue
- [ ] Description explains **what** changed and **why**, not just what files changed
- [ ] Screenshots/Swagger diff attached for new/changed endpoints where relevant
- [ ] `pnpm lint` and `pnpm test` pass locally and in CI
- [ ] No decrease in coverage thresholds
- [ ] Breaking changes called out explicitly, with a migration/rollout note
- [ ] Self-reviewed diff before requesting review (no debug code, no commented-out blocks, no stray console output)
- [ ] At least one reviewer from the owning domain team has approved
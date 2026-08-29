# Implementation Plan: Matching Population Visibility

**Branch**: `020-matching-population-visibility` | **Date**: 2026-08-29 | **Spec**: [spec.md](file:///home/ren0503/new-hros/admin-module/auth-svc/specs/020-matching-population-visibility/spec.md)

**Input**: Feature specification from `specs/020-matching-population-visibility/spec.md`

## Summary

Provide tenant administrators with transparent, immediate, and responsive visibility into which employees match a User Group's dynamic criteria — both for currently saved/active groups (materialized members) and during draft/in-flight criteria editing (live preview) — without blocking the UI or executing unbounded full-table scans.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: NestJS, TypeORM, `@new-hros/libs-core`, `@new-hros/libs-sql`, `@new-hros/libs-apis`, `class-validator`, `class-transformer`  
**Storage**: PostgreSQL 15+ (`employee_references`, `user_groups`, `user_group_memberships`)  
**Testing**: Jest (Unit, Integration & E2E tests)  
**Target Platform**: Linux / Containerized Node.js Microservice  
**Project Type**: Web Service (`hros-access-service` / `auth-svc`)  
**Performance Goals**: Sub-500ms paginated materialized member queries up to 10,000 members; Sub-1s non-committing draft preview queries on projections up to 100,000 employees; strictly bounded sample listing (max 50 records)  
**Constraints**: Parameterized SQL queries only (no raw string concatenation); strict tenant isolation via `RequestContextService`; zero state mutations or sync jobs on read/preview queries; sensitive PII exclusion  
**Scale/Scope**: Multi-tenant enterprise SaaS supporting dynamic employee group membership inspection and preview  

## Constitution Check

*GATE: Passed before Phase 0 research and re-validated post Phase 1 design.*

- **Clean Architecture & Layering**: Controller (`UserGroupPopulationController`) -> Services (`UserGroupPopulationQueryService`, `UserGroupMatchingEngine`) -> Repositories (`UserGroupMembershipRepository`, `UserGroupRepository`, `EmployeeReferenceRepository`). **[PASS]**
- **Bounded Contexts**: Schema and tables owned exclusively by `hros-access-service`. Queries run against internal `user_group_memberships` and `employee_references` read model. **[PASS]**
- **Shared Library-First**: Reuses `RequestContextService` (`@new-hros/libs-core`), `TransactionService` & `BaseRepository` (`@new-hros/libs-sql`), and `@ApiBearerAuth()` / `@ApiResponse()` (`@new-hros/libs-apis`). **[PASS]**
- **Type Safety & Code Quality**: Strict typing with DTOs (`MatchedMemberDto`, `PreviewMatchingResponseDto`), domain value objects (`MatchingRule`), and explicit return types without `any`. **[PASS]**
- **Security & Data Minimization**: Non-mutating queries emit zero events; responses exclude sensitive PII; queries strictly filter by `tenant_code`. **[PASS]**

## Project Structure

### Documentation (this feature)

```text
specs/020-matching-population-visibility/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── user-group-population.openapi.yaml
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
└── modules/
    ├── employee/
    │   └── entities/
    │       └── employee-reference.entity.ts
    └── user-groups/
        ├── controllers/
        │   ├── user-group-population.controller.ts
        │   └── user-group-population.controller.spec.ts
        ├── domain/
        │   ├── value-objects/
        │   │   └── matching-rule.vo.ts
        │   └── validators/
        │       └── matching-rule.validator.ts
        ├── dto/
        │   ├── matching-rule.dto.ts
        │   ├── preview-matching.dto.ts
        │   └── user-group-details.dto.ts
        ├── entities/
        │   ├── user-group.entity.ts
        │   └── user-group-membership.entity.ts
        ├── repositories/
        │   ├── user-group.repository.ts
        │   └── user-group-membership.repository.ts
        └── services/
            ├── user-group-matching.engine.ts
            ├── user-group-matching.engine.spec.ts
            ├── user-group-population-query.service.ts
            └── user-group-population-query.service.spec.ts
```

## Implementation Phases & Validation Plan

### Phase 1: Materialized Member Listing & Count Data Access
- Verify `UserGroupMembershipRepository.findMembershipsByGroup` performs deterministic joined pagination against `employee_references`.
- Verify `UserGroupPopulationQueryService.getMatchingPopulation` enforces tenant isolation and 404 for cross-tenant group IDs.

### Phase 2: Dynamic Criteria Preview Query Builder
- Verify `UserGroupMatchingEngine.buildMatchingQuery` validates closed vocabulary against allow-lists.
- Verify `UserGroupPopulationQueryService.previewCriteriaPopulation` executes bounded sample preview and count queries cleanly without state mutations.

### Phase 3: Controller & HTTP Integration
- Expose `GET /user-groups/:id/members` and `POST /user-groups/preview-matching` in `UserGroupPopulationController`.
- Enforce `user_group.view` permission and tenant context injection.

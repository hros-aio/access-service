# Implementation Plan: Dynamic Matching Criteria & Population Evaluation

**Branch**: `019-user-group-dynamic-matching` | **Date**: 2026-08-28 | **Spec**: [spec.md](file:///home/ren0503/new-hros/admin-module/auth-svc/specs/019-user-group-dynamic-matching/spec.md)

**Input**: Feature specification from `/specs/019-user-group-dynamic-matching/spec.md`

## Summary

Implement dynamic matching criteria evaluation and automatic population reconciliation for User Groups in `hros-access-service`. This includes:
1. Extending `employee_references` read model projection with organizational attributes, direct manager reference, derived `reportees_count`, and monotonic `source_version` idempotency.
2. Expanding the closed-vocabulary `MatchingRuleValidator` and domain models.
3. Implementing the pure in-memory `UserGroupMatchingEngine` and safe parameterized SQL translator for tenant population matching.
4. Implementing the transactional `MembershipReconciler` for atomic diff calculation across `user_group_memberships` and `user_effective_roles`.
5. Implementing `EmployeeAttributePropagationService` using the `rule_attribute_keys` index to avoid unbounded table scans on attribute changes.
6. Extending Kafka consumers for employee lifecycle and reporting-line change events.
7. Implementing the `UserGroupPopulationQueryService` and controller endpoints for member pagination, previewing criteria, and estimating diff impacts.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: NestJS, TypeORM, `@new-hros/libs-core`, `@new-hros/libs-sql`, `@new-hros/libs-apis`, `class-validator`, `class-transformer`  
**Storage**: PostgreSQL 15+ (`employee_references`, `user_groups`, `user_group_memberships`, `user_effective_roles`, `auth_security_events_outbox`)  
**Testing**: Jest (Unit, Integration & E2E tests)  
**Target Platform**: Linux / Containerized Node.js Microservice  
**Project Type**: Web Service (`hros-access-service` / `auth-svc`)  
**Performance Goals**: Sub-10ms single-employee attribute propagation; safe parameterized set matching; minimal diff updates to effective authorization tables; zero SQL injection vectors  
**Constraints**: Pure evaluation functions without dynamic code execution; strict tenant isolation via `RequestContext`; idempotent event handling via `source_version`  
**Scale/Scope**: Multi-tenant enterprise SaaS supporting dynamic employee group membership evaluation  

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Clean Architecture & Layering**: Controller (`UserGroupController`) -> Services (`UserGroupMatchingEngine`, `EmployeeAttributePropagationService`, `MembershipReconciler`, `UserGroupPopulationQueryService`) -> Repositories (`EmployeeReferenceRepository`, `UserGroupMembershipRepository`, `UserEffectiveRoleRepository`). **[PASS]**
- **Bounded Contexts**: Schema and tables owned exclusively by `hros-access-service`. `employee_references` is an internal read-model projection. **[PASS]**
- **Shared Library-First**: Reuses `RequestContextService` (`@new-hros/libs-core`), `TransactionService` & `BaseEntity` (`@new-hros/libs-sql`), and standard response decorators (`@new-hros/libs-apis`). **[PASS]**
- **Type Safety & Code Quality**: Strict typing with domain value objects (`MatchingRule`, `RuleClause`), explicit return types, and zero `any`. **[PASS]**
- **Security & Immutability**: All membership and role adjustments emit security audit records into `auth_security_events_outbox` within the same database transaction. Parameterized SQL queries prevent SQL injection. **[PASS]**
- **Optimistic Locking & Idempotency**: Handled via `source_version` on `employee_references` and `version` on `user_groups`. **[PASS]**

## Project Structure

### Documentation (this feature)

```text
specs/019-user-group-dynamic-matching/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── user-group-matching.openapi.yaml
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── kafka/
│   └── consumers/
│       ├── employee-lifecycle.consumer.ts
│       └── employee-lifecycle.consumer.spec.ts
└── modules/
    ├── employee/
    │   ├── entities/
    │   │   └── employee-reference.entity.ts
    │   └── repositories/
    │       ├── employee-reference.repository.ts
    │       └── employee-reference.repository.spec.ts
    └── user-groups/
        ├── controllers/
        │   └── user-group-population.controller.ts
        ├── domain/
        │   ├── value-objects/
        │   │   └── matching-rule.vo.ts
        │   ├── validators/
        │   │   └── matching-rule.validator.ts
        │   └── exceptions/
        │       └── user-group.exceptions.ts
        ├── dto/
        │   ├── matching-rule.dto.ts
        │   ├── preview-matching.dto.ts
        │   └── criteria-impact.dto.ts
        ├── entities/
        │   ├── user-group-membership.entity.ts
        │   └── user-effective-role.entity.ts
        ├── repositories/
        │   ├── user-group-membership.repository.ts
        │   └── user-effective-role.repository.ts
        ├── services/
        │   ├── user-group-matching.engine.ts
        │   ├── user-group-matching.engine.spec.ts
        │   ├── membership-reconciler.service.ts
        │   ├── membership-reconciler.service.spec.ts
        │   ├── employee-attribute-propagation.service.ts
        │   ├── employee-attribute-propagation.service.spec.ts
        │   ├── user-group-population-query.service.ts
        │   └── user-group-population-query.service.spec.ts
        └── user-group.module.ts
```

**Structure Decision**: Conforms to NestJS domain module structure defined in Constitution Section 4.

## Complexity Tracking

> *No violations found. Clean standard layering, domain validation engine, and platform library reuse.*

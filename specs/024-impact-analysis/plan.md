# Implementation Plan: Pre-Commit Impact Analysis & High-Impact Warnings

**Branch**: `024-impact-analysis` | **Date**: 2026-08-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/024-impact-analysis/spec.md`

## Summary

Implement pre-commit impact analysis to calculate and surface the blast radius (gross gains vs gross losses) and critical single-holder coverage loss before committing changes to Roles and User Groups. Enforce a blocking two-step confirmation workflow for mutations classified as high-impact (exceeding 100 affected users).

## Technical Context

**Language/Version**: TypeScript 5.x (strict: true)
**Primary Dependencies**: NestJS, TypeORM, `@new-hros/libs-core`, `@new-hros/libs-sql`, `@new-hros/libs-apis`
**Storage**: PostgreSQL 15+ (read-only set-based diffing queries against `employee_references`, `user_group_memberships`, `user_effective_roles`)
**Testing**: Jest (Unit & Integration) with Testcontainers
**Target Platform**: Linux / Node.js
**Project Type**: NestJS Web Service (`hrms-access-service` / `auth-svc`)
**Performance Goals**: Sub-second execution for impact preview calculations
**Constraints**: Zero database mutations or dirty state flags during estimation; strict multi-tenant isolation
**Scale/Scope**: Up to tens of thousands of employee reference records per tenant

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Clean Architecture & Layering**: Controller -> Service -> Repository hierarchy maintained.
- **Tenant Isolation**: All impact queries strictly bind `tenant_code`.
- **Zero Secret Exposure**: Previews return aggregated counts and metadata; no PII leaks.
- **Transactional Consistency**: Commits on confirmed high-impact changes persist entity updates and outbox audit events atomically.

## Project Structure

### Documentation (this feature)

```text
specs/024-impact-analysis/
├── plan.md              # This file
├── research.md          # Research decisions and rationale
├── data-model.md        # Data models and DTO structures
├── quickstart.md        # Validation scenarios
├── contracts/           # API interface contracts
│   └── impact-analysis-api.contract.md
└── tasks.md             # Implementation tasks (generated via /speckit-tasks)
```

### Source Code Layout

```text
src/modules/impact-analysis/
├── controllers/
│   └── impact-analysis.controller.ts
├── dto/
│   ├── impact-estimate.dto.ts
│   ├── preview-role-impact.dto.ts
│   └── preview-user-group-impact.dto.ts
├── exceptions/
│   └── impact-analysis.exceptions.ts
├── interfaces/
│   └── impact-analysis.interface.ts
├── repositories/
│   └── impact-analysis.repository.ts
├── services/
│   └── impact-analysis.service.ts
├── impact-analysis.module.ts
└── index.ts
```

**Structure Decision**: A dedicated `impact-analysis` module encapsulates read-only blast radius calculation logic, shared by Role and User Group application services.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| None | N/A | Follows existing clean architecture and module conventions |

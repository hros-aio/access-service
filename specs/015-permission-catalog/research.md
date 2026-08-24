# Phase 0: Outline & Technical Research - Permission Catalog & Dependency Matrix

## Executive Summary
This document formalizes the technical research, architecture decisions, and boundary constraints for the **Permission Catalog & Dependency Matrix** domain module within `hros-access-service`. Per ADR-A2 and SYSTEM_OVERVIEW §5, the permission catalog represents a static, platform-owned, code-defined capability graph. It resides purely in-memory and in static build artifacts with zero PostgreSQL or Redis runtime read dependencies.

---

## Key Technical Decisions & Rationale

### 1. In-Memory Graph Index & Catalog Parser
- **Decision**: Define canonical platform capabilities in a static YAML artifact (`permission-catalog.yaml`) parsed at application bootstrap by `PermissionCatalogLoader`. Maintain indexed in-memory immutable structures (`Map<PermissionCode, PermissionDefinition>`, grouped module/resource hierarchies, and a directed dependency graph `PermissionDependencyGraph`).
- **Rationale**: 
  - Capabilities are defined by application code and code-level guards, not by tenant runtime administrators.
  - Eliminates database round trips and schema migrations for compile-time constants.
  - Provides $O(1)$ lookups and fast in-memory graph traversals.
- **Alternatives Considered**:
  - *Database `permissions` table with foreign keys*: Rejected per ADR-A2, ADR-A4, and SYSTEM_OVERVIEW §42 (would incorrectly suggest runtime tenant editability and introduce unnecessary DB I/O).
  - *Hardcoded TypeScript objects*: Rejected because YAML provides a human-readable, easily auditable static format that simplifies contract code-generation across polyrepo consumers.

### 2. Startup DAG Validation & Health Probe Readiness Gate
- **Decision**: Execute structural DAG validation during `PermissionCatalogModule.onModuleInit()`. Check for dangling prerequisites, unknown codes, invalid naming formats, and cycles using Tarjan's or DFS cycle-detection algorithm. Fail the NestJS startup / Kubernetes readiness probe immediately on any validation failure.
- **Rationale**:
  - Catches catalog defects and breaking dependency changes in CI and during pod startup before receiving any live traffic (fail-fast principle per SYSTEM_OVERVIEW §36).
  - Guarantees that production request paths never encounter cyclic recursion or unresolvable capabilities.
- **Alternatives Considered**:
  - *Lazy validation on first role save*: Rejected because a broken catalog could evade detection during deployment and crash user transactions later.

### 3. Full-Set Dependency Validation Engine (`PermissionDependencyService`)
- **Decision**: Implement an in-memory validation engine that validates an entire requested permission set (represented as a `Set<string>`) against the loaded dependency graph.
  - **Prerequisite Enforcement (Grant)**: For any granted code $c$, all immediate and transitive prerequisites $\text{req}(c)$ must be present in the set.
  - **Dependent Cascade Retention (Revoke)**: For any removed code $c$, no active code $d$ in the resulting set may have $c \in \text{transitive\_req}(d)$.
  - **Deprecation Enforcement**: Reject addition of deprecated codes to new/updated roles.
  - **Naming & Known Code Enforcement**: Reject any code not matching `^[a-z_]+(\.[a-z_]+)+$` or missing from the catalog.
- **Rationale**:
  - Evaluating against the entire resulting set (rather than delta diffs) guarantees total state integrity regardless of concurrent or out-of-order delta operations.
  - Provides structured, user-friendly conflict details for admin feedback.
- **Alternatives Considered**:
  - *Incremental diff validation*: Rejected because diffs can miss compound transitive prerequisites when multiple permissions are toggled concurrently.

### 4. Polyrepo Contract Generation & Export (`@hros/libs-contracts`)
- **Decision**: Implement a build script / generator that parses `permission-catalog.yaml` and exports:
  - TypeScript `const enum` / union types for `PermissionCode`.
  - Grouping metadata (`module`, `resource`, `entry`).
  - Encapsulate the internal dependency graph (`requires`), exposing only types and metadata to external frontend and backend repositories.
- **Rationale**:
  - Enforces polyrepo type safety and prevents identifier drift between frontend UI, access service, and downstream business modules.
  - Encapsulates dependency enforcement logic strictly inside `hros-access-service`.
- **Alternatives Considered**:
  - *Manual typing in `@hros/libs-contracts`*: Rejected due to high risk of human error and divergence from the YAML definition.

### 5. Read-Only Query API (`PermissionCatalogController`)
- **Decision**: Expose `GET /permissions/catalog` and `GET /permissions/dependencies` protected by `JwtAuthGuard` and administrative permissions. Omit all HTTP mutation endpoints (POST/PUT/DELETE/PATCH).
- **Rationale**:
  - Read-only endpoints allow the Role Matrix frontend to render the capability hierarchy and display interactive dependency warnings.
  - Omitting mutation routes structurally prevents unauthorized runtime catalog tampering.

---

## Technical Constraints & Verification Matrix

| Area | Constraint | Verification Method |
|---|---|---|
| Persistence | Zero PostgreSQL queries or tables for permissions | Unit tests & integration test assertions (zero DB connections used during catalog load) |
| Latency | $O(1)$ memory lookup; $<500\text{ms}$ API response | In-memory `Map` lookup benchmarking & Supertest API tests |
| Cycle Detection | $O(V + E)$ cycle detection on bootstrap | Unit tests with cyclic YAML fixtures asserting `CyclicPermissionDependencyError` |
| Security | Admin authentication & tenant context enforcement | API tests verifying 401/403 on missing or unprivileged tokens |

# Phase 1: Data Model & In-Memory Aggregate Specification

## Domain Model Overview
The Permission Catalog domain operates purely in memory with no database tables, schemas, or TypeORM entities. The domain consists of immutable aggregate values and dependency graphs parsed from static YAML.

---

## 1. Value Objects & In-Memory Entities

### `PermissionDefinition` (Immutable Value Object)
Represents a single discrete capability defined by the platform.

```typescript
export interface PermissionDefinition {
  /** Canonical identifier adhering to 'resource.action' (e.g., 'location.view') */
  readonly id: string;
  
  /** Business module grouping (e.g., 'setting', 'directory', 'leave', 'payroll') */
  readonly module: string;
  
  /** Target domain resource (e.g., 'location', 'employee', 'role') */
  readonly resource: string;
  
  /** Action verb (e.g., 'view', 'create', 'update', 'delete', 'approve') */
  readonly action: string;
  
  /** Immediate prerequisite capability IDs required to exercise this permission */
  readonly requires: readonly string[];
  
  /** Flag indicating whether this permission qualifies as a top-level navigation entry point */
  readonly entry: boolean;
  
  /** Whether the permission is marked for deprecation */
  readonly deprecated: boolean;
  
  /** Optional ISO timestamp when deprecation occurred */
  readonly deprecatedAt?: string;
  
  /** Optional platform release version when permission will be removed */
  readonly removedInVersion?: string;
}
```

### `ModuleResourceGroup` (Hierarchical Presentation Model)
Represents the structured tree rendered in the Role Matrix UI.

```typescript
export interface ModuleResourceGroup {
  readonly module: string;
  readonly resources: {
    readonly resource: string;
    readonly permissions: readonly PermissionDefinition[];
  }[];
}
```

### `PermissionDependencyGraph` (Directed Acyclic Graph Model)
Represents the in-memory directed graph of capability dependencies.

```typescript
export interface DependencyNode {
  readonly id: string;
  readonly definition: PermissionDefinition;
  /** Direct outgoing edges: permissions that this permission requires */
  readonly prerequisites: ReadonlySet<string>;
  /** Direct incoming edges: permissions that require this permission */
  readonly dependents: ReadonlySet<string>;
}

export interface PermissionDependencyGraph {
  readonly nodes: ReadonlyMap<string, DependencyNode>;
  readonly adjacencyList: ReadonlyMap<string, ReadonlySet<string>>;
  readonly reverseAdjacencyList: ReadonlyMap<string, ReadonlySet<string>>;
}
```

---

## 2. Validation & Service Domain Contracts

### `ValidationResult`
The output of permission set dependency evaluation.

```typescript
export interface DependencyViolation {
  readonly code: string;
  readonly type: 'MISSING_PREREQUISITE' | 'BLOCKED_BY_DEPENDENT' | 'DEPRECATED_CODE' | 'UNKNOWN_CODE';
  readonly message: string;
  readonly conflictCodes: readonly string[];
}

export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly DependencyViolation[];
}
```

---

## 3. Persistent Storage Model
**PostgreSQL Tables**: None. Per ADR-A2, ADR-A4, and SYSTEM_OVERVIEW §42, storing permissions in a database table or creating foreign keys from `role_permissions` to any permissions table is strictly prohibited.
- `role_permissions` (managed by `RoleModule`) stores validated `permission_code` strings without a database foreign key to a permissions table.

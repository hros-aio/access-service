# Phase 0 Research: Matching Population Visibility

**Feature**: Matching Population Visibility  
**Branch**: `020-matching-population-visibility`  
**Date**: 2026-08-29  

## Technical Investigation & Architectural Decisions

### 1. Materialized Population Access vs. On-the-Fly Dynamic Evaluation

- **Context**: Administrative views of saved/active User Groups need to display matching population counts and paginated employee records without evaluating complex criteria on every read.
- **Decision**: Query directly from `user_group_memberships` joined with `employee_references` read model projection.
- **Rationale**: User Group dynamic matching asynchronously synchronizes and materializes members into `user_group_memberships`. Reading from the materialized join provides deterministic, index-backed $O(\text{limit})$ pagination and $O(1)$ indexed count without re-evaluating dynamic criteria rules or causing unbounded scans across the workforce table.
- **Alternatives Considered**: Evaluating matching rules on every read request. Rejected because it would cause high query latency, unbounded database scans on large employee projections, and inconsistent pagination.

### 2. Non-Committing Real-Time Criteria Preview Engine

- **Context**: When tenant administrators compose or edit draft matching rules in the UI, they require live feedback showing the total matching count and a sample subset of matching employees.
- **Decision**: Execute a two-query parameterized builder against `employee_references`:
  1. `SELECT COUNT(*)` with criteria conditions for total matching population.
  2. `SELECT ... FROM employee_references WHERE <criteria> LIMIT 50` for sample employee previews.
- **Rationale**: Splitting count and bounded sample queries allows postgres to optimize execution paths while strictly enforcing sample bounds (up to 50 records) and preventing memory bloating. Enforcing parameterized SQL with a strict closed vocabulary (`MatchingRuleValidator`) guarantees zero SQL injection risks and strict adherence to valid projection columns.
- **Alternatives Considered**: In-memory filtering of all tenant employees. Rejected due to memory overhead and latency on tenants with tens of thousands of employees.

### 3. Closed-Vocabulary Validation and Combinator Constraints

- **Context**: Preview requests accept raw user-defined matching criteria clauses.
- **Decision**: Enforce strict closed allow-lists via `MatchingRuleValidator`:
  - **Attributes**: `employmentStatus`, `companyId`, `locationId`, `departmentId`, `gradeId`, `jobTitleId`, `reporteesCount`, `hasReportees`.
  - **Operators**: `eq`, `neq`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `exists` (and legacy equivalents `equals`, `not_equals`, `greater_than`, etc.).
  - **Combinator**: strictly `"all"` / `"AND"` logic.
- **Rationale**: Matches the system architecture governance and prevents malformed AST execution or unbounded query complexity.
- **Alternatives Considered**: Allowing arbitrary SQL predicates or dynamic OR conditions. Rejected due to security, index optimization, and performance constraints.

### 4. Tenant Isolation and Security Guarding

- **Context**: Population queries and preview calculations must strictly isolate data per tenant and enforce administrative permissions.
- **Decision**: 
  - Derive `tenantCode` from `RequestContextService.getTenantCode()` (`AsyncLocalStorage`) for all repository queries and SQL bindings.
  - Enforce permission `user_group.view` (or `user_group.read`) via NestJS guards (`JwtAuthGuard`, `PermissionGuard`).
  - Strip all sensitive PII (salary, bank info, tax ID) by only projecting non-sensitive administrative workforce attributes from `employee_references`.
- **Rationale**: Complies with Constitution Section 1, Section 8, and multi-tenant security architecture principles.

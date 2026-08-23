# Authorization / Role & Permission Management Product Requirements Document

## 1. Document Information

| Field             | Value                                                                |
| ----------------- | -------------------------------------------------------------------- |
| **Product**       | HROS Platform (Multi-Tenant SaaS)                                    |
| **Module**        | Access Service — Authorization Domain (Role & Permission Management) |
| **Owner**         | Product Management                                                   |
| **Version**       | 1.0                                                                  |
| **Status**        | Approved                                                             |
| **Approval Date** | August 22, 2026                                                      |

**Related domains (not covered in this document):** Authentication (identity verification, sessions, credentials), Approval Chain (workflow routing), Workforce/Directory (employee master data). These are separate product domains and are referenced here only where an Authorization capability depends on or hands off to them.

---

## 2. Objective

### 2.1 Background

Every capability inside HROS — viewing a location, approving a leave request, updating an employee record — is a business action that some users should be allowed to perform and others should not. Authentication (a separate domain) answers "is this really the person they claim to be?" This domain answers the next question: **"now that we know who they are, what are they allowed to do, and to whom?"**

HROS is sold to organizations ranging from small businesses to enterprises with tens of thousands of employees. Each tenant has its own organizational structure, its own job families, and its own idea of who should be able to do what. A platform that hard-codes access ("HR can do X, Managers can do Y") cannot serve this range of customers. Instead, HROS gives every tenant a predefined catalog of business capabilities (**Permissions**), lets administrators bundle those capabilities into **Roles**, and lets administrators apply Roles to their workforce automatically through **User Groups** — populations of employees defined by shared business characteristics rather than manually maintained lists.

This model must stay simple enough for a non-technical HR administrator to operate confidently, while remaining precise enough to satisfy the security expectations of an enterprise customer's compliance team: nobody has more access than intended, access changes take effect within an understood and predictable timeframe, and every administrative change is traceable.

### 2.2 Problem Statement

Today, the product needs a single, coherent way to:

- Let the HROS platform define _what_ capabilities exist, while tenant administrators decide _who_ has them — without tenants ever being able to invent, rename, or delete a platform-defined capability.
- Let administrators assemble capabilities into Roles that reflect their organization's job functions, using both platform-provided starting points and fully custom roles.
- Let administrators apply Roles to the right people automatically, as an outcome of who an employee is and how the organization is structured — not through manual, one-by-one assignment to tens of thousands of employees.
- Let a Role apply to a bounded, understandable slice of the organization (for example, "a Manager's `employee.view` capability only reaches their own direct reports") rather than granting tenant-wide reach by default.
- Make the potential impact of an authorization change visible _before_ an administrator commits it, given that a single change to a Role or a User Group's rule can affect a handful of people or an entire workforce.
- Guarantee that when an administrator explicitly revokes sensitive access, that revocation is felt promptly — while still allowing broad, low-urgency population recalculations to be synchronized in a controlled, predictable way rather than instantly and disruptively for everyone at once.
- Produce a complete, trustworthy administrative record of every authorization change, sufficient for a customer's security and compliance review.

Without a clearly specified Authorization domain, tenants risk over-privileged or under-privileged users, administrators risk making changes without understanding their blast radius, and the platform risks being unable to answer a basic compliance question: "who can do this, and why?"

### 2.3 Goals

1. Tenant administrators can see, at a glance, exactly which business capabilities any Role currently grants, organized in a way that mirrors how they think about their business (by module and by action).
2. Administrators can build Roles — from platform-provided starting points or entirely from scratch — that match their organization's actual job functions, without engineering involvement.
3. Access is delivered to the right employees automatically, as a byproduct of who they are and how the organization changes, not as a manual administrative chore performed for every hire, promotion, or reorganization.
4. A Role's reach is bounded to an understandable population by default, so granting a capability to "Managers" does not silently mean "every employee in the company."
5. No authorization change is ever made blind: administrators can see, before committing a change, roughly how many people and which population will be affected.
6. Authorization changes reach the affected users within a timeframe appropriate to their sensitivity: promptly for deliberate, security-sensitive revocations, and through a predictable, visible synchronization process for broad population recalculations.
7. Every meaningful authorization administration action is recorded in a manner suitable for a customer's compliance review.
8. A tenant's Roles, User Groups, and authorization configuration are never visible to, or able to affect, any other tenant.

### 2.4 Non-Goals

- This document does not define _how_ authorization decisions are technically evaluated, cached, stored, computed, or propagated. Those are System Architecture concerns.
- This document does not introduce a general-purpose policy language, expression engine, or rule-authoring syntax for administrators. Matching criteria and scope are expressed only through the specific business concepts defined here (Section 4), not through an open-ended condition builder.
- This document does not define the platform's initial catalog of every Permission, Role, or User Group HROS ships with — only the model by which such things exist and are managed.
- This document does not cover Authentication (identity verification, sessions, credentials, login) or the Approval Chain domain (workflow routing), except at the points where Authorization hands off to or depends on them.
- This document does not define how quickly, in technical terms, a synchronization completes. It defines only the business-visible states and expectations administrators should see.

### 2.5 Business Value

- **Lets every tenant model its own organization** without engineering involvement, regardless of how large or how organizationally distinct the tenant is.
- **Reduces the administrative burden of workforce change.** Access follows organizational reality (new hires, promotions, reorganizations, terminations) automatically instead of requiring administrators to remember to update access for every affected person.
- **Bounds the blast radius of human error.** Impact visibility before high-impact changes, and scoped rather than tenant-wide-by-default access, both reduce the chance that a well-intentioned change silently over- or under-grants access.
- **Closes a critical security gap** by ensuring sensitive access revocations are never left pending indefinitely just because a broad synchronization mechanism exists for less urgent changes.
- **Supports enterprise sales and compliance reviews** by making "who can do what, to whom, and why" a fully answerable, fully auditable question.

### 2.6 Success Metrics

| Metric                                                                                     | Target                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Employees whose access is kept current without manual per-employee administrative action   | ≥ 95% of workforce changes (hire, org change, termination) result in correct access with zero manual re-assignment                             |
| Administrator ability to see impact before a high-impact change                            | 100% of Role and User Group changes affecting more than a defined threshold of users display an impact estimate before the change is confirmed |
| Time from a deliberate, sensitive access revocation to that access no longer being usable  | Prompt and bounded — treated as a security SLA, not a best-effort background task                                                              |
| Time for a broad, non-sensitive population recalculation to fully reach all affected users | Within one scheduled reconciliation cycle if not manually synchronized sooner                                                                  |
| Support tickets related to "why can/can't this user do X" per 1,000 active users / month   | Downward trend release over release; target set post-launch baseline                                                                           |
| Customer security/compliance review pass rate for the Authorization capability             | 100% of standard enterprise security questionnaires answered "yes" without exception                                                           |
| Cross-tenant authorization data leakage incidents                                          | Zero                                                                                                                                           |

---

## 3. Scope

### 3.1 In Scope

- A platform-defined catalog of Permissions representing business capabilities, viewable by tenant administrators but never creatable, renameable, or deletable by them.
- A Role Matrix administration experience for viewing and assigning Permissions to Roles, grouped by HROS module/resource, including permission dependency behavior (e.g., an action capability requiring its corresponding view capability).
- Role Management: platform-provided System Roles (some with protected, non-removable capabilities) and tenant-created Custom Roles, including creation, editing, viewing, activation/deactivation, and copying.
- User Groups: tenant-defined populations of employees, matched automatically against employee business attributes, with one or more Roles assigned to the group.
- User Group Scope: the business population or organizational boundary within which a User Group's assigned Roles apply (e.g., Self, Direct Reportees, Company, Location, Department, Tenant-wide).
- Dynamic, automatic re-evaluation of User Group membership as employee attributes and organizational structure change.
- Impact visibility for high-impact Role and User Group changes, including estimated or actual affected-user counts.
- A distinction between immediate/urgent authorization changes (particularly sensitive-access revocation) and deferred, synchronized changes (particularly broad population recalculation), including administrator-triggered synchronization ("Sync Now") and scheduled/automatic reconciliation.
- Visibility into synchronization status (pending, processing, completed, failed) for Roles and User Groups, including notification of significant synchronization outcomes.
- The business relationship between granted Permissions and what a user can see and do in the HROS product (navigation, actions, screens) at a business-behavior level.
- A complete audit trail of authorization administration actions.
- Multi-tenant isolation of all Authorization configuration and its effects.

### 3.2 Out of Scope

- **Authentication** — identity verification, login, sessions, credentials, multi-factor authentication (a separate domain; referenced here only where a user must already be authenticated for an authorization action to be meaningful).
- **Approval routing and workflow logic** (Approval Chain domain).
- **Visual design, UI layout, or interaction design** of any screen referenced here.
- **Definition of the full initial Permission catalog, System Role catalog, or default User Group catalog** — this document defines the model, not the exhaustive shipped content.
- **A general-purpose rule or policy authoring language.** Matching criteria and scope are limited to the specific, named business concepts in Section 4.
- **Any technical implementation detail** — how data is stored, how authorization decisions are technically evaluated or cached, how synchronization is technically triggered or executed, system design, or API design. These belong in a separate System Architecture document.
- **Making platform-fixed behaviors tenant-configurable** where this document does not explicitly say they are (for example, the existence of the Permission catalog itself is not tenant-configurable).

---

## 4. Domain Concepts

### 4.1 Permission

A **Permission** represents a single business capability available in HROS — the smallest unit of "what can be done." Permissions are predefined and maintained exclusively by the HROS platform; tenant administrators can view them but can never create, rename, or delete one.

Permissions follow an action-oriented naming convention, `resource.action` (for example, `location.create`, `employee.update`, `leave.approve`), describing a capability a user holds, not an event that already happened. Event-style naming (for example, `location.created`) is never used for a Permission.

A Permission corresponds to a capability meaningful in both the HROS user interface (what a user can see and interact with) and in HROS business operations (what a user can actually cause to happen), as described further in Section 5.10.

### 4.2 Role

A **Role** is a named, administrator-visible bundle of Permissions representing a job function or responsibility (for example, "Manager," "Payroll Officer"). A Role is the unit administrators reason about and assign; individual Permissions are rarely, if ever, discussed on their own once bundled into Roles.

HROS distinguishes:

- **System Roles** — provided by the HROS platform (for example, Employee, Manager, Built-in Administrator), some of which carry protected capabilities a tenant administrator can never remove, because doing so would leave the platform, or the employee holding the role, unable to operate safely.
- **Custom Roles** — created by tenant administrators to reflect their own organization's job functions (for example, HR Operations, Payroll Officer, Regional HR Manager).

### 4.3 Role Matrix

The **Role Matrix** is the administration experience through which a Role's Permissions are viewed and configured. It presents capabilities grouped logically by HROS module or resource (for example, Location, Department, Employee), with the specific actions available for each (typically View, Create, Update, Deactivate, and similar module-specific actions), and shows which of those capabilities a given Role currently holds.

### 4.4 User Group

A **User Group** is a tenant-defined population of employees who share business characteristics, together with one or more Roles that population should receive. Rather than assigning a Role to individuals one at a time, administrators assign Roles to User Groups, and HROS automatically determines membership.

An employee may belong to more than one User Group at once, and therefore may hold more than one Role at once. Unless a future business requirement states otherwise, Roles received through different User Groups are cumulative (additive), not mutually exclusive — an employee's overall access is the union of everything every Role they hold grants them, each within its own scope (Section 4.6).

### 4.5 Matching Criteria

**Matching Criteria** are the business conditions HROS evaluates against an employee's attributes (for example, employment status, company, location, department, grade, job title, or whether the employee currently has direct reports) to determine whether that employee currently belongs to a given User Group. Matching is automatic and dynamic: HROS re-evaluates membership as relevant employee or organizational attributes change, without requiring an administrator to manually add or remove individual members from a normal dynamic User Group.

### 4.6 User Group Scope

**User Group Scope** defines the business population or organizational boundary within which a User Group's assigned Roles actually apply — distinct from _who receives_ the Role (User Group membership, Section 4.4). Holding a Permission through a Role does not by itself mean that Permission reaches the entire tenant; the Scope answers "on whom can this be exercised." Representative Scope concepts include Self, Direct Reportees, Company, Location, Department, and Tenant-wide.

### 4.7 Synchronization

**Synchronization** is the business process by which the latest authorization configuration (Role definitions, User Group membership, User Group scope, and Role assignments) is actually applied so that affected users' access reflects it. A saved configuration change is not necessarily felt by affected users at the instant it is saved; it may be **pending synchronization** until applied, either because an administrator explicitly requests immediate synchronization ("Sync Now") or because HROS performs a scheduled reconciliation. Certain sensitive changes are treated with tighter, more urgent synchronization expectations (Section 9).

---

## 5. Features

Each feature includes a **Description** and its **Business Rules** — not how it is built.

### 5.1 Permission & Role Matrix

**Description**
Administrators need a single place to see every business capability HROS supports and to control which of those capabilities each Role grants — organized the way a business user thinks about the product (by module and by action), not as a flat, unstructured list.

**Business Rules**

- The Permission catalog is platform-defined; no tenant administrator action can create, rename, retire, or delete a Permission.
- Permissions are presented grouped by HROS module/resource (for example, all Location-related capabilities together), with the available actions for that module shown consistently (for example, View, Create, Update, Deactivate).
- For a selected Role, the Role Matrix shows exactly which capabilities are currently granted and which are not, and lets an authorized administrator select or remove capabilities for that Role.
- Where a capability logically depends on another, HROS enforces that dependency in the Matrix: an action capability cannot be granted without its corresponding view capability. For example, granting `location.update` requires `location.view` to also be granted; removing `location.view` while `location.update` is still granted is not allowed without also removing the dependent capability.
- Attempting to grant a dependent capability without its prerequisite, or to remove a prerequisite while a dependent capability is still granted, must be prevented with a clear explanation of the dependency — not a silent failure.
- The Role Matrix reflects the same capability catalog for every tenant; only which capabilities are selected for a given Role differs per tenant.

### 5.2 Role Management

**Description**
Administrators need to create, view, and maintain Roles that reflect their organization's job functions, whether starting from a platform-provided System Role or building a Custom Role from scratch.

**Business Rules**

- A Role has a name, an optional description, a type (System or Custom), a status (active or inactive, where applicable), and its current set of granted Permissions (via the Role Matrix).
- Role names must be unique within a tenant.
- An administrator with the correct permission can create a Custom Role, give it a name and description, and assign it an initial set of Permissions via the Role Matrix.
- An administrator can edit a Custom Role's name, description, and Permissions at any time, subject to the impact-visibility requirements in Section 5.9.
- An administrator can view a Role's details, including its full list of currently granted capabilities and, where available, the number of employees currently reached by that Role.
- An administrator can deactivate a Custom Role that is no longer needed rather than deleting it outright, preserving historical/audit continuity; a deactivated Role no longer grants access to any employee once synchronized.
- An administrator can create a new Custom Role by copying an existing Role (System or Custom) as a starting point, then modifying the copy independently of the original.
- Reactivating a previously deactivated Custom Role is permitted and is itself treated as an authorization change subject to the same impact-visibility and synchronization behavior as any other Role change.

### 5.3 System Roles

**Description**
HROS ships with a set of platform-defined Roles representing common job functions (for example, Employee, Manager, Built-in Administrator) so every tenant has a sensible starting point without configuring anything.

**Business Rules**

- System Roles exist in every tenant automatically and cannot be deleted by a tenant administrator.
- Certain System Roles carry a defined set of **protected capabilities** — the minimum set of capabilities considered necessary for that role to function safely within HROS (for example, the minimum an Employee needs to use HROS themselves, or the minimum a Built-in Administrator needs to administer their tenant).
- A tenant administrator may still extend a System Role with additional, non-protected capabilities where the platform allows it, but can never remove a protected capability from a System Role.
- An attempt to remove a protected capability from a System Role must be rejected with a clear explanation, and the attempt must be recorded for audit.
- A tenant administrator can rename the tenant-facing label of a System Role for their own organization's terminology, where the platform allows it, without altering its underlying protected behavior; this is a distinct, explicitly-labeled action from editing its capabilities.
- System Roles cannot be deactivated in a way that would leave the platform, or the role's minimum guaranteed function, unavailable (for example, the role underlying the Built-in Administrator's protected minimum capability set can never be fully deactivated for a tenant).

### 5.4 Custom Roles

**Description**
Administrators need the freedom to define Roles that match their own organization's structure and job titles, beyond what any platform-provided System Role covers.

**Business Rules**

- Any number of Custom Roles may exist per tenant, limited only by reasonable platform constraints communicated to the tenant, if any.
- A Custom Role can be assigned any combination of available Permissions, subject to the dependency rules in Section 5.1.
- A Custom Role can be assigned to any number of User Groups.
- Deactivating a Custom Role that is currently assigned to one or more User Groups must clearly warn the administrator of the resulting impact (Section 5.9) before the deactivation is confirmed.
- A Custom Role that is not currently assigned to any User Group grants no access to anyone, and this state should be visible to the administrator (for example, as an "unassigned" indicator) so unused Roles do not go unnoticed.

### 5.5 User Group Management

**Description**
Administrators need to define, view, and maintain User Groups — the populations of employees to whom Roles are actually delivered — as the primary, scalable mechanism for applying Roles across a workforce.

**Business Rules**

- A User Group has a name, an optional description, a status (active or inactive), one or more Matching Criteria (Section 5.6), one or more assigned Roles (Section 5.7), and a Scope (Section 5.8).
- User Group names must be unique within a tenant.
- An administrator with the correct permission can create, edit, view, and deactivate a User Group.
- Deactivating a User Group causes its assigned Roles to no longer apply to its members once synchronized; this is treated as a high-impact change subject to Section 5.9 whenever the affected population is significant.
- An administrator can view, for any User Group, its current matching employee count and, where useful, a sample or full listing of currently matching employees.
- A User Group with no assigned Role is permitted to exist (for example, while an administrator is still configuring it) but grants no access, and this state should be visible to the administrator.

### 5.6 Dynamic User Group Matching

**Description**
HROS must automatically determine which employees belong to a User Group based on their business attributes, so administrators are never required to manually maintain membership lists for a normal, dynamic User Group.

**Business Rules**

- Matching Criteria may reference employee business attributes including, at minimum, employment status, company, location, department, grade, job title, and whether the employee currently has one or more direct reports, plus any other employee attribute HROS supports in the future.
- Multiple Matching Criteria within a single User Group are combined so that an employee must satisfy all of them to match (a logical "and"), consistent with the examples in Section 3 of the source specification (for example, "Employee is active" and "Company is Singapore" and "Department is HR").
- HROS automatically re-evaluates an employee's User Group membership whenever a relevant employee attribute or organizational fact changes (for example, a change in employment status, a transfer between companies or departments, or a change in reporting-line structure that changes their direct-report count).
- An employee may match zero, one, or multiple User Groups simultaneously; there is no requirement that User Groups be mutually exclusive.
- When an employee begins matching a User Group they did not previously match, they become eligible to receive that group's assigned Role(s), subject to synchronization (Section 9).
- When an employee stops matching a User Group they previously matched, they become ineligible for that group's assigned Role(s) going forward, subject to synchronization (Section 9); this does not necessarily remove access granted independently through a different User Group they still match.
- Administrators can see, for a given User Group, an estimated or actual count of currently matching employees, to support informed decision-making before and after a criteria change.
- A change to a User Group's Matching Criteria is itself treated as a configuration change subject to impact visibility and synchronization (Sections 5.9–5.11), since it can change the matching population without any individual employee's own attributes having changed.

### 5.7 Role Assignment to User Groups

**Description**
Administrators need to connect the "who" (User Group) to the "what" (Role) by assigning one or more Roles to a User Group.

**Business Rules**

- A User Group may have one or more Roles assigned to it.
- A Role may be assigned to any number of User Groups.
- An administrator can add or remove a Role assignment on a User Group at any time, subject to impact visibility (Section 5.9) and synchronization (Section 9) where the affected population is significant.
- Removing a Role from a User Group does not delete or deactivate the Role itself; it only stops that particular User Group from delivering that Role to its members.
- An employee who matches multiple User Groups, each assigning different Roles, receives the cumulative union of all those Roles' capabilities, each exercised within its own User Group's Scope (Section 5.8).

### 5.8 User Group Scope

**Description**
Administrators need to control not just who receives a Role through a User Group, but the business population or organizational boundary within which that Role's capabilities can actually be exercised, so that granting a capability to a broad population does not implicitly mean tenant-wide reach.

**Business Rules**

- Every User Group has exactly one Scope in effect for the Roles it assigns, chosen from the supported Scope concepts (at minimum: Self, Direct Reportees, Company, Location, Department, Tenant-wide), unless a future business need requires per-Role scope within a single group, in which case that need must be resolved as its own product decision rather than assumed here.
- Scope determines the population on which a Role's capabilities apply, not whether the capability itself is granted. For example, a Manager holding `employee.view` through a "People Managers" User Group scoped to Direct Reportees can view their own direct reports' records, but that same capability does not extend to employees outside that scope, even though the Manager Role itself is not scoped differently for a different User Group.
- Where a single employee holds the same capability through more than one User Group with different Scopes (for example, `employee.view` through both a Direct Reportees–scoped group and a Company-scoped group), the employee's effective reach for that capability is the union of every Scope through which they hold it.
- Changing a User Group's Scope (for example, from Direct Reportees to Company) is treated as a high-impact configuration change subject to Section 5.9, since it can substantially change what the group's existing members are able to do without changing who those members are.
- The available Scope concepts are platform-defined; tenant administrators choose among them but do not define new scope concepts or write custom scope logic.

### 5.9 Impact Analysis

**Description**
Because a single Role or User Group change can affect anywhere from a handful of employees to an entire workforce, administrators must be able to see the likely consequences of a change before committing it, and must be clearly warned when a change is high-impact.

**Business Rules**

- Before confirming a change to a Role's Permissions, a User Group's Matching Criteria, a User Group's Scope, or a Role assignment on a User Group, HROS shows the administrator the estimated number of employees affected by the change, where this can be reasonably determined.
- A change is treated as **high-impact** when the estimated or actual affected population exceeds a defined threshold (the specific threshold value is a platform- or tenant-level configuration decision outside this document's scope, per Section 12 Open Questions); high-impact changes require a clear, explicit warning and an additional confirmation step before the change is saved.
- The impact estimate must distinguish, where relevant, between employees who would _gain_ access as a result of the change and employees who would _lose_ access, since these carry different risk profiles for an administrator to consider.
- Impact visibility applies both to changes that add capability (a Role gaining a Permission, a User Group gaining a broader Scope) and to changes that remove capability (a Role losing a Permission, a Matching Criteria narrowing), since both directions can be high-impact for different reasons (over-provisioning risk versus unexpected loss of access).
- Where an exact affected-user count cannot be feasibly shown before the change is saved, HROS shows a clearly labeled estimate rather than presenting no information or implying false precision.

### 5.10 Sync Now / Force Sync

**Description**
Administrators need the ability to request that a pending authorization change be applied without waiting for the next scheduled reconciliation, and to understand that this is a deliberate action with a visible outcome, not an instantaneous guarantee.

**Business Rules**

- After saving a Role or User Group change that results in a pending-synchronization state, HROS clearly displays that the change is pending, along with the estimated number of affected users and the availability of a "Sync Now" (or equivalently business-friendly labeled) action.
- Choosing Sync Now submits a request to apply the change as soon as reasonably possible; HROS must never present this as instantaneous when a large number of users is affected.
- After requesting Sync Now, the administrator can see the current synchronization status for that Role or User Group (Section 5.12).
- HROS notifies the administrator when a significant manually-triggered synchronization completes or fails. In-app notification is the default channel; email notification is additionally appropriate for synchronizations that are long-running, high-impact, or that fail.
- Sync Now is available on both Role changes and User Group changes, with particular emphasis on User Group changes given their typically larger affected populations.
- Requesting Sync Now multiple times for the same pending change does not result in duplicated or conflicting outcomes from the administrator's perspective; the administrator simply sees the same in-progress or completed status.

### 5.11 Scheduled Authorization Reconciliation

**Description**
Authorization configuration must never remain out of sync indefinitely simply because an administrator did not manually trigger synchronization. HROS performs a periodic, automatic reconciliation of any Role or User Group with unapplied changes.

**Business Rules**

- HROS performs a scheduled reconciliation, at minimum daily, that applies any outstanding pending authorization changes across a tenant's Roles and User Groups.
- Scheduled reconciliation focuses on configurations that actually have pending changes; it is not expected to recompute or re-apply configurations that are already fully synchronized and unchanged.
- Administrators can see, for any Role or User Group, whether it currently has pending (unsynchronized) changes, when it was last synchronized, and when the next scheduled reconciliation is expected.
- If a scheduled reconciliation fails for a given Role or User Group, that configuration remains visibly marked as pending/failed rather than being silently treated as synchronized; see Section 5.13.
- Scheduled reconciliation applies independently per tenant; one tenant's reconciliation volume or outcome never affects another tenant's reconciliation.

### 5.12 Synchronization Status

**Description**
Administrators need a clear, consistent way to understand the current synchronization state of any Role or User Group at a glance.

**Business Rules**

- Every Role and User Group exposes a synchronization status understandable at the product level, at minimum: **Pending** (a change has been saved but not yet applied), **Processing** (synchronization is currently underway), **Completed** (the latest configuration has been fully applied), and **Failed** (the most recent synchronization attempt did not succeed).
- The status view shows, at minimum: current status, last successful synchronization time, current estimated/actual matching or affected user count, and whether the next expected synchronization is the next scheduled reconciliation or an in-progress manual Sync Now request.
- A Role or User Group with no pending changes always shows as Completed/synchronized, so administrators can trust the absence of a "pending" indicator as confirmation the configuration is live.
- Status must be visible per Role and per User Group individually; administrators are not required to guess overall tenant synchronization health from an aggregate view alone, though an aggregate/summary view may additionally be offered.

### 5.13 Authorization Audit Trail

**Description**
Authorization administration is security-sensitive by nature; every meaningful change must be captured in a durable, trustworthy record suitable for a customer's compliance review or incident investigation.

**Business Rules**

- The following actions, at minimum, must produce an audit record: Role created, Role updated (including Permission additions/removals), User Group created, User Group Matching Criteria changed, User Group Scope changed, Role assigned to or removed from a User Group, manual synchronization requested, synchronization completed, and synchronization failed.
- Every audit record must answer, at minimum: what changed, who changed it, when it changed, what the previous configuration was, what the new configuration is, and — where applicable — what population was potentially affected.
- Audit records are treated as immutable historical fact; they exist to answer "what happened, when, and by whom" and are never edited or deleted as part of normal product operation.
- Every new authorization-affecting capability introduced to the product must be verified to produce a compliant audit record before it is considered complete, mirroring the same discipline applied in the Authentication domain.

---

## 6. Business Rules

The following cross-cutting rules apply across all Authorization features and are restated here for clarity, consolidating the rules already stated per-feature in Section 5:

1. **Permissions are platform-owned.** No tenant, regardless of administrative privilege, can create, rename, or delete a Permission.
2. **Naming is action-oriented.** Every Permission follows a `resource.action` convention describing a capability, never a past-tense event.
3. **Dependencies are enforced.** An action-oriented capability that logically requires visibility into its resource cannot be granted without the corresponding view capability, and the view capability cannot be removed while a dependent capability remains granted.
4. **Protected capabilities are inviolable.** A tenant administrator can never remove a protected capability from a System Role, regardless of intent or justification claimed.
5. **Access is cumulative by default.** An employee belonging to multiple User Groups receives the union of every Role those groups assign, each exercised within its own Scope, unless a future business rule explicitly introduces a non-additive interaction.
6. **Membership is who; Scope is where.** These two concepts are always evaluated together but never conflated: holding a Permission through a Role never implies tenant-wide reach unless the applicable Scope is explicitly Tenant-wide.
7. **No change is applied blind.** Any change to Role Permissions, User Group Matching Criteria, User Group Scope, or Role-to-User-Group assignment must make its estimated impact visible to the administrator before being saved, with high-impact changes requiring explicit acknowledgment.
8. **Configuration is not always immediately live.** A saved change may be pending until synchronization occurs, but the pending state itself, and its expected resolution path (manual or scheduled), must always be visible to administrators.
9. **Sensitive revocation is never left pending indefinitely.** A deliberate revocation of security-sensitive access is treated with tighter urgency than a broad population recalculation, and must never be allowed to sit unresolved through only the default scheduled cadence when its sensitivity warrants faster action (Section 9).
10. **Nothing crosses a tenant boundary.** Every Role, User Group, matching rule, assignment, and synchronization action is confined to the tenant that owns it; Permissions are the only element shared in definition (not in configuration) across tenants.
11. **Every meaningful administrative action is audited**, without exception, per Section 5.13.

---

## 7. User Stories

Stories are grouped by feature area. Each story states the **Goal** and the **Business Value**; corresponding Given/When/Then scenarios are provided in Section 8.

### Permission & Role Matrix

**AUTHZ-001 · Administrator Views the Role Matrix**
**As** a tenant administrator, **I want** to see all available business capabilities organized by module and action, and which ones a given Role currently grants, **so that** I can understand and reason about a Role's access at a glance.
**Business Value:** Makes Role configuration comprehensible to non-technical administrators and prevents accidental over- or under-granting caused by an unclear presentation of capabilities.

### Role Management

**AUTHZ-002 · Administrator Creates a Custom Role**
**As** a tenant administrator, **I want** to create a new Role tailored to my organization's job function, **so that** I can grant exactly the access that function needs without relying only on platform-provided Roles.
**Business Value:** Lets every tenant model its own organizational structure without waiting on the platform to add a specific role.

**AUTHZ-003 · Administrator Updates Role Permissions**
**As** a tenant administrator, **I want** to add or remove capabilities from an existing Role, **so that** the Role continues to match my organization's evolving needs.
**Business Value:** Keeps access current as business needs change, without requiring a new Role to be created for every adjustment.

**AUTHZ-004 · Administrator Cannot Remove Protected System Capabilities**
**As** the platform, **I want** to prevent a tenant administrator from removing a protected capability from a System Role, **so that** the platform and the employees holding that role always retain the minimum access needed to function safely.
**Business Value:** Prevents an entire class of self-inflicted lockout or platform-unsafe configuration.

**AUTHZ-005 · Administrator Sees Impact Before a High-Impact Role Change**
**As** a tenant administrator, **I want** to see how many employees will be affected before I save a significant change to a Role, **so that** I never make a broad access change unintentionally.
**Business Value:** Reduces the risk of large-scale, unintended over- or under-provisioning of access.

### User Groups & Dynamic Matching

**AUTHZ-006 · Administrator Creates a Dynamic User Group**
**As** a tenant administrator, **I want** to define a new User Group representing a population of employees, **so that** I can apply Roles to that population automatically instead of assigning access to individuals one at a time.
**Business Value:** Makes access management scale to workforces of any size without proportional administrative effort.

**AUTHZ-007 · Administrator Defines User Group Matching Criteria**
**As** a tenant administrator, **I want** to specify the business attributes that determine membership in a User Group, **so that** HROS can automatically and continuously determine who belongs to it.
**Business Value:** Removes the need for administrators to manually track and maintain group membership.

**AUTHZ-008 · Employee Automatically Matches a User Group**
**As** the platform, **I want** to automatically recognize when an employee satisfies a User Group's Matching Criteria, **so that** they receive the appropriate access without manual intervention.
**Business Value:** Guarantees new and existing employees receive correct access as a natural consequence of their role in the business.

**AUTHZ-009 · Employee Matches Multiple User Groups**
**As** an employee who satisfies more than one User Group's criteria, **I want** to receive the combined access from every group I qualify for, **so that** my access correctly reflects every one of my responsibilities.
**Business Value:** Correctly models real-world employees who hold more than one functional responsibility at once.

**AUTHZ-010 · Employee Stops Matching a User Group**
**As** the platform, **I want** to recognize when an employee no longer satisfies a User Group's criteria, **so that** access tied to that group is no longer extended to them going forward.
**Business Value:** Keeps access aligned with current organizational reality as circumstances change.

**AUTHZ-011 · Manager Becomes Eligible Because They Gain Reportees**
**As** an employee who is newly assigned one or more direct reports, **I want** to automatically become eligible for the Manager-oriented access my new responsibility requires, **so that** I can perform my new duties without waiting on manual provisioning.
**Business Value:** Aligns access with organizational change (promotions, reorganizations) the moment it happens in the business.

**AUTHZ-012 · Manager Becomes Ineligible Because They Lose All Reportees**
**As** the platform, **I want** to recognize when an employee no longer has any direct reports, **so that** manager-oriented access tied specifically to that responsibility is no longer extended to them.
**Business Value:** Prevents stale, no-longer-justified access from persisting after a role change.

### Role Assignment & Scope

**AUTHZ-013 · Administrator Assigns a Role to a User Group**
**As** a tenant administrator, **I want** to connect a Role to a User Group, **so that** everyone who matches that group automatically receives that Role.
**Business Value:** Is the core mechanism that makes Roles operationally useful at scale.

**AUTHZ-014 · Administrator Configures the User Group Scope**
**As** a tenant administrator, **I want** to define the population or organizational boundary within which a User Group's Roles apply, **so that** access is not unintentionally broader than intended.
**Business Value:** Prevents a legitimately-needed capability from becoming an unintentional tenant-wide grant.

### Impact & Synchronization

**AUTHZ-015 · Administrator Changes a User Group Rule Affecting Many Employees**
**As** a tenant administrator, **I want** to be clearly warned when changing a User Group's Matching Criteria will affect a large number of employees, **so that** I can make an informed decision before committing the change.
**Business Value:** Prevents a routine-seeming rule tweak from silently reshaping access for thousands of people.

**AUTHZ-016 · System Marks the Configuration as Pending Synchronization**
**As** the platform, **I want** to clearly mark a saved authorization change as pending until it is actually applied, **so that** administrators are never misled about whether a change is already live.
**Business Value:** Prevents administrators from assuming a change has taken effect before it actually has.

**AUTHZ-017 · Administrator Chooses Sync Now**
**As** a tenant administrator, **I want** to request that a pending change be applied immediately rather than waiting for the next scheduled reconciliation, **so that** urgent access changes don't have to wait unnecessarily.
**Business Value:** Gives administrators control over urgency without requiring support-team involvement.

**AUTHZ-018 · Administrator Sees Synchronization Progress/Status**
**As** a tenant administrator, **I want** to see the current status of a synchronization I requested, **so that** I know whether it's still working, has finished, or needs my attention.
**Business Value:** Builds administrator trust in the system by avoiding an opaque "did it work?" experience.

**AUTHZ-019 · Administrator Receives Notification After Important Synchronization Completion/Failure**
**As** a tenant administrator, **I want** to be notified when a significant synchronization I triggered finishes or fails, **so that** I don't have to keep checking back manually.
**Business Value:** Closes the loop on high-impact administrative actions without requiring the administrator to poll for status.

**AUTHZ-020 · Pending Changes Reconciled Automatically by Scheduled Synchronization**
**As** the platform, **I want** to automatically apply any outstanding pending authorization changes on a regular schedule, **so that** configuration never remains out of sync indefinitely just because no administrator manually triggered it.
**Business Value:** Provides a safety net that guarantees eventual consistency without relying on administrator diligence.

**AUTHZ-021 · Failed Synchronization Remains Visible and Recoverable**
**As** a tenant administrator, **I want** a failed synchronization to remain clearly visible with a way to retry it, **so that** a transient failure doesn't silently leave my organization's access out of date.
**Business Value:** Prevents a failure from becoming an invisible, unresolved gap in access correctness.

**AUTHZ-022 · Sensitive Access Revocation Without Unacceptable Access Window**
**As** the platform, **I want** a deliberate revocation of sensitive access to take effect promptly rather than waiting for a routine synchronization cycle, **so that** a user whose access has been explicitly revoked cannot continue to exercise it for an unacceptable period of time.
**Business Value:** Closes a critical security gap that would otherwise exist between an administrator's decision and its real-world effect.

### Governance

**AUTHZ-023 · Tenant Isolation Is Enforced**
**As** the platform, **I want** to guarantee that no tenant's Roles, User Groups, or authorization configuration can ever be seen or affected by another tenant, **so that** every customer's organizational and access data remains strictly private to them.
**Business Value:** A foundational trust requirement for any multi-tenant SaaS product, and a standard expectation of enterprise procurement review.

**AUTHZ-024 · Authorization Configuration Changes Are Auditable**
**As** the platform, **I want** every meaningful authorization administration action to produce a durable, complete audit record, **so that** customers can trust the platform for compliance review and incident investigation.
**Business Value:** A prerequisite for enterprise sales and regulatory compliance, and the primary tool for investigating any real access-related incident.

---

## 8. Acceptance Criteria

Acceptance Criteria are expressed as Given/When/Then scenarios, one set per user story in Section 7.

### AUTHZ-001 · Administrator Views the Role Matrix

_Scenario 1_

```
Given I am an authorized administrator viewing a Role
When I open the Role Matrix for that Role
Then I must see every available capability grouped by module and action
And I must clearly see which capabilities are currently granted to that Role
```

_Scenario 2_

```
Given I am viewing the Role Matrix
When I look at a capability that has a dependency on another capability
Then the dependency relationship must be visible to me
```

### AUTHZ-002 · Administrator Creates a Custom Role

_Scenario 1_

```
Given I have permission to manage Roles
When I create a new Custom Role with a unique name and select an initial set of capabilities
Then the Role must be created with exactly those capabilities
And the creation must be recorded for audit
```

_Scenario 2_

```
Given a Role with a given name already exists in my tenant
When I attempt to create another Role with the same name
Then the creation must be rejected with a clear explanation
```

### AUTHZ-003 · Administrator Updates Role Permissions

_Scenario 1_

```
Given I have permission to manage Roles
And I am editing a Custom Role's capabilities
When I add or remove a capability and save the change
Then the Role's configuration must reflect the update
And the change must be recorded for audit, including the previous and new configuration
```

_Scenario 2_

```
Given I attempt to remove a view capability from a Role
And a dependent action capability for the same resource is still granted
When I attempt to save the change
Then the change must be rejected with an explanation of the dependency
And no partial update must be applied
```

### AUTHZ-004 · Administrator Cannot Remove Protected System Capabilities

_Scenario 1_

```
Given a System Role has one or more protected capabilities
When I attempt to remove a protected capability from that Role
Then the attempt must be rejected
And the attempt must be recorded for audit
```

_Scenario 2_

```
Given a System Role has protected capabilities
When I view that Role in the Role Matrix
Then the protected capabilities must be clearly indicated as protected/non-removable
```

### AUTHZ-005 · Administrator Sees Impact Before a High-Impact Role Change

_Scenario 1_

```
Given I am changing a Role's capabilities
And the Role is currently held by a number of employees exceeding the high-impact threshold
When I attempt to save the change
Then I must see an estimate of how many employees are affected
And I must explicitly confirm the change before it is saved
```

_Scenario 2_

```
Given I am changing a Role's capabilities
And the affected population is below the high-impact threshold
When I save the change
Then the change must be saved without requiring the additional high-impact confirmation step
```

### AUTHZ-006 · Administrator Creates a Dynamic User Group

_Scenario 1_

```
Given I have permission to manage User Groups
When I create a new User Group with a unique name, Matching Criteria, at least one assigned Role, and a Scope
Then the User Group must be created with that configuration
And the creation must be recorded for audit
```

_Scenario 2_

```
Given a User Group with a given name already exists in my tenant
When I attempt to create another User Group with the same name
Then the creation must be rejected with a clear explanation
```

### AUTHZ-007 · Administrator Defines User Group Matching Criteria

_Scenario 1_

```
Given I am configuring a User Group's Matching Criteria
When I specify one or more conditions based on supported employee attributes
Then HROS must show me an estimated or actual count of employees currently matching those criteria
```

_Scenario 2_

```
Given I define multiple Matching Criteria on a single User Group
When HROS evaluates employee matches
Then an employee must be considered a match only if they satisfy all specified criteria
```

### AUTHZ-008 · Employee Automatically Matches a User Group

_Scenario 1_

```
Given a User Group has defined Matching Criteria
And an employee's current attributes satisfy those criteria
When HROS evaluates that employee against the User Group
Then the employee must be recognized as a matching member of that User Group
And the employee must become eligible for that group's assigned Role(s), subject to synchronization
```

### AUTHZ-009 · Employee Matches Multiple User Groups

_Scenario 1_

```
Given an employee's attributes satisfy the Matching Criteria of more than one User Group
When HROS evaluates that employee's group membership
Then the employee must be recognized as a member of every User Group they match
And the employee must become eligible to receive the union of all Roles those groups assign, each within its own Scope
```

### AUTHZ-010 · Employee Stops Matching a User Group

_Scenario 1_

```
Given an employee currently matches a User Group
When a change to the employee's attributes causes them to no longer satisfy that group's Matching Criteria
Then the employee must be recognized as no longer a member of that User Group
And the employee must become ineligible for that group's assigned Role(s) going forward, subject to synchronization
```

_Scenario 2_

```
Given an employee stops matching one User Group but still matches another User Group granting a different Role
When the membership change is evaluated
Then only the access tied to the group no longer matched must be affected
And access the employee holds through the group they still match must remain unaffected
```

### AUTHZ-011 · Manager Becomes Eligible Because They Gain Reportees

_Scenario 1_

```
Given an employee previously had zero direct reports
And a User Group's Matching Criteria includes "has one or more direct reports"
When an organizational change gives that employee one or more direct reports
Then the employee must be recognized as newly matching that User Group
And the employee must become eligible for the Manager-oriented Role assigned to that group, subject to synchronization
```

### AUTHZ-012 · Manager Becomes Ineligible Because They Lose All Reportees

_Scenario 1_

```
Given an employee currently has one or more direct reports and matches a "has direct reports" User Group
When an organizational change results in that employee having zero direct reports
Then the employee must be recognized as no longer matching that User Group
And the employee must become ineligible for that group's assigned Role going forward, subject to synchronization
```

### AUTHZ-013 · Administrator Assigns a Role to a User Group

_Scenario 1_

```
Given I have permission to manage User Groups
When I assign a Role to a User Group
Then every employee currently matching that User Group must become eligible for that Role, subject to synchronization
And the assignment must be recorded for audit
```

_Scenario 2_

```
Given a Role is assigned to a User Group
When I remove that Role assignment from the User Group
Then members of that User Group must no longer be eligible for that Role through this group, subject to synchronization
And the Role itself must remain unchanged and unaffected for any other User Group still assigning it
```

### AUTHZ-014 · Administrator Configures the User Group Scope

_Scenario 1_

```
Given I am configuring a User Group
When I select a Scope (for example, Direct Reportees) for that group's assigned Role(s)
Then the group's members must only be able to exercise those Role(s)' capabilities within that Scope
```

_Scenario 2_

```
Given a User Group's Scope is currently Direct Reportees
When I change the Scope to Company
Then this must be treated as a high-impact change subject to impact visibility (AUTHZ-005-style confirmation) before being saved
```

### AUTHZ-015 · Administrator Changes a User Group Rule Affecting Many Employees

_Scenario 1_

```
Given I am changing a User Group's Matching Criteria
And the estimated change in matching population exceeds the high-impact threshold
When I attempt to save the change
Then I must see the estimated number of employees who would gain and/or lose membership
And I must explicitly confirm the change before it is saved
```

### AUTHZ-016 · System Marks the Configuration as Pending Synchronization

_Scenario 1_

```
Given I save a change to a Role or User Group that has not yet been applied to affected users
When the save completes
Then the Role or User Group must display a "Pending Synchronization" status
And the estimated affected user count must be shown alongside that status
```

### AUTHZ-017 · Administrator Chooses Sync Now

_Scenario 1_

```
Given a Role or User Group has a pending synchronization status
When I select Sync Now
Then a synchronization request must be accepted
And the status must update to reflect that synchronization is in progress
And I must not be told the change is already complete before it actually is
```

_Scenario 2_

```
Given I have already requested Sync Now for a pending change
When I select Sync Now again before the first request completes
Then no duplicate or conflicting synchronization outcome must result
```

### AUTHZ-018 · Administrator Sees Synchronization Progress/Status

_Scenario 1_

```
Given a synchronization is currently in progress for a Role or User Group
When I view that Role or User Group
Then I must see a status of "Processing"
```

_Scenario 2_

```
Given a synchronization has finished successfully
When I view that Role or User Group
Then I must see a status of "Completed" along with the time it was last synchronized
```

### AUTHZ-019 · Administrator Receives Notification After Important Synchronization Completion/Failure

_Scenario 1_

```
Given I triggered a significant (high-impact) manual synchronization
When that synchronization completes, successfully or not
Then I must receive an in-app notification of the outcome
```

_Scenario 2_

```
Given a significant synchronization is long-running, high-impact, or has failed
When that outcome occurs
Then I must additionally receive an email notification, in addition to the in-app notification
```

### AUTHZ-020 · Pending Changes Reconciled Automatically by Scheduled Synchronization

_Scenario 1_

```
Given a Role or User Group has pending changes that were not manually synchronized
When the scheduled reconciliation runs
Then those pending changes must be applied
And the Role or User Group's status must update to reflect the outcome
```

_Scenario 2_

```
Given a Role or User Group has no pending changes
When the scheduled reconciliation runs
Then that Role or User Group must not need to be reprocessed as part of the reconciliation
```

### AUTHZ-021 · Failed Synchronization Remains Visible and Recoverable

_Scenario 1_

```
Given a synchronization attempt for a Role or User Group fails
When I view that Role or User Group
Then its status must clearly show "Failed" rather than silently reverting to "Pending" or falsely showing "Completed"
And I must be able to retry synchronization
```

_Scenario 2_

```
Given a synchronization has failed
When the next scheduled reconciliation runs
Then that Role or User Group must be reattempted rather than permanently skipped
```

### AUTHZ-022 · Sensitive Access Revocation Without Unacceptable Access Window

_Scenario 1_

```
Given an administrator has explicitly revoked a security-sensitive capability from a specific employee (for example, by removing them from a User Group granting that capability, or by removing the capability from their Role)
When the revocation is saved
Then this change must be treated with tighter synchronization urgency than an ordinary broad population recalculation
And it must not be left to wait for only the default scheduled reconciliation cadence
```

_Scenario 2_

```
Given a sensitive revocation is pending synchronization
When an administrator checks its status shortly after saving
Then the status must clearly reflect that this is being treated as an urgent/prioritized change, distinct from a routine pending change
```

### AUTHZ-023 · Tenant Isolation Is Enforced

_Scenario 1_

```
Given I am an administrator of Tenant A
When I attempt to view, edit, or reference a Role or User Group belonging to Tenant B
Then the request must be rejected
```

_Scenario 2_

```
Given a User Group's Matching Criteria and Scope are evaluated
When matching employees are determined
Then only employees within the same tenant as the User Group may ever be considered a match
```

### AUTHZ-024 · Authorization Configuration Changes Are Auditable

_Scenario 1_

```
Given any of the actions listed in Section 5.13 occurs
When that action completes
Then a corresponding audit record must be created
And that record must include what changed, who changed it, when, the previous configuration, and the new configuration
```

_Scenario 2_

```
Given a new authorization-affecting capability is introduced to the product
When it is reviewed prior to release
Then it must be confirmed to produce a compliant audit record before release
```

---

## 9. Edge Cases

- **Conflicting simultaneous edits.** Two administrators edit the same Role or User Group at nearly the same time. HROS must ensure the final saved state is coherent (not a silent partial merge of both edits) and must not lose either administrator's change without a clear indication of what happened.
- **Employee matches a User Group briefly, then immediately stops matching it.** A rapid organizational change (for example, a reporting-line correction made and then reversed within the same business day) should not need to produce a confusing sequence of grant-then-revoke access changes visible to the employee if resolved before the next synchronization; the _audit trail_, however, should still reflect what the underlying configuration/matching state was at each point in time where actually applied.
- **A Role assigned to zero User Groups.** The Role is valid and remains fully configured, but reaches no employees. This should be visibly distinguishable from a Role that is actively delivering access, so administrators do not mistake an "orphaned" Role for one in active use.
- **A User Group with Matching Criteria that currently match zero employees.** This is a valid, non-error state (for example, a group defined in advance of an org change that hasn't happened yet); it should be shown with a matching count of zero rather than treated as a misconfiguration.
- **An employee who is the sole match for a highly sensitive Role loses eligibility.** If a User Group change removes the only employee holding a critical capability, HROS should surface this as part of impact visibility (loss of coverage) rather than silently leaving no one with that capability.
- **High-impact change affecting a mix of gains and losses.** A single Matching Criteria change may cause some employees to gain a Role and others to lose it simultaneously; both directions must be reflected in the impact estimate, not just the net change.
- **Deactivating a Role currently in use by many User Groups.** Must be treated as high-impact, showing the combined affected population across every User Group assigning that Role, not just a count local to one group.
- **Deactivated employee remains "matched."** If an employee becomes inactive, User Group criteria referencing employment status must cause them to stop matching groups whose criteria require active status, removing associated access as part of the same change category as any other matching update.
- **Synchronization requested for a Role/User Group with no actual pending change.** Sync Now on an already-synchronized configuration should complete as a no-op without error, rather than being blocked or producing a misleading "in progress" state.
- **Repeated Sync Now requests during an in-progress synchronization.** Must not create duplicate, conflicting, or double-applied outcomes.
- **Scheduled reconciliation coincides with a manual Sync Now for the same configuration.** The two must not conflict or double-apply; the end state must be the correctly synchronized configuration exactly once.
- **A capability dependency change creates an inconsistent existing Role.** If the platform ever changes which capabilities depend on which others, any existing Role already in an inconsistent state under the new rule must be surfaced to administrators for resolution rather than silently auto-corrected without visibility.
- **Copying a Role that contains protected capabilities.** The resulting Custom Role copy does not retain "protected" status for those capabilities (protection is a System Role property), and this distinction should be made clear to the administrator at copy time.
- **A tenant with an extremely large workforce (tens of thousands of employees) triggers a tenant-wide Scope change.** The impact estimate and high-impact warning must still function correctly and meaningfully at this scale, not just for small or medium populations.

---

## 10. Non-Functional Business Requirements

These describe the required _quality_ of the Authorization experience — never how it is technically achieved.

### 10.1 Performance

- Viewing the Role Matrix, a Role's details, or a User Group's details, including current matching/affected counts, must feel responsive to an administrator under normal load.
- Impact estimates shown before saving a change must be available quickly enough to be a genuinely usable part of the administrator's decision-making, not a step so slow it discourages checking impact before saving.

### 10.2 Availability

- Authorization administration (viewing and editing Roles, User Groups, and their status) must be available with enterprise-grade reliability, consistent with the platform's overall availability commitments.
- A temporary inability to compute a precise impact estimate must degrade to a clearly labeled approximate estimate rather than blocking the administrator from proceeding indefinitely, unless the change is high-impact enough that proceeding without any impact information would itself be unacceptable.

### 10.3 Scalability

- The domain must support tenants ranging from small businesses to large enterprises with tens of thousands of employees, without the impact-visibility, matching, or synchronization experience degrading in a way that stops being usable at scale.
- Peak administrative activity in one tenant (for example, a large reorganization prompting many User Group changes at once) must not degrade the authorization administration experience for unrelated tenants.

### 10.4 Security

- No path in the product allows a tenant administrator to grant themselves or another user access to a protected System Role capability that platform policy has marked non-removable/non-grantable through unintended means.
- Every security-critical revocation of access must be capable of taking effect promptly, independent of whether a broad scheduled reconciliation happens to be imminent or not.
- Authorization configuration and its evaluated effects must never be observable or alterable across a tenant boundary.

### 10.5 Compliance

- The domain must support the evidentiary and control requirements typically assessed in enterprise customer security reviews (e.g., SOC 2-style audits): least-privilege configurability, access review support (what does this Role/User Group grant, and to whom), auditable administrative history, and tenant-level isolation.
- Audit records must be retained and remain accessible for the period required to support customer compliance reviews.

### 10.6 Accessibility

- Every administrator-facing screen in this domain (Role Matrix, Role management, User Group management, impact review, synchronization status) must be usable by people relying on assistive technology, consistent with the platform's overall accessibility commitments.
- Impact warnings and high-impact confirmations must be presented in a way that is clear and unambiguous without requiring visual-only cues (for example, color alone) to convey severity.

### 10.7 Usability for Non-Technical Administrators

- The entire administration experience must be understandable and operable by a non-technical HR administrator, without requiring knowledge of how authorization is technically implemented.
- Business terminology (Role, User Group, Scope, Matching Criteria, Synchronization) must be used consistently throughout the product surface, matching the terminology defined in this document.

---

## 11. Assumptions

The following are business assumptions used as defaults where the business decision has not yet been formally confirmed. Each is cross-referenced to its Open Question in Section 12.

1. **Roles received through different User Groups are cumulative (additive), never mutually exclusive**, unless a future business requirement introduces an explicit exception. _(See Open Question 1.)_
2. **Matching Criteria within a single User Group are combined with "and" logic**, requiring an employee to satisfy every specified condition to match. _(See Open Question 2.)_
3. **A single User Group has exactly one Scope applied uniformly to all Roles it assigns**, rather than a different Scope per Role within the same group. _(See Open Question 3.)_
4. **Scheduled reconciliation runs at least daily** as the baseline cadence for the initial product. _(See Open Question 4.)_
5. **Sensitive-access revocation is treated with materially tighter urgency than routine population recalculation**, though the exact business definition of "sensitive" and the exact urgency target are not yet finalized. _(See Open Question 5.)_
6. **The high-impact threshold is a single platform-wide default** unless tenant-level configurability of that threshold is later requested. _(See Open Question 6.)_
7. **A Role's "protected capability" designation is fixed by the platform per System Role** and is not something any tenant can alter, even to make a System Role more restrictive than its protected minimum. _(See Open Question 7.)_

---

## 12. Open Questions

1. Should Roles received through overlapping User Groups always be strictly additive, or should there be a business scenario (for example, an explicit "deny" or "highest-privilege-wins" concept) where they are not purely cumulative?
2. Should User Group Matching Criteria ever support "or" combinations across conditions within a single group, or should such cases always be modeled as separate User Groups instead?
3. Should User Group Scope ever need to vary per Role within a single User Group (for example, one assigned Role scoped to Direct Reportees and another assigned Role in the same group scoped to Company), or is one Scope per User Group sufficient for all real-world tenant needs?
4. Is daily scheduled reconciliation sufficient for all tenants, or should larger/enterprise tenants be offered a more frequent scheduled cadence as part of their service tier?
5. What is the precise business definition of "security-sensitive" access for the purposes of prioritized revocation urgency, and what is the target maximum time between a sensitive revocation and it taking effect?
6. Should the high-impact-change threshold (the affected-user count that triggers mandatory impact confirmation) be a single platform-wide constant, or should it be configurable per tenant to reflect very different workforce sizes?
7. Should tenant administrators be able to further restrict (but never expand) a System Role's non-protected default capabilities as a matter of policy, or should System Roles always start from the same platform-defined baseline for every tenant?
8. When a Custom Role is copied from a System Role, should the copy retain any relationship to the original for future reference (for example, "copied from Manager"), or should it become a fully independent Custom Role with no traceable lineage?
9. Should there be a limit on the number of Custom Roles or User Groups a single tenant may create, and if so, should that limit be uniform or tied to subscription tier?

---

## 13. Coverage Summary

| Feature Area                          | Stories               |
| ------------------------------------- | --------------------- |
| Permission & Role Matrix              | AUTHZ-001             |
| Role Management                       | AUTHZ-002 – AUTHZ-005 |
| User Groups & Dynamic Matching        | AUTHZ-006 – AUTHZ-012 |
| Role Assignment & Scope               | AUTHZ-013 – AUTHZ-014 |
| Impact & Synchronization              | AUTHZ-015 – AUTHZ-022 |
| Governance (Tenant Isolation & Audit) | AUTHZ-023 – AUTHZ-024 |

**Total: 24 user stories across 6 feature areas**, each traceable to a business rule defined in Section 5 and Section 6.

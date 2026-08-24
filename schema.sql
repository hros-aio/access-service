-- HROS Access Service
-- PostgreSQL 18
-- Authentication schema extended with Authorization domain.
--
-- Authorization sources:
--   - authorization-service-prd.md v1.0
--   - SYSTEM_OVERVIEW.md (Authorization)
--
-- Key Authorization decisions:
-- 1. Authorization remains inside the existing hros-access-service database.
-- 2. There is NO permissions table. Permission Catalog is static/code-owned.
-- 3. Roles store Permission Catalog IDs verbatim in role_permissions.permission_code.
-- 4. User Group membership and effective user Roles are durable materialized projections.
-- 5. Role Permission changes are shared Role-cache updates; no mass per-user rewrite.
-- 6. User Group changes use version/projection_version and asynchronous reconciliation.
-- 7. Redis is runtime acceleration only; PostgreSQL remains durable source of truth.
-- 8. Existing auth_security_events_outbox is reused for Authorization audit/events.
--
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- TENANTS
-- =========================================================
CREATE TABLE tenants (
    tenant_code VARCHAR(50) PRIMARY KEY,
    company_id VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL,
    CONSTRAINT uq_tenants_company_id UNIQUE (company_id)
);

-- =========================================================
-- EMPLOYEE REFERENCES
-- Được tạo trước USERS vì USERS tham chiếu employee_id.
-- =========================================================
CREATE TABLE employee_references (
    employee_id UUID PRIMARY KEY,
    tenant_code VARCHAR(50) NOT NULL,
    employee_code VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL,
    source_version VARCHAR(100),
    synchronized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Authorization projection attributes synchronized from Directory Service.
    company_id VARCHAR(100),
    location_id VARCHAR(100),
    department_id VARCHAR(100),
    grade_id VARCHAR(100),
    job_title_id VARCHAR(100),
    manager_employee_id UUID,
    reportees_count INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT fk_employee_references_tenant FOREIGN KEY (tenant_code) REFERENCES tenants (tenant_code) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT uq_employee_references_tenant_employee_code UNIQUE (tenant_code, employee_code),
    -- Phục vụ composite FK từ USERS để bảo đảm employee
    -- và user luôn thuộc cùng một tenant.
    CONSTRAINT uq_employee_references_tenant_employee_id UNIQUE (tenant_code, employee_id)
);

CREATE INDEX idx_employee_references_tenant_status ON employee_references (tenant_code, status);

CREATE INDEX idx_employee_references_tenant_company
    ON employee_references (tenant_code, company_id)
    WHERE company_id IS NOT NULL;

CREATE INDEX idx_employee_references_tenant_location
    ON employee_references (tenant_code, location_id)
    WHERE location_id IS NOT NULL;

CREATE INDEX idx_employee_references_tenant_department
    ON employee_references (tenant_code, department_id)
    WHERE department_id IS NOT NULL;

CREATE INDEX idx_employee_references_tenant_grade
    ON employee_references (tenant_code, grade_id)
    WHERE grade_id IS NOT NULL;

CREATE INDEX idx_employee_references_tenant_job_title
    ON employee_references (tenant_code, job_title_id)
    WHERE job_title_id IS NOT NULL;

CREATE INDEX idx_employee_references_tenant_manager
    ON employee_references (tenant_code, manager_employee_id)
    WHERE manager_employee_id IS NOT NULL;

ALTER TABLE employee_references
    ADD CONSTRAINT chk_employee_references_reportees_count
    CHECK (reportees_count >= 0);

-- =========================================================
-- USERS
-- =========================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_code VARCHAR(50) NOT NULL,
    employee_ref_id UUID,
    normalized_email VARCHAR(320) NOT NULL,
    display_email VARCHAR(320) NOT NULL,
    user_type VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL,
    credential_status VARCHAR(30) NOT NULL,
    security_version INTEGER NOT NULL DEFAULT 1,
    protected_root_admin BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_enrollment_required BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_reenrollment_required BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_code) REFERENCES tenants (tenant_code) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_users_employee_reference FOREIGN KEY (tenant_code, employee_ref_id) REFERENCES employee_references (tenant_code, employee_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    -- Một employee chỉ ánh xạ tới tối đa một user.
    CONSTRAINT uq_users_employee_ref_id UNIQUE (employee_ref_id),
    -- Email chỉ cần duy nhất trong phạm vi tenant.
    CONSTRAINT uq_users_tenant_normalized_email UNIQUE (tenant_code, normalized_email),
    CONSTRAINT chk_users_security_version CHECK (security_version >= 1)
);


-- Supports tenant-aware composite foreign keys from Authorization projections.
ALTER TABLE users
    ADD CONSTRAINT uq_users_tenant_id UNIQUE (tenant_code, id);

CREATE INDEX idx_users_tenant_status ON users (tenant_code, status);

CREATE INDEX idx_users_tenant_user_type ON users (tenant_code, user_type);

CREATE INDEX idx_users_normalized_email ON users (normalized_email);

-- Chỉ cho phép tối đa một protected root admin trong mỗi tenant.
CREATE UNIQUE INDEX uq_users_one_protected_root_admin_per_tenant ON users (tenant_code)
WHERE
    protected_root_admin = TRUE;

-- =========================================================
-- CREDENTIALS
-- =========================================================
CREATE TABLE credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    password_hash TEXT NOT NULL,
    algorithm VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL,
    password_changed_at TIMESTAMPTZ,
    CONSTRAINT fk_credentials_user FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX idx_credentials_user_id ON credentials (user_id);

CREATE INDEX idx_credentials_user_status ON credentials (user_id, status);

-- Nếu mỗi user chỉ được có một credential active.
CREATE UNIQUE INDEX uq_credentials_one_active_per_user ON credentials (user_id)
WHERE
    status = 'active';

-- =========================================================
-- EXTERNAL IDENTITIES
-- =========================================================
CREATE TABLE external_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    tenant_code VARCHAR(50) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    provider_subject VARCHAR(255) NOT NULL,
    provider_email VARCHAR(320),
    status VARCHAR(30) NOT NULL,
    CONSTRAINT fk_external_identities_user FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_external_identities_tenant FOREIGN KEY (tenant_code) REFERENCES tenants (tenant_code) ON UPDATE CASCADE ON DELETE RESTRICT,
    -- Một identity từ provider chỉ được ánh xạ tới một user
    -- trong cùng tenant.
    CONSTRAINT uq_external_identity_subject UNIQUE (tenant_code, provider, provider_subject),
    -- Một user không nên có hai identity trùng provider.
    CONSTRAINT uq_external_identity_user_provider UNIQUE (user_id, provider)
);

CREATE INDEX idx_external_identities_user_id ON external_identities (user_id);

CREATE INDEX idx_external_identities_provider_email ON external_identities (
    tenant_code,
    provider,
    provider_email
);

-- =========================================================
-- INVITATIONS
-- =========================================================
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    token_hash TEXT NOT NULL,
    status VARCHAR(30) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    expires_at TIMESTAMPTZ NOT NULL,
    issued_by UUID,
    sent_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT fk_invitations_user FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_invitations_issued_by FOREIGN KEY (issued_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE
    SET
        NULL,
        CONSTRAINT uq_invitations_token_hash UNIQUE (token_hash),
        CONSTRAINT chk_invitations_version CHECK (version >= 1),
        CONSTRAINT chk_invitations_expiration CHECK (
            sent_at IS NULL
            OR expires_at > sent_at
        ),
        CONSTRAINT chk_invitations_accepted_at CHECK (
            status <> 'accepted'
            OR accepted_at IS NOT NULL
        ),
        CONSTRAINT chk_invitations_revoked_at CHECK (
            status <> 'revoked'
            OR revoked_at IS NOT NULL
        )
);

CREATE INDEX idx_invitations_user_id ON invitations (user_id);

CREATE INDEX idx_invitations_status_expires_at ON invitations (status, expires_at);

-- Mỗi user chỉ có tối đa một invitation đang có hiệu lực logic.
-- Việc kiểm tra expires_at vẫn cần thực hiện trong transaction.
CREATE UNIQUE INDEX uq_invitations_one_pending_per_user ON invitations (user_id)
WHERE
    status IN ('pending', 'sent');

-- =========================================================
-- MFA METHODS
-- =========================================================
CREATE TABLE mfa_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    type VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    encrypted_secret TEXT,
    encrypted_email TEXT,
    masked_destination VARCHAR(255),
    verified_at TIMESTAMPTZ,
    disabled_at TIMESTAMPTZ,
    CONSTRAINT fk_mfa_methods_user FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT chk_mfa_methods_destination CHECK (
        encrypted_secret IS NOT NULL
        OR encrypted_email IS NOT NULL
    ),
    CONSTRAINT chk_mfa_methods_verified CHECK (
        status <> 'active'
        OR verified_at IS NOT NULL
    ),
    CONSTRAINT chk_mfa_methods_disabled CHECK (
        status <> 'disabled'
        OR disabled_at IS NOT NULL
    )
);

CREATE INDEX idx_mfa_methods_user_id ON mfa_methods (user_id);

CREATE INDEX idx_mfa_methods_user_status ON mfa_methods (user_id, status);

-- Một user chỉ có tối đa một MFA method primary.
CREATE UNIQUE INDEX uq_mfa_methods_one_primary_per_user ON mfa_methods (user_id)
WHERE
    is_primary = TRUE
    AND status = 'active';

-- =========================================================
-- AUTHENTICATION SETTINGS
-- Quan hệ one-to-one với TENANTS.
-- =========================================================
CREATE TABLE authentication_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_code VARCHAR(50) NOT NULL,
    restricted_mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    need_admin_reset_password BOOLEAN NOT NULL DEFAULT FALSE,
    account_lockout_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    max_failed_retries INTEGER NOT NULL DEFAULT 5,
    ip_restriction_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    allowed_ip_cidrs JSONB NOT NULL DEFAULT '[]' :: JSONB,
    version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT fk_authentication_settings_tenant FOREIGN KEY (tenant_code) REFERENCES tenants (tenant_code) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT uq_authentication_settings_tenant UNIQUE (tenant_code),
    CONSTRAINT chk_authentication_settings_max_retries CHECK (max_failed_retries > 0),
    CONSTRAINT chk_authentication_settings_version CHECK (version >= 1),
    CONSTRAINT chk_authentication_settings_allowed_ip_cidrs CHECK (jsonb_typeof(allowed_ip_cidrs) = 'array')
);


-- =========================================================
-- AUTHORIZATION DOMAIN
-- =========================================================
-- Permission Catalog is intentionally NOT persisted.
-- Permission IDs such as "location.view" are code-owned stable identifiers.
-- role_permissions.permission_code is validated by PermissionCatalogModule.
--
-- Authorization reuses:
--   - tenants
--   - users
--   - employee_references (extended above)
--   - auth_security_events_outbox (defined below)
-- =========================================================

-- ---------------------------------------------------------
-- ROLES
-- ---------------------------------------------------------
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_code VARCHAR(50) NOT NULL,

    name VARCHAR(150) NOT NULL,
    description TEXT,
    role_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    system_role_key VARCHAR(100),

    -- Optimistic locking + Role cache version.
    version INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,

    CONSTRAINT fk_roles_tenant
        FOREIGN KEY (tenant_code)
        REFERENCES tenants (tenant_code)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT uq_roles_tenant_name
        UNIQUE (tenant_code, name),

    CONSTRAINT uq_roles_tenant_id
        UNIQUE (tenant_code, id),

    CONSTRAINT chk_roles_role_type
        CHECK (role_type IN ('SYSTEM', 'CUSTOM')),

    CONSTRAINT chk_roles_status
        CHECK (status IN ('ACTIVE', 'INACTIVE')),

    CONSTRAINT chk_roles_version
        CHECK (version >= 1),

    CONSTRAINT chk_roles_system_role_key
        CHECK (
            (role_type = 'SYSTEM' AND system_role_key IS NOT NULL)
            OR
            (role_type = 'CUSTOM' AND system_role_key IS NULL)
        )
);

CREATE UNIQUE INDEX uq_roles_tenant_system_role_key
    ON roles (tenant_code, system_role_key)
    WHERE system_role_key IS NOT NULL;

CREATE INDEX idx_roles_tenant_status
    ON roles (tenant_code, status);

CREATE INDEX idx_roles_tenant_type_status
    ON roles (tenant_code, role_type, status);

-- ---------------------------------------------------------
-- ROLE PERMISSIONS
-- ---------------------------------------------------------
CREATE TABLE role_permissions (
    role_id UUID NOT NULL,
    permission_code VARCHAR(150) NOT NULL,
    is_protected BOOLEAN NOT NULL DEFAULT FALSE,

    PRIMARY KEY (role_id, permission_code),

    CONSTRAINT fk_role_permissions_role
        FOREIGN KEY (role_id)
        REFERENCES roles (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- Useful for operational checks when a Permission is deprecated.
CREATE INDEX idx_role_permissions_permission_code
    ON role_permissions (permission_code);

-- ---------------------------------------------------------
-- USER GROUPS
-- ---------------------------------------------------------
CREATE TABLE user_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_code VARCHAR(50) NOT NULL,

    name VARCHAR(150) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    scope_type VARCHAR(20) NOT NULL,
    scope_ref_kind VARCHAR(20),
    scope_ref_id VARCHAR(100),

    -- Restricted JSON rule format. Application code validates the closed
    -- field/operator vocabulary and translates it safely.
    matching_rule JSONB NOT NULL,
    rule_attribute_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    -- Configuration version vs. last fully materialized version.
    version INTEGER NOT NULL DEFAULT 1,
    projection_version INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,

    CONSTRAINT fk_user_groups_tenant
        FOREIGN KEY (tenant_code)
        REFERENCES tenants (tenant_code)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT uq_user_groups_tenant_name
        UNIQUE (tenant_code, name),

    CONSTRAINT uq_user_groups_tenant_id
        UNIQUE (tenant_code, id),

    CONSTRAINT chk_user_groups_status
        CHECK (status IN ('ACTIVE', 'INACTIVE')),

    CONSTRAINT chk_user_groups_scope_type
        CHECK (
            scope_type IN (
                'SELF',
                'DIRECT_REPORTEES',
                'COMPANY',
                'LOCATION',
                'DEPARTMENT',
                'TENANT'
            )
        ),

    CONSTRAINT chk_user_groups_scope_reference
        CHECK (
            (scope_type IN ('SELF', 'DIRECT_REPORTEES', 'TENANT')
                AND scope_ref_kind IS NULL
                AND scope_ref_id IS NULL)
            OR
            (scope_type = 'COMPANY'
                AND scope_ref_kind = 'COMPANY'
                AND scope_ref_id IS NOT NULL)
            OR
            (scope_type = 'LOCATION'
                AND scope_ref_kind = 'LOCATION'
                AND scope_ref_id IS NOT NULL)
            OR
            (scope_type = 'DEPARTMENT'
                AND scope_ref_kind = 'DEPARTMENT'
                AND scope_ref_id IS NOT NULL)
        ),

    CONSTRAINT chk_user_groups_matching_rule
        CHECK (jsonb_typeof(matching_rule) = 'object'),

    CONSTRAINT chk_user_groups_version
        CHECK (version >= 1),

    CONSTRAINT chk_user_groups_projection_version
        CHECK (
            projection_version >= 0
            AND projection_version <= version
        )
);

CREATE INDEX idx_user_groups_tenant_status
    ON user_groups (tenant_code, status);

-- Attribute dependency index used by:
-- WHERE tenant_code = ? AND rule_attribute_keys && ?::text[]
CREATE INDEX idx_user_groups_rule_attribute_keys
    ON user_groups
    USING GIN (rule_attribute_keys);

-- Scheduled reconciliation scans only dirty User Groups.
CREATE INDEX idx_user_groups_dirty
    ON user_groups (tenant_code, id, version, projection_version)
    WHERE version <> projection_version;

-- ---------------------------------------------------------
-- USER GROUP -> ROLE ASSIGNMENT
-- ---------------------------------------------------------
CREATE TABLE user_group_roles (
    tenant_code VARCHAR(50) NOT NULL,
    user_group_id UUID NOT NULL,
    role_id UUID NOT NULL,

    PRIMARY KEY (user_group_id, role_id),

    CONSTRAINT fk_user_group_roles_tenant
        FOREIGN KEY (tenant_code)
        REFERENCES tenants (tenant_code)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_user_group_roles_group
        FOREIGN KEY (tenant_code, user_group_id)
        REFERENCES user_groups (tenant_code, id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_user_group_roles_role
        FOREIGN KEY (tenant_code, role_id)
        REFERENCES roles (tenant_code, id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE INDEX idx_user_group_roles_role
    ON user_group_roles (tenant_code, role_id, user_group_id);

-- ---------------------------------------------------------
-- MATERIALIZED USER GROUP MEMBERSHIPS
-- ---------------------------------------------------------
CREATE TABLE user_group_memberships (
    tenant_code VARCHAR(50) NOT NULL,
    user_group_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evaluated_group_version INTEGER NOT NULL,

    PRIMARY KEY (user_group_id, employee_id),

    CONSTRAINT fk_user_group_memberships_tenant
        FOREIGN KEY (tenant_code)
        REFERENCES tenants (tenant_code)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_user_group_memberships_group
        FOREIGN KEY (tenant_code, user_group_id)
        REFERENCES user_groups (tenant_code, id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_user_group_memberships_employee
        FOREIGN KEY (tenant_code, employee_id)
        REFERENCES employee_references (tenant_code, employee_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT chk_user_group_memberships_version
        CHECK (evaluated_group_version >= 1)
);

CREATE INDEX idx_user_group_memberships_employee
    ON user_group_memberships (tenant_code, employee_id, user_group_id);

CREATE INDEX idx_user_group_memberships_group_version
    ON user_group_memberships (
        tenant_code,
        user_group_id,
        evaluated_group_version
    );

-- ---------------------------------------------------------
-- MATERIALIZED EFFECTIVE USER ROLES
-- ---------------------------------------------------------
-- One row per (user, role, source User Group). It deliberately stores
-- Role + Scope, not flattened Permission codes.
CREATE TABLE user_effective_roles (
    tenant_code VARCHAR(50) NOT NULL,
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    source_group_id UUID NOT NULL,

    scope_type VARCHAR(20) NOT NULL,
    scope_ref_id VARCHAR(100),

    group_version INTEGER NOT NULL,
    role_version INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, role_id, source_group_id),

    CONSTRAINT fk_user_effective_roles_tenant
        FOREIGN KEY (tenant_code)
        REFERENCES tenants (tenant_code)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_user_effective_roles_user
        FOREIGN KEY (tenant_code, user_id)
        REFERENCES users (tenant_code, id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_user_effective_roles_role
        FOREIGN KEY (tenant_code, role_id)
        REFERENCES roles (tenant_code, id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_user_effective_roles_group
        FOREIGN KEY (tenant_code, source_group_id)
        REFERENCES user_groups (tenant_code, id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT chk_user_effective_roles_scope_type
        CHECK (
            scope_type IN (
                'SELF',
                'DIRECT_REPORTEES',
                'COMPANY',
                'LOCATION',
                'DEPARTMENT',
                'TENANT'
            )
        ),

    CONSTRAINT chk_user_effective_roles_scope_reference
        CHECK (
            (scope_type IN ('SELF', 'DIRECT_REPORTEES', 'TENANT')
                AND scope_ref_id IS NULL)
            OR
            (scope_type IN ('COMPANY', 'LOCATION', 'DEPARTMENT')
                AND scope_ref_id IS NOT NULL)
        ),

    CONSTRAINT chk_user_effective_roles_versions
        CHECK (group_version >= 1 AND role_version >= 1)
);

-- Hot Redis-rebuild path:
-- SELECT ... FROM user_effective_roles WHERE tenant_code=? AND user_id=?
CREATE INDEX idx_user_effective_roles_user
    ON user_effective_roles (tenant_code, user_id);

-- Impact analysis:
-- COUNT(DISTINCT user_id) WHERE role_id=?
CREATE INDEX idx_user_effective_roles_role
    ON user_effective_roles (tenant_code, role_id, user_id);

CREATE INDEX idx_user_effective_roles_source_group
    ON user_effective_roles (tenant_code, source_group_id, user_id);

-- ---------------------------------------------------------
-- AUTHORIZATION SYNCHRONIZATION JOBS
-- ---------------------------------------------------------
CREATE TABLE authorization_sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_code VARCHAR(50) NOT NULL,

    source_type VARCHAR(20) NOT NULL,
    source_id UUID NOT NULL,
    source_version INTEGER NOT NULL,

    trigger_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',

    affected_users INTEGER,
    processed_users INTEGER NOT NULL DEFAULT 0,

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Admin user for MANUAL jobs; NULL for SCHEDULED/SYSTEM.
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    failure_reason TEXT,

    CONSTRAINT fk_authorization_sync_jobs_tenant
        FOREIGN KEY (tenant_code)
        REFERENCES tenants (tenant_code)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_authorization_sync_jobs_source_type
        CHECK (source_type IN ('USER_GROUP', 'ROLE')),

    CONSTRAINT chk_authorization_sync_jobs_trigger_type
        CHECK (trigger_type IN ('MANUAL', 'SCHEDULED', 'SYSTEM')),

    CONSTRAINT chk_authorization_sync_jobs_status
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),

    CONSTRAINT chk_authorization_sync_jobs_source_version
        CHECK (source_version >= 1),

    CONSTRAINT chk_authorization_sync_jobs_counts
        CHECK (
            processed_users >= 0
            AND (affected_users IS NULL OR affected_users >= 0)
        ),

    CONSTRAINT chk_authorization_sync_jobs_timestamps
        CHECK (
            (status = 'PENDING' AND started_at IS NULL AND completed_at IS NULL)
            OR
            (status = 'PROCESSING' AND started_at IS NOT NULL AND completed_at IS NULL)
            OR
            (status IN ('COMPLETED', 'FAILED')
                AND started_at IS NOT NULL
                AND completed_at IS NOT NULL)
        )
);

-- Database-level idempotency for duplicate Sync Now / scheduler races.
CREATE UNIQUE INDEX uq_authorization_sync_jobs_one_active
    ON authorization_sync_jobs (
        tenant_code,
        source_type,
        source_id,
        source_version
    )
    WHERE status IN ('PENDING', 'PROCESSING');

-- Worker claiming / watchdog recovery query.
CREATE INDEX idx_authorization_sync_jobs_claim
    ON authorization_sync_jobs (status, created_at, started_at)
    WHERE status IN ('PENDING', 'PROCESSING');

CREATE INDEX idx_authorization_sync_jobs_source_history
    ON authorization_sync_jobs (
        tenant_code,
        source_type,
        source_id,
        created_at DESC
    );

CREATE INDEX idx_authorization_sync_jobs_tenant_status
    ON authorization_sync_jobs (tenant_code, status, created_at);

-- ---------------------------------------------------------
-- AUTHORIZATION COMMENTS / INVARIANTS
-- ---------------------------------------------------------
COMMENT ON TABLE roles IS
'Tenant-scoped Role definitions. Permissions themselves are static code-owned catalog entries and have no database table.';

COMMENT ON TABLE role_permissions IS
'Role grants using stable Permission Catalog IDs such as location.view. permission_code has intentionally no FK to a permissions table.';

COMMENT ON TABLE user_groups IS
'Dynamic employee population definition. version > projection_version means the saved configuration is pending synchronization.';

COMMENT ON COLUMN user_groups.matching_rule IS
'Restricted Matching Rule JSON. Application code permits only the closed field/operator vocabulary defined by Authorization System Overview.';

COMMENT ON COLUMN user_groups.rule_attribute_keys IS
'Denormalized dependency keys used to reevaluate only User Groups affected by changed employee attributes.';

COMMENT ON TABLE user_group_memberships IS
'Current materialized membership only. Row presence means currently matched; membership history belongs to the immutable audit/outbox trail.';

COMMENT ON TABLE user_effective_roles IS
'Durable user-to-Role-and-Scope projection used to rebuild authz:user:* Redis keys. It intentionally does not flatten Role Permissions per user.';

COMMENT ON TABLE authorization_sync_jobs IS
'Durable synchronization job history for User Group rebuilds. ROLE is reserved/defensive; current Role Permission propagation is synchronous.';


-- =========================================================
-- AUTH SECURITY EVENTS OUTBOX
-- =========================================================
CREATE TABLE auth_security_events_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_code VARCHAR(50) NOT NULL,
    user_id UUID,
    event_type VARCHAR(100) NOT NULL,
    sanitized_payload JSONB NOT NULL DEFAULT '{}' :: JSONB,
    publish_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_auth_security_events_outbox_tenant FOREIGN KEY (tenant_code) REFERENCES tenants (tenant_code) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_auth_security_events_outbox_user FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE
    SET
        NULL,
        CONSTRAINT chk_auth_security_events_payload CHECK (jsonb_typeof(sanitized_payload) = 'object')
);

CREATE INDEX idx_auth_security_events_outbox_publish ON auth_security_events_outbox (
    publish_status,
    created_at
);

CREATE INDEX idx_auth_security_events_outbox_tenant_created ON auth_security_events_outbox (
    tenant_code,
    created_at DESC
);

CREATE INDEX idx_auth_security_events_outbox_user_created ON auth_security_events_outbox (
    user_id,
    created_at DESC
)
WHERE
    user_id IS NOT NULL;

COMMIT;

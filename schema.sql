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
    CONSTRAINT fk_employee_references_tenant FOREIGN KEY (tenant_code) REFERENCES tenants (tenant_code) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT uq_employee_references_tenant_employee_code UNIQUE (tenant_code, employee_code),
    -- Phục vụ composite FK từ USERS để bảo đảm employee
    -- và user luôn thuộc cùng một tenant.
    CONSTRAINT uq_employee_references_tenant_employee_id UNIQUE (tenant_code, employee_id)
);

CREATE INDEX idx_employee_references_tenant_status ON employee_references (tenant_code, status);

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

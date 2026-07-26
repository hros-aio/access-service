import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';

import { Tenant } from './tenant.entity';

@Entity('authentication_settings')
export class AuthenticationSettings extends BaseEntity {
  @Column({ name: 'restricted_mfa_enabled', type: 'boolean', default: false })
  restrictedMfaEnabled: boolean;

  @Column({ name: 'need_admin_reset_password', type: 'boolean', default: false })
  needAdminResetPassword: boolean;

  @Column({ name: 'account_lockout_enabled', type: 'boolean', default: false })
  accountLockoutEnabled: boolean;

  @Column({ name: 'max_failed_retries', type: 'integer', default: 5 })
  maxFailedRetries: number;

  @Column({ name: 'ip_restriction_enabled', type: 'boolean', default: false })
  ipRestrictionEnabled: boolean;

  @Column({ name: 'allowed_ip_cidrs', type: 'jsonb', default: () => "'[]'::jsonb" })
  allowedIpCidrs: object;

  @OneToOne(() => Tenant, (tenant) => tenant.authenticationSettings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_code', referencedColumnName: 'tenantCode' })
  tenant?: Tenant;
}

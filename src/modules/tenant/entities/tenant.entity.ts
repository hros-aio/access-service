import { Column, Entity, OneToOne, PrimaryColumn } from 'typeorm';

import { AuthenticationSettings } from './authentication-settings.entity';

@Entity('tenants')
export class Tenant {
  @PrimaryColumn({ name: 'tenant_code', type: 'varchar', length: 50 })
  tenantCode: string;

  @Column({ name: 'company_id', type: 'varchar', length: 100, unique: true })
  companyId: string;

  @Column({ name: 'status', type: 'varchar', length: 30 })
  status: string;

  @OneToOne(() => AuthenticationSettings, (settings) => settings.tenant)
  authenticationSettings?: AuthenticationSettings;
}

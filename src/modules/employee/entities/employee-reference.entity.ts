import { Column, Entity, ManyToOne, PrimaryColumn, JoinColumn } from 'typeorm';

import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('employee_references')
export class EmployeeReference {
  @PrimaryColumn({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'tenant_code', type: 'varchar', length: 50 })
  tenantCode: string;

  @Column({ name: 'employee_code', type: 'varchar', length: 100 })
  employeeCode: string;

  @Column({ name: 'status', type: 'varchar', length: 30 })
  status: string;

  @Column({ name: 'source_version', type: 'varchar', length: 100, nullable: true })
  sourceVersion?: string;

  @Column({ name: 'synchronized_at', type: 'timestamptz', default: () => 'NOW()' })
  synchronizedAt: Date;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_code', referencedColumnName: 'tenantCode' })
  tenant?: Tenant;
}

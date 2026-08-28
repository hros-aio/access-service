import { Column, Entity, ManyToOne, PrimaryColumn, JoinColumn, Unique } from 'typeorm';

import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('employee_references')
@Unique('uq_employee_references_tenant_employee_code', ['tenantCode', 'employeeCode'])
@Unique('uq_employee_references_tenant_employee_id', ['tenantCode', 'employeeId'])
export class EmployeeReference {
  @PrimaryColumn({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'tenant_code', type: 'varchar', length: 50 })
  tenantCode: string;

  @Column({ name: 'employee_code', type: 'varchar', length: 100 })
  employeeCode: string;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId?: string | null;

  @Column({ name: 'location_id', type: 'uuid', nullable: true })
  locationId?: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId?: string | null;

  @Column({ name: 'grade_id', type: 'uuid', nullable: true })
  gradeId?: string | null;

  @Column({ name: 'job_title_id', type: 'uuid', nullable: true })
  jobTitleId?: string | null;

  @Column({ name: 'employment_status', type: 'varchar', length: 50, default: 'ACTIVE' })
  employmentStatus: string;

  @Column({ name: 'status', type: 'varchar', length: 30 })
  status: string;

  @Column({ name: 'manager_employee_id', type: 'uuid', nullable: true })
  managerEmployeeId?: string | null;

  @Column({ name: 'reportees_count', type: 'int', default: 0 })
  reporteesCount: number;

  @Column({ name: 'source_version', type: 'varchar', length: 100, nullable: true })
  sourceVersion?: string | null;

  @Column({ name: 'synchronized_at', type: 'timestamptz', default: () => 'NOW()' })
  synchronizedAt: Date;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_code', referencedColumnName: 'tenantCode' })
  tenant?: Tenant;
}

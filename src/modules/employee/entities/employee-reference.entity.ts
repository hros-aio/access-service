import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, Unique } from 'typeorm';

@Entity('employee_references')
@Unique('uq_employee_references_tenant_employee_code', ['tenant_code', 'employee_code'])
export class EmployeeReference extends BaseEntity {
  @Column({ name: 'employee_code', type: 'varchar', length: 100 })
  employeeCode: string;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string;

  @Column({ name: 'location_id', type: 'uuid', nullable: true })
  locationId: string;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string;

  @Column({ name: 'grade_id', type: 'uuid', nullable: true })
  gradeId?: string;

  @Column({ name: 'job_title_id', type: 'uuid', nullable: true })
  jobTitleId?: string;

  @Column({ name: 'employment_status', type: 'varchar', length: 50, default: 'ACTIVE' })
  employmentStatus: string;

  @Column({ name: 'status', type: 'varchar', length: 30 })
  status: string;

  @Column({ name: 'manager_id', type: 'uuid', nullable: true })
  managerId: string;

  @Column({ name: 'reportees_count', type: 'int', default: 0 })
  reporteesCount: number;

  @Column({ name: 'source_version', type: 'varchar', length: 100, nullable: true })
  sourceVersion?: string;

  @Column({ name: 'synchronized_at', type: 'timestamptz', default: () => 'NOW()' })
  synchronizedAt: Date;
}

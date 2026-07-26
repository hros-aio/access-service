import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';

import { EmployeeReference } from '../../employee/entities/employee-reference.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ name: 'employee_ref_id', type: 'uuid', nullable: true })
  employeeRefId?: string;

  @Column({ name: 'normalized_email', type: 'varchar', length: 320 })
  normalizedEmail: string;

  @Column({ name: 'display_email', type: 'varchar', length: 320 })
  displayEmail: string;

  @Column({ name: 'user_type', type: 'varchar', length: 30 })
  userType: string;

  @Column({ name: 'status', type: 'varchar', length: 30 })
  status: string;

  @Column({ name: 'credential_status', type: 'varchar', length: 30 })
  credentialStatus: string;

  @Column({ name: 'security_version', type: 'integer', default: 1 })
  securityVersion: number;

  @Column({ name: 'protected_root_admin', type: 'boolean', default: false })
  protectedRootAdmin: boolean;

  @Column({ name: 'mfa_enrollment_required', type: 'boolean', default: false })
  mfaEnrollmentRequired: boolean;

  @Column({ name: 'mfa_reenrollment_required', type: 'boolean', default: false })
  mfaReenrollmentRequired: boolean;

  @OneToOne(() => EmployeeReference, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn([
    { name: 'tenant_code', referencedColumnName: 'tenantCode' },
    { name: 'employee_ref_id', referencedColumnName: 'employeeId' },
  ])
  employeeReference?: EmployeeReference;
}

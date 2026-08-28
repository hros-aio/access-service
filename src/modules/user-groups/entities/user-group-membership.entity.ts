import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { UserGroup } from './user-group.entity';
import { EmployeeReference } from '../../employee/entities/employee-reference.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('user_group_memberships')
@Unique('uq_user_group_memberships_tenant_group_employee', ['tenantCode', 'groupId', 'employeeId'])
export class UserGroupMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_code', type: 'varchar', length: 50 })
  tenantCode: string;

  @Column({ name: 'group_id', type: 'uuid' })
  groupId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'matched_at', type: 'timestamptz', default: () => 'NOW()' })
  matchedAt: Date;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_code', referencedColumnName: 'tenantCode' })
  tenant?: Tenant;

  @ManyToOne(() => UserGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  userGroup?: UserGroup;

  @ManyToOne(() => EmployeeReference, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee?: EmployeeReference;
}

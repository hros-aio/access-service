import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { EmployeeReference } from '../../employee/entities/employee-reference.entity';

import { TableName } from '@/enums';

@Entity(TableName.USER_GROUP_MEMBERSHIPS)
@Unique('uq_user_group_memberships_tenant_group_employee', ['tenant_code', 'group_id', 'user_id'])
export class UserGroupMembership extends BaseEntity {
  @Column({ name: 'group_id', type: 'uuid' })
  groupId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'matched_at', type: 'timestamptz', default: () => 'NOW()' })
  matchedAt: Date;

  @ManyToOne(() => EmployeeReference, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee?: EmployeeReference;
}

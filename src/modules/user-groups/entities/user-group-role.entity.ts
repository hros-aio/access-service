import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { UserGroup } from './user-group.entity';
import { TableName } from '../../../enums';
import { Role } from '../../roles/entities/role.entity';

@Entity(TableName.USER_GROUP_ROLES)
@Unique('uq_user_group_roles_tenant_group_role', ['tenantCode', 'userGroupId', 'roleId'])
export class UserGroupRole extends BaseEntity {
  @Column({ name: 'user_group_id', type: 'uuid' })
  userGroupId: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @ManyToOne(() => UserGroup, (ug) => ug.groupRoles, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'user_group_id' })
  userGroup?: UserGroup;

  @ManyToOne(() => Role, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role?: Role;
}

import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { Role } from './role.entity';
import { TableName } from '../../../enums';

@Entity(TableName.ROLE_PERMISSIONS)
@Unique('uq_role_permissions_role_perm', ['roleId', 'permissionCode'])
export class RolePermission extends BaseEntity {
  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @Column({ name: 'permission_code', type: 'varchar', length: 150 })
  permissionCode: string;

  @Column({ name: 'is_protected', type: 'boolean', default: false })
  isProtected: boolean;

  @ManyToOne(() => Role, (role) => role.permissions, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role?: Role;
}

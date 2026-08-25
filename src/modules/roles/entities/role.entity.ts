import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, OneToMany, Unique } from 'typeorm';

import { RolePermission } from './role-permission.entity';
import { TableName } from '../../../enums';
import { RoleStatus, RoleType, SystemRoleKey } from '../interfaces/system-role-template.interface';

@Entity(TableName.ROLES)
@Unique('uq_roles_tenant_name', ['tenantCode', 'name'])
@Unique('uq_roles_tenant_id', ['tenantCode', 'id'])
export class Role extends BaseEntity {
  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'role_type', type: 'varchar', length: 20 })
  type: RoleType;

  @Column({ name: 'status', type: 'varchar', length: 20, default: RoleStatus.ACTIVE })
  status: RoleStatus;

  @Column({ name: 'system_role_key', type: 'varchar', length: 100, nullable: true })
  systemRoleKey?: SystemRoleKey;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string;

  @OneToMany(() => RolePermission, (rolePermission) => rolePermission.role, { cascade: true })
  permissions?: RolePermission[];
}

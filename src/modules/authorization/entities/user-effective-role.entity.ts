import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, Unique } from 'typeorm';

import { TableName } from '../../../enums';

@Entity(TableName.USER_EFFECTIVE_ROLES)
@Unique('uq_user_effective_roles_grant', [
  'tenantCode',
  'employeeId',
  'roleId',
  'sourceGroupId',
  'scopeType',
  'scopeEntityId',
])
export class UserEffectiveRoleEntity extends BaseEntity {
  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @Column({ name: 'source_group_id', type: 'uuid' })
  sourceGroupId: string;

  @Column({ name: 'scope_type', type: 'varchar', length: 50 })
  scopeType: string;

  @Column({ name: 'scope_entity_id', type: 'uuid', nullable: true })
  scopeEntityId?: string | null;
}

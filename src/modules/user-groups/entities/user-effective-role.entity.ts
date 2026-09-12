import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { UserGroup } from './user-group.entity';
import { TableName } from '../../../enums';
import { Role } from '../../roles/entities/role.entity';

@Entity(TableName.USER_EFFECTIVE_ROLES)
@Unique('uq_user_effective_roles_grant', [
  'tenantCode',
  'user_id',
  'roleId',
  'sourceGroupId',
  'scopeType',
  'scopeEntityId',
])
export class UserEffectiveRole extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @Column({ name: 'source_group_id', type: 'uuid' })
  sourceGroupId: string;

  @Column({ name: 'scope_type', type: 'varchar', length: 50 })
  scopeType: string;

  @Column({ name: 'scope_entity_id', type: 'uuid', nullable: true })
  scopeEntityId?: string | null;

  @ManyToOne(() => Role, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'role_id' })
  role?: Role;

  @ManyToOne(() => UserGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_group_id' })
  sourceGroup?: UserGroup;
}

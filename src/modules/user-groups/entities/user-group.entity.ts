import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, OneToMany, Unique } from 'typeorm';

import { UserGroupRole } from './user-group-role.entity';
import { TableName } from '../../../enums';
import { ScopeType, UserGroupStatus } from '../domain/enums';
import { MatchingRule } from '../domain/value-objects/matching-rule.vo';

@Entity(TableName.USER_GROUPS)
@Unique('uq_user_groups_tenant_name', ['tenantCode', 'name'])
@Unique('uq_user_groups_tenant_id', ['tenantCode', 'id'])
export class UserGroup extends BaseEntity {
  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: UserGroupStatus.ACTIVE })
  status: UserGroupStatus;

  @Column({ name: 'scope_type', type: 'varchar', length: 50 })
  scopeType: ScopeType;

  @Column({ name: 'scope_ref_id', type: 'varchar', length: 100, nullable: true })
  scopeRefId?: string;

  @Column({ name: 'matching_rule', type: 'jsonb' })
  matchingRule: MatchingRule;

  @Column({ name: 'rule_attribute_keys', type: 'text', array: true, default: '{}' })
  ruleAttributeKeys: string[];

  @Column({ name: 'projection_version', type: 'int', default: 0 })
  projectionVersion: number;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string;

  @OneToMany(() => UserGroupRole, (ugr) => ugr.userGroup, { cascade: true })
  groupRoles?: UserGroupRole[];
}

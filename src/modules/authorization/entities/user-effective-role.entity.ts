import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('user_effective_roles')
@Unique('uq_user_effective_roles_grant', [
  'tenantCode',
  'employeeId',
  'roleId',
  'sourceGroupId',
  'scopeType',
  'scopeEntityId',
])
export class UserEffectiveRoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_code', type: 'varchar', length: 50 })
  tenantCode: string;

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

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;
}

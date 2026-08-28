import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { UserGroup } from './user-group.entity';
import { EmployeeReference } from '../../employee/entities/employee-reference.entity';
import { Role } from '../../roles/entities/role.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('user_effective_roles')
@Unique('uq_user_effective_roles_grant', [
  'tenantCode',
  'employeeId',
  'roleId',
  'sourceGroupId',
  'scopeType',
  'scopeEntityId',
])
export class UserEffectiveRole {
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

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_code', referencedColumnName: 'tenantCode' })
  tenant?: Tenant;

  @ManyToOne(() => EmployeeReference, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee?: EmployeeReference;

  @ManyToOne(() => Role, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'role_id' })
  role?: Role;

  @ManyToOne(() => UserGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_group_id' })
  sourceGroup?: UserGroup;
}

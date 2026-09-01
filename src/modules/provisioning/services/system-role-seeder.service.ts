import { Injectable, Logger } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';

import { SYSTEM_ROLE_TEMPLATES } from '../../roles/constants/system-role-templates.constant';
import { RolePermission } from '../../roles/entities/role-permission.entity';
import { Role } from '../../roles/entities/role.entity';
import { RoleType, SystemRoleKey } from '../../roles/interfaces/system-role-template.interface';
import { RolePermissionRepository } from '../../roles/repositories/role-permission.repository';
import { RoleRepository } from '../../roles/repositories/role.repository';
import { RoleCacheService } from '../../roles/services/role-cache.service';

@Injectable()
export class SystemRoleSeederService {
  private readonly logger = new Logger(SystemRoleSeederService.name);

  constructor(
    private readonly transactionService: TransactionService,
    private readonly roleRepository: RoleRepository,
    private readonly rolePermissionRepository: RolePermissionRepository,
    private readonly roleCacheService: RoleCacheService,
  ) {}

  async seedBaselineSystemRoles(tenantCode: string): Promise<Role[]> {
    this.logger.log(`Seeding baseline system roles for tenant '${tenantCode}'...`);

    const createdRoles: Role[] = [];

    await this.transactionService.runInTransaction(async () => {
      for (const templateKey of Object.values(SystemRoleKey)) {
        const template = SYSTEM_ROLE_TEMPLATES[templateKey];

        // Check if role already exists for tenant
        const existing = await this.roleRepository.findBySystemKey(templateKey);
        if (existing) {
          createdRoles.push(existing);
          continue;
        }

        // 1. Create Role
        const role = new Role();
        role.tenantCode = tenantCode;
        role.name = template.defaultName;
        role.description = template.description;
        role.type = RoleType.SYSTEM;
        role.systemRoleKey = template.key;
        role.version = 1;

        const savedRole = await this.roleRepository.save(role);

        // 2. Create Role Permissions
        const rolePermissions = template.permissions.map((p) => {
          const rp = new RolePermission();
          rp.tenantCode = tenantCode;
          rp.roleId = savedRole.id;
          rp.permissionCode = p.code;
          rp.isProtected = p.isProtected;
          return rp;
        });

        await this.rolePermissionRepository.bulkSave(rolePermissions);

        savedRole.permissions = rolePermissions;
        createdRoles.push(savedRole);
      }
    });

    // 3. Synchronize to Redis cache
    for (const role of createdRoles) {
      await this.roleCacheService.syncRole(role);
    }

    this.logger.log(
      `Successfully seeded ${createdRoles.length} system roles for tenant '${tenantCode}'.`,
    );
    return createdRoles;
  }
}

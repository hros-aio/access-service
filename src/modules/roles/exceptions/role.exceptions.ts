import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';

export class CannotDeleteSystemRoleException extends BadRequestException {
  constructor(roleId: string, roleName: string) {
    super(
      `System role '${roleName}' (${roleId}) cannot be deleted because it is managed by the platform.`,
    );
  }
}

export class ProtectedCapabilityRemovalException extends UnprocessableEntityException {
  constructor(roleName: string, protectedCapabilities: string[]) {
    super(
      `Cannot remove protected capabilities [${protectedCapabilities.join(', ')}] from system role '${roleName}'. Protected capabilities are inviolable.`,
    );
  }
}

export class DuplicateRoleNameException extends ConflictException {
  constructor(name: string) {
    super(`A role with name '${name}' already exists in this tenant.`);
  }
}

export class CriticalRoleDeactivationException extends BadRequestException {
  constructor(roleName: string) {
    super(`Critical system role '${roleName}' cannot be deactivated or disabled.`);
  }
}

export class RoleNotFoundException extends BadRequestException {
  constructor(roleId: string) {
    super(`Role with id '${roleId}' was not found in the current tenant.`);
  }
}

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

export class CannotMutateSystemRoleException extends BadRequestException {
  constructor(roleName: string) {
    super(`System role '${roleName}' cannot be modified via custom role operations.`);
  }
}

export class RoleVersionConflictException extends ConflictException {
  constructor(roleId: string, expectedVersion: number, actualVersion: number) {
    super(
      `Concurrency conflict on role '${roleId}'. Expected version ${expectedVersion}, but actual version is ${actualVersion}.`,
    );
  }
}

export class RoleDeactivationConfirmationRequiredException extends BadRequestException {
  constructor(affectedUserGroupCount: number, affectedUserCount: number) {
    super(
      `This role is currently assigned to ${affectedUserGroupCount} user group(s) affecting ${affectedUserCount} user(s). Explicit confirmation is required to deactivate.`,
    );
  }
}

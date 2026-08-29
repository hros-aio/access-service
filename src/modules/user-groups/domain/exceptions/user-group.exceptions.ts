import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

export class InvalidMatchingRuleError extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}

export class ConcurrentModificationError extends ConflictException {
  constructor(
    message = 'User Group was modified concurrently by another process. Please refresh and try again.',
  ) {
    super(message);
  }
}

export class UserGroupNotFoundError extends NotFoundException {
  constructor(userGroupId: string) {
    super(`User Group with ID "${userGroupId}" was not found`);
  }
}

export class InvalidScopeError extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}

export class DuplicateUserGroupNameError extends ConflictException {
  constructor(name: string) {
    super(`User Group with name "${name}" already exists in this tenant`);
  }
}

export class InvalidStateTransitionError extends ConflictException {
  constructor(message: string) {
    super(message);
  }
}

export class HighImpactConfirmationRequiredError extends BadRequestException {
  constructor(
    public readonly details: {
      affectedUserCount: number;
      zeroRoleUserCount?: number;
      threshold: number;
    },
  ) {
    super({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: `High-impact change affects ${details.affectedUserCount} users (threshold: ${details.threshold}). Explicit confirmation is required.`,
      details,
    });
  }
}

export class InvalidRoleAssignmentError extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}

import { Injectable } from '@nestjs/common';

import { EffectiveUserRole, ResourceContext } from '../interfaces/effective-user-role.interface';

@Injectable()
export class CumulativeAccessEvaluator {
  /**
   * Pure evaluation logic resolving whether a required permission is held across any assigned Role
   * and satisfies the cumulative union of applicable scopes against the requested resource.
   */
  evaluateAccess(
    requiredPermission: string,
    userRoles: EffectiveUserRole[],
    rolePermissionsMap: Map<string, string[]>,
    targetResource: ResourceContext,
    currentEmployeeId: string,
  ): boolean {
    if (!userRoles || userRoles.length === 0) {
      return false;
    }

    // 1. Filter user roles that grant the required permission
    const grantingRoles = userRoles.filter((userRole) => {
      const perms = rolePermissionsMap.get(userRole.roleId);
      return perms ? perms.includes(requiredPermission) : false;
    });

    if (grantingRoles.length === 0) {
      return false;
    }

    // 2. Cumulative Scope Union: check if ANY matching grant's scope satisfies the target resource (logical OR)
    for (const grant of grantingRoles) {
      if (
        this.evaluateScope(grant.scope.type, grant.scope.refId, targetResource, currentEmployeeId)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Evaluates a single scope constraint against resource context.
   */
  private evaluateScope(
    scopeType: string,
    scopeRefId: string | null,
    targetResource: ResourceContext,
    currentEmployeeId: string,
  ): boolean {
    switch (scopeType) {
      case 'TENANT':
      case 'TENANT_WIDE':
        return true;

      case 'SELF':
        return !!targetResource.employeeId && targetResource.employeeId === currentEmployeeId;

      case 'DIRECT_REPORTEES':
        return !!targetResource.managerId && targetResource.managerId === currentEmployeeId;

      case 'COMPANY':
        return (
          !!scopeRefId &&
          !!targetResource.companyId &&
          targetResource.companyId.toLowerCase() === scopeRefId.toLowerCase()
        );

      case 'LOCATION':
        return (
          !!scopeRefId &&
          !!targetResource.locationId &&
          targetResource.locationId.toLowerCase() === scopeRefId.toLowerCase()
        );

      case 'DEPARTMENT':
        return (
          !!scopeRefId &&
          !!targetResource.departmentId &&
          targetResource.departmentId.toLowerCase() === scopeRefId.toLowerCase()
        );

      default:
        return false;
    }
  }
}

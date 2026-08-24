import { Injectable, Logger } from '@nestjs/common';

import { PermissionCatalogService } from './permission-catalog.service';
import { PERMISSION_ACTION_REGEX } from '../constants/permission-catalog.constants';
import { DependencyViolation, ValidationResult } from '../interfaces/validation-result.interface';

@Injectable()
export class PermissionDependencyService {
  private readonly logger = new Logger(PermissionDependencyService.name);

  constructor(private readonly catalogService: PermissionCatalogService) {}

  public validatePermissionSet(requestedCodes: readonly string[]): ValidationResult {
    const errors: DependencyViolation[] = [];
    const requestedSet = new Set<string>(requestedCodes);
    const graph = this.catalogService.getGraph();

    // 1. Validate naming format, catalog existence, and deprecation
    for (const code of requestedCodes) {
      if (!code || !PERMISSION_ACTION_REGEX.test(code)) {
        errors.push({
          code,
          type: 'INVALID_FORMAT',
          message: `Permission code '${code}' violates 'resource.action' format standard.`,
        });
        continue;
      }

      const node = graph.nodes.get(code);
      if (!node) {
        errors.push({
          code,
          type: 'UNKNOWN_CODE',
          message: `Permission code '${code}' is not recognized in the platform catalog.`,
        });
        continue;
      }

      if (node.definition.deprecated) {
        errors.push({
          code,
          type: 'DEPRECATED_CODE',
          message: `Permission code '${code}' is deprecated and cannot be assigned to roles.`,
        });
      }
    }

    // If there are invalid/unknown codes, return early before graph traversal
    if (errors.length > 0) {
      return {
        isValid: false,
        errors,
      };
    }

    // 2. Validate Prerequisite Capability Rule (Forward traversal: A requires B)
    for (const code of requestedCodes) {
      const node = graph.nodes.get(code)!;
      for (const prerequisite of node.prerequisites) {
        if (!requestedSet.has(prerequisite)) {
          errors.push({
            code,
            type: 'MISSING_PREREQUISITE',
            message: `Granting '${code}' requires prerequisite capability '${prerequisite}'.`,
            conflictCodes: [prerequisite],
          });
        }
      }
    }

    // 3. Validate Dependent Retention Rule (Reverse traversal: removing B while A is present)
    for (const code of requestedCodes) {
      const node = graph.nodes.get(code)!;
      for (const prerequisite of node.prerequisites) {
        if (!requestedSet.has(prerequisite)) {
          // This also captures the blocked revocation scenario: the presence of 'code' blocks removal of 'prerequisite'
          const existingViolation = errors.find(
            (e) => e.code === prerequisite && e.type === 'BLOCKED_BY_DEPENDENT',
          );
          if (existingViolation) {
            (existingViolation.conflictCodes as string[]).push(code);
          } else {
            errors.push({
              code: prerequisite,
              type: 'BLOCKED_BY_DEPENDENT',
              message: `Cannot remove prerequisite '${prerequisite}' while dependent capability '${code}' remains active.`,
              conflictCodes: [code],
            });
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

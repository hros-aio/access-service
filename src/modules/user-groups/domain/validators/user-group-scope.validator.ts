import { ScopeType } from '../enums/scope-type.enum';
import { InvalidScopeError } from '../exceptions/user-group.exceptions';

export interface ValidatedScopeResult {
  scopeType: ScopeType;
  scopeRefId: string | null;
}

export class UserGroupScopeValidator {
  private static readonly ENTITY_ANCHORED_SCOPES = new Set<ScopeType>([
    ScopeType.COMPANY,
    ScopeType.LOCATION,
    ScopeType.DEPARTMENT,
  ]);

  private static readonly UNANCHORED_SCOPES = new Set<ScopeType>([
    ScopeType.SELF,
    ScopeType.DIRECT_REPORTEES,
    ScopeType.TENANT_WIDE,
  ]);

  public static validate(
    scopeType: ScopeType | string,
    scopeRefId?: string | null,
  ): ValidatedScopeResult {
    if (!scopeType) {
      throw new InvalidScopeError('Scope type is required');
    }

    // Normalize TENANT to TENANT_WIDE if provided as alias
    let normalizedScopeType = scopeType as ScopeType;
    if (scopeType === 'TENANT') {
      normalizedScopeType = ScopeType.TENANT_WIDE;
    }

    if (!Object.values(ScopeType).includes(normalizedScopeType)) {
      throw new InvalidScopeError(
        `Invalid scope type "${scopeType}". Valid types are: ${Object.values(ScopeType).join(', ')}`,
      );
    }

    if (this.ENTITY_ANCHORED_SCOPES.has(normalizedScopeType)) {
      if (!scopeRefId || scopeRefId.trim().length === 0) {
        throw new InvalidScopeError(
          `Scope reference identifier (scopeRefId) is required for entity-anchored scope type "${normalizedScopeType}"`,
        );
      }
      return {
        scopeType: normalizedScopeType,
        scopeRefId: scopeRefId.trim(),
      };
    }

    if (this.UNANCHORED_SCOPES.has(normalizedScopeType)) {
      return {
        scopeType: normalizedScopeType,
        scopeRefId: null,
      };
    }

    return {
      scopeType: normalizedScopeType,
      scopeRefId: null,
    };
  }
}

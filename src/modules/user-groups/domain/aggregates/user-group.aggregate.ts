import { UserGroup } from '../../entities';
import { ScopeType, UserGroupStatus } from '../enums';
import {
  InvalidScopeError,
  InvalidStateTransitionError,
} from '../exceptions/user-group.exceptions';
import { MatchingRuleValidator } from '../validators/matching-rule.validator';
import { UserGroupScopeValidator } from '../validators/user-group-scope.validator';
import { MatchingRule } from '../value-objects/matching-rule.vo';

export interface UserGroupProps {
  id?: string;
  tenantCode: string;
  name: string;
  description?: string;
  status?: UserGroupStatus;
  scopeType: ScopeType;
  scopeRefId?: string;
  matchingRule: MatchingRule;
  ruleAttributeKeys?: string[];
  version?: number;
  projectionVersion?: number;
  assignedRoleIds?: string[];
  createdBy?: string;
  updatedBy?: string;
}

export class UserGroupAggregate {
  private _id?: string;
  private _tenantCode: string;
  private _name: string;
  private _description?: string;
  private _status: UserGroupStatus;
  private _scopeType: ScopeType;
  private _scopeRefId?: string;
  private _matchingRule: MatchingRule;
  private _ruleAttributeKeys: string[];
  private _version: number;
  private _projectionVersion: number;
  private _assignedRoleIds: string[];
  private _createdBy?: string;
  private _updatedBy?: string;

  private constructor(props: UserGroupProps) {
    this._id = props.id;
    this._tenantCode = props.tenantCode;
    this._name = props.name;
    this._description = props.description;
    this._status = props.status ?? UserGroupStatus.ACTIVE;
    this._scopeType = props.scopeType;
    this._scopeRefId = props.scopeRefId;
    this._matchingRule = props.matchingRule;
    this._ruleAttributeKeys = props.ruleAttributeKeys ?? [];
    this._version = props.version ?? 1;
    this._projectionVersion = props.projectionVersion ?? 0;
    this._assignedRoleIds = props.assignedRoleIds ?? [];
    this._createdBy = props.createdBy;
    this._updatedBy = props.updatedBy;
  }

  public static create(
    props: Omit<UserGroupProps, 'version' | 'projectionVersion' | 'status'> & {
      status?: UserGroupStatus;
    },
  ): UserGroupAggregate {
    if (!props.name || props.name.trim().length === 0) {
      throw new InvalidScopeError('User Group name cannot be empty');
    }

    if (!props.scopeType || !Object.values(ScopeType).includes(props.scopeType)) {
      throw new InvalidScopeError(`Invalid scope type "${props.scopeType}"`);
    }

    const { ruleAttributeKeys } = MatchingRuleValidator.validate(props.matchingRule);

    return new UserGroupAggregate({
      ...props,
      status: props.status ?? UserGroupStatus.ACTIVE,
      ruleAttributeKeys,
      version: 1,
      projectionVersion: 0,
      assignedRoleIds: props.assignedRoleIds ?? [],
    });
  }

  public static reconstruct(userGroup: UserGroup, currentRoleIds?: string[]): UserGroupAggregate {
    return new UserGroupAggregate({
      id: userGroup.id,
      tenantCode: userGroup.tenantCode,
      name: userGroup.name,
      description: userGroup.description,
      status: userGroup.status,
      scopeType: userGroup.scopeType,
      scopeRefId: userGroup.scopeRefId,
      matchingRule: userGroup.matchingRule,
      ruleAttributeKeys: userGroup.ruleAttributeKeys,
      version: userGroup.version,
      projectionVersion: userGroup.projectionVersion,
      assignedRoleIds: currentRoleIds,
    });
  }

  public updateConfiguration(
    props: {
      name: string;
      description?: string;
      scopeType: ScopeType;
      scopeRefId?: string;
      matchingRule: MatchingRule;
      assignedRoleIds?: string[];
      updatedBy?: string;
    },
    expectedVersion: number,
  ): void {
    if (this._version !== expectedVersion) {
      // Concurrency check handled by caller or aggregate
    }

    if (!props.name || props.name.trim().length === 0) {
      throw new InvalidScopeError('User Group name cannot be empty');
    }

    if (!props.scopeType || !Object.values(ScopeType).includes(props.scopeType)) {
      throw new InvalidScopeError(`Invalid scope type "${props.scopeType}"`);
    }

    const { ruleAttributeKeys } = MatchingRuleValidator.validate(props.matchingRule);

    this._name = props.name;
    this._description = props.description;
    this._scopeType = props.scopeType;
    this._scopeRefId = props.scopeRefId;
    this._matchingRule = props.matchingRule;
    this._ruleAttributeKeys = ruleAttributeKeys;
    if (props.assignedRoleIds !== undefined) {
      this._assignedRoleIds = props.assignedRoleIds;
    }
    this._updatedBy = props.updatedBy;
    this._version += 1;
  }

  public assignRoles(roleIds: string[], updatedBy?: string): { addedRoleIds: string[] } {
    const uniqueIncoming = Array.from(new Set(roleIds));
    const addedRoleIds = uniqueIncoming.filter((id) => !this._assignedRoleIds.includes(id));
    if (addedRoleIds.length > 0) {
      this._assignedRoleIds = [...this._assignedRoleIds, ...addedRoleIds];
      this._updatedBy = updatedBy;
      this._version += 1;
    }
    return { addedRoleIds };
  }

  public unassignRoles(roleIds: string[], updatedBy?: string): { removedRoleIds: string[] } {
    const toRemove = new Set(roleIds);
    const removedRoleIds = this._assignedRoleIds.filter((id) => toRemove.has(id));
    if (removedRoleIds.length > 0) {
      this._assignedRoleIds = this._assignedRoleIds.filter((id) => !toRemove.has(id));
      this._updatedBy = updatedBy;
      this._version += 1;
    }
    return { removedRoleIds };
  }

  public replaceRoles(
    targetRoleIds: string[],
    updatedBy?: string,
  ): { addedRoleIds: string[]; removedRoleIds: string[] } {
    const uniqueTarget = Array.from(new Set(targetRoleIds));
    const currentSet = new Set(this._assignedRoleIds);
    const targetSet = new Set(uniqueTarget);

    const addedRoleIds = uniqueTarget.filter((id) => !currentSet.has(id));
    const removedRoleIds = this._assignedRoleIds.filter((id) => !targetSet.has(id));

    this._assignedRoleIds = uniqueTarget;
    this._updatedBy = updatedBy;
    this._version += 1;

    return { addedRoleIds, removedRoleIds };
  }

  public updateScope(
    props: {
      scopeType: ScopeType | string;
      scopeRefId?: string | null;
    },
    updatedBy?: string,
  ): {
    previousScope: { scopeType: ScopeType; scopeRefId?: string | null };
    newScope: { scopeType: ScopeType; scopeRefId?: string | null };
  } {
    const validated = UserGroupScopeValidator.validate(props.scopeType, props.scopeRefId);

    const previousScope = {
      scopeType: this._scopeType,
      scopeRefId: this._scopeRefId ?? null,
    };

    const newScope = {
      scopeType: validated.scopeType,
      scopeRefId: validated.scopeRefId,
    };

    this._scopeType = validated.scopeType;
    this._scopeRefId = validated.scopeRefId ?? undefined;
    this._updatedBy = updatedBy;
    this._version += 1;

    return { previousScope, newScope };
  }

  public deactivate(updatedBy?: string): void {
    if (this._status === UserGroupStatus.INACTIVE) {
      throw new InvalidStateTransitionError('User Group is already inactive');
    }
    this._status = UserGroupStatus.INACTIVE;
    this._updatedBy = updatedBy;
    this._version += 1;
  }

  public reactivate(updatedBy?: string): void {
    if (this._status === UserGroupStatus.ACTIVE) {
      throw new InvalidStateTransitionError('User Group is already active');
    }
    this._status = UserGroupStatus.ACTIVE;
    this._updatedBy = updatedBy;
    this._version += 1;
  }

  get id(): string | undefined {
    return this._id;
  }
  get tenantCode(): string {
    return this._tenantCode;
  }
  get name(): string {
    return this._name;
  }
  get description(): string | undefined {
    return this._description;
  }
  get status(): UserGroupStatus {
    return this._status;
  }
  get scopeType(): ScopeType {
    return this._scopeType;
  }
  get scopeRefId(): string | undefined {
    return this._scopeRefId;
  }
  get matchingRule(): MatchingRule {
    return this._matchingRule;
  }
  get ruleAttributeKeys(): string[] {
    return this._ruleAttributeKeys;
  }
  get version(): number {
    return this._version;
  }
  get projectionVersion(): number {
    return this._projectionVersion;
  }
  get isPendingSync(): boolean {
    return this._version > this._projectionVersion;
  }
  get hasNoAssignedRoles(): boolean {
    return this._assignedRoleIds.length === 0;
  }
  get assignedRoleIds(): string[] {
    return this._assignedRoleIds;
  }
  get createdBy(): string | undefined {
    return this._createdBy;
  }
  get updatedBy(): string | undefined {
    return this._updatedBy;
  }
}

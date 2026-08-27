import { ScopeType, UserGroupStatus } from '../enums';
import {
  InvalidScopeError,
  InvalidStateTransitionError,
} from '../exceptions/user-group.exceptions';
import { MatchingRuleValidator } from '../validators/matching-rule.validator';
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

  public static reconstruct(props: UserGroupProps): UserGroupAggregate {
    return new UserGroupAggregate(props);
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

import { UserGroupScopeValidator } from './user-group-scope.validator';
import { ScopeType } from '../enums/scope-type.enum';
import { InvalidScopeError } from '../exceptions/user-group.exceptions';

describe('UserGroupScopeValidator', () => {
  it('should throw if scopeType is missing', () => {
    expect(() => UserGroupScopeValidator.validate('' as unknown as ScopeType)).toThrow(
      InvalidScopeError,
    );
  });

  it('should throw if scopeType is not recognized', () => {
    expect(() => UserGroupScopeValidator.validate('INVALID_SCOPE' as unknown as ScopeType)).toThrow(
      InvalidScopeError,
    );
  });

  it('should validate and normalize SELF scope to have null scopeRefId', () => {
    const res = UserGroupScopeValidator.validate(ScopeType.SELF, 'some-ref-id');
    expect(res).toEqual({
      scopeType: ScopeType.SELF,
      scopeRefId: null,
    });
  });

  it('should validate and normalize DIRECT_REPORTEES scope to have null scopeRefId', () => {
    const res = UserGroupScopeValidator.validate(ScopeType.DIRECT_REPORTEES, 'some-ref-id');
    expect(res).toEqual({
      scopeType: ScopeType.DIRECT_REPORTEES,
      scopeRefId: null,
    });
  });

  it('should validate and normalize TENANT_WIDE scope to have null scopeRefId', () => {
    const res = UserGroupScopeValidator.validate(ScopeType.TENANT_WIDE, 'some-ref-id');
    expect(res).toEqual({
      scopeType: ScopeType.TENANT_WIDE,
      scopeRefId: null,
    });
  });

  it('should accept TENANT alias and map to TENANT_WIDE with null scopeRefId', () => {
    const res = UserGroupScopeValidator.validate('TENANT');
    expect(res).toEqual({
      scopeType: ScopeType.TENANT_WIDE,
      scopeRefId: null,
    });
  });

  it('should validate DEPARTMENT scope when valid scopeRefId is provided', () => {
    const res = UserGroupScopeValidator.validate(ScopeType.DEPARTMENT, 'dept-123');
    expect(res).toEqual({
      scopeType: ScopeType.DEPARTMENT,
      scopeRefId: 'dept-123',
    });
  });

  it('should throw for DEPARTMENT scope when scopeRefId is missing or empty', () => {
    expect(() => UserGroupScopeValidator.validate(ScopeType.DEPARTMENT, null)).toThrow(
      InvalidScopeError,
    );
    expect(() => UserGroupScopeValidator.validate(ScopeType.DEPARTMENT, '')).toThrow(
      InvalidScopeError,
    );
    expect(() => UserGroupScopeValidator.validate(ScopeType.DEPARTMENT, '   ')).toThrow(
      InvalidScopeError,
    );
  });

  it('should validate COMPANY scope when valid scopeRefId is provided', () => {
    const res = UserGroupScopeValidator.validate(ScopeType.COMPANY, 'comp-456');
    expect(res).toEqual({
      scopeType: ScopeType.COMPANY,
      scopeRefId: 'comp-456',
    });
  });

  it('should throw for COMPANY scope when scopeRefId is missing', () => {
    expect(() => UserGroupScopeValidator.validate(ScopeType.COMPANY)).toThrow(InvalidScopeError);
  });

  it('should validate LOCATION scope when valid scopeRefId is provided', () => {
    const res = UserGroupScopeValidator.validate(ScopeType.LOCATION, 'loc-789');
    expect(res).toEqual({
      scopeType: ScopeType.LOCATION,
      scopeRefId: 'loc-789',
    });
  });

  it('should throw for LOCATION scope when scopeRefId is missing', () => {
    expect(() => UserGroupScopeValidator.validate(ScopeType.LOCATION, undefined)).toThrow(
      InvalidScopeError,
    );
  });
});

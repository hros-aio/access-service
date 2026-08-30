export function GenerateSessionKey(sessionId: string): string {
  return `auth:session:${sessionId}`;
}

export function GenerateUserSessionsKey(
  tenantCode: string,
  userId: string,
  options?: { useHashTag?: boolean },
): string {
  if (options?.useHashTag) {
    return `auth:user-sessions:{${tenantCode}:${userId}}`;
  }
  return `auth:user-sessions:${tenantCode}:${userId}`;
}

export function GenerateUserEffectiveRoleKey(entry: {
  roleId: string;
  sourceGroupId: string;
  scopeType: string;
  scopeEntityId?: string | null;
}): string {
  return `${entry.roleId}_${entry.sourceGroupId}_${entry.scopeType}_${entry.scopeEntityId || 'null'}`;
}

export function GenerateUserAuthzCacheKey(tenantCode: string, userId: string): string {
  return `authz:user:${tenantCode}:${userId}`;
}

export function GenerateUserAuthzVersionKey(tenantCode: string, userId: string): string {
  return `authz:version:${tenantCode}:${userId}`;
}

export function GenerateAuthzWorkerLockKey(): string {
  return 'authz:reconciliation-worker:lock';
}

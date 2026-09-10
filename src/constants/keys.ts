export function GenerateUserEffectiveRoleKey(entry: {
  roleId: string;
  sourceGroupId: string;
  scopeType: string;
  scopeEntityId?: string | null;
}): string {
  return `${entry.roleId}:${entry.sourceGroupId}:${entry.scopeType}:${entry.scopeEntityId || 'null'}`;
}

export function GenerateUserAuthzVersionKey(tenantCode: string, userId: string): string {
  return `authz:version:${tenantCode}:${userId}`;
}

export function GenerateAuthzWorkerLockKey(tenantCode: string): string {
  return `authz:reconciliation-worker:lock:${tenantCode}`;
}

export function GenerateAuthMfaChallengeKey(
  tenantCode: string,
  userId: string,
  challengeId: string,
): string {
  return `auth:mfa-challenge:${tenantCode}:${userId}:${challengeId}`;
}

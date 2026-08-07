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

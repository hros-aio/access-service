# Phase 0 Research: Restrict Login to Approved Network Locations

## 1. Network Location Policy & CIDR Evaluation (IPv4 & IPv6)

### Decision
Use `ipaddr.js` (already present in `src/modules/ip-restriction/services/ip-restriction.service.ts`) for IPv4 and IPv6 CIDR parsing, matching, and normalization.

### Rationale
- `ipaddr.js` natively handles IPv4, IPv6, and IPv4-mapped IPv6 (`::ffff:x.x.x.x`) address formats.
- Pre-existing implementation in `IpRestrictionService` provides `normalizeIp` and `ipInCidr` capabilities.
- Action exemption rules (e.g., invitation setup `AuthActionType.INVITATION_VALIDATION`, password reset `AuthActionType.PASSWORD_RESET`) can be integrated via `IpRangePolicy` domain helper or extended `IpRestrictionService`.

### Alternatives Considered
- Custom regex / manual bit-shifting: Rejection due to edge cases in IPv6 expansion and subnets.
- Direct external IP geolocation services: Rejected as out of scope for strict IP allow-list CIDR matching.

---

## 2. Separate Redis Counter for Network Restriction Failures

### Decision
Store network restriction failure attempts in Redis under key `auth:ip-failure:{tenantCode}:{userId}` with a 3600-second (1 hour) sliding window TTL using Redis `INCR` + `EXPIRE`.

### Rationale
- Integrates with the existing Redis infrastructure pattern in `auth-svc` (similar to lockout counters in `LockoutRedisRepository`).
- Isolates IP failure tracking from credential failure tracking so unapproved IP attempts do not trigger global password lockouts, preventing denial-of-service vectors against legitimate users.

### Alternatives Considered
- Database table counters: High write overhead for transient tracking during attack spikes.

---

## 3. Outbox Audit Events & Kafka Messages

### Decision
Atomic insertion of `auth_security_events_outbox` rows during IP restriction rejection using `SecurityEventService.append()`, followed by async dispatch of `authentication.login-failed` and high-rate `authentication.security-alert-requested` alerts.

### Rationale
- Ensures strict audit retention in PostgreSQL even if downstream Kafka infrastructure experiences brief latency.
- Matches existing security event outbox pattern in `auth-svc`.

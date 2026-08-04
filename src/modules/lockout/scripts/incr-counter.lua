-- KEYS[1]: auth:login-failure:{tenantCode}:{userId} or auth:ip-failure:{tenantCode}:{userId}
-- ARGV[1]: TTL in seconds (e.g. 900)
local current = redis.call('INCR', KEYS[1])
if tonumber(current) == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current

--[[
  Token Bucket Rate Limiter — Atomic Lua Script
  ------------------------------------------------
  Implements the token bucket algorithm entirely inside Redis.
  Single EVALSHA call per request guarantees atomicity — no race conditions
  even under high concurrency across multiple Express instances.

  KEYS[1]  = bucket Redis hash key  (e.g. "rate:user:abc123:productSearch")

  ARGV[1]  = capacity           (max tokens in the bucket)
  ARGV[2]  = refillRate          (tokens added per refill interval)
  ARGV[3]  = refillIntervalMs    (milliseconds between refills)
  ARGV[4]  = nowMs               (current Unix timestamp in milliseconds)

  Returns: { allowed (0|1), remainingTokens, retryAfterMs, limitCapacity }
]]

local key              = KEYS[1]
local capacity         = tonumber(ARGV[1])
local refillRate       = tonumber(ARGV[2])
local refillIntervalMs = tonumber(ARGV[3])
local nowMs            = tonumber(ARGV[4])

-- Read current bucket state
local tokens       = tonumber(redis.call("HGET", key, "tokens"))
local lastRefillMs = tonumber(redis.call("HGET", key, "lastRefillMs"))

-- Initialize bucket on first request
if tokens == nil or lastRefillMs == nil then
  tokens       = capacity
  lastRefillMs = nowMs
end

-- Calculate how many tokens to refill based on elapsed time
local elapsedMs     = math.max(nowMs - lastRefillMs, 0)
local refillTokens  = math.floor(elapsedMs / refillIntervalMs) * refillRate

if refillTokens > 0 then
  tokens       = math.min(capacity, tokens + refillTokens)
  -- Only advance lastRefillMs by the intervals we actually consumed
  -- This preserves fractional time for accurate drip refill
  local intervalsConsumed = math.floor(elapsedMs / refillIntervalMs)
  lastRefillMs = lastRefillMs + (intervalsConsumed * refillIntervalMs)
end

local allowed      = 0
local retryAfterMs = 0

if tokens >= 1 then
  -- Consume one token
  tokens  = tokens - 1
  allowed = 1
else
  -- Bucket empty — calculate time until next token
  local timeSinceLastRefill = nowMs - lastRefillMs
  local timeUntilNextRefill = refillIntervalMs - timeSinceLastRefill
  retryAfterMs = math.max(timeUntilNextRefill, 0)
end

-- Persist bucket state
redis.call("HSET", key, "tokens", tokens, "lastRefillMs", lastRefillMs)

-- Set TTL so stale buckets auto-expire
-- TTL = time to fully refill an empty bucket × 2 (generous buffer)
local fullRefillMs = math.ceil(capacity / refillRate) * refillIntervalMs
local ttlSeconds   = math.ceil((fullRefillMs * 2) / 1000)
if ttlSeconds < 60 then ttlSeconds = 60 end
redis.call("EXPIRE", key, ttlSeconds)

return { allowed, tokens, retryAfterMs, capacity }

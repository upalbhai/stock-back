import { consumeToken } from "./redisBucket.js";
import { generateKey } from "./keyGenerator.js";
import {
  ENDPOINT_CONFIGS,
  TIER_MULTIPLIERS,
  resolveTier,
  isWhitelisted,
} from "./endpointConfigs.js";
import { setRateLimitHeaders } from "../../utils/rateLimitHeaders.js";
import { logger } from "../../utils/logger.js";

/**
 * @fileoverview Express middleware factory for rate limiting.
 *
 * Usage in routes:
 *   import { rateLimit } from "../middlewares/rateLimiter/index.js";
 *   router.post("/login", rateLimit("login"), loginController);
 *
 * The factory:
 *  1. Checks the whitelist — bypasses if matched
 *  2. Looks up the endpoint config
 *  3. Generates a Redis key
 *  4. Resolves the subscription tier and scales capacity
 *  5. Calls the atomic Lua script via redisBucket
 *  6. Sets response headers
 *  7. Returns 429 or calls next()
 *  8. Fails open if Redis is down
 */

/** @type {import("redis").RedisClientType|null} */
let _redisClient = null;

/**
 * Inject the Redis client. Must be called once at startup
 * (before any requests are handled).
 *
 * @param {import("redis").RedisClientType} client
 */
export function setRedisClient(client) {
  _redisClient = client;
}

/**
 * Create an Express rate-limiting middleware for a named endpoint.
 *
 * @param {string} endpointName - Key into ENDPOINT_CONFIGS (e.g. "login", "productSearch")
 * @param {object} [overrides]  - Optional overrides for the base config
 * @param {number} [overrides.capacity]
 * @param {number} [overrides.refillRate]
 * @param {number} [overrides.refillIntervalMs]
 * @returns {import("express").RequestHandler}
 */
export function rateLimit(endpointName, overrides) {
  const baseConfig = ENDPOINT_CONFIGS[endpointName] || ENDPOINT_CONFIGS.default;

  return async function rateLimitMiddleware(req, res, next) {
    // ── 1. Whitelist check ──────────────────────────────────
    if (isWhitelisted(req)) {
      return next();
    }

    // ── 2. Redis availability check ─────────────────────────
    if (!_redisClient || !_redisClient.isReady) {
      // Fail open — never block users because Redis is down
      logger.warn("Rate limiter: Redis unavailable — allowing request");
      return next();
    }

    try {
      // ── 3. Merge config with optional overrides ───────────
      const config = {
        capacity: overrides?.capacity ?? baseConfig.capacity,
        refillRate: overrides?.refillRate ?? baseConfig.refillRate,
        refillIntervalMs: overrides?.refillIntervalMs ?? baseConfig.refillIntervalMs,
        keyStrategy: baseConfig.keyStrategy,
      };

      // ── 4. Apply subscription tier multiplier ─────────────
      const planSlug = req.user?.planSlug ?? null;
      const tier = resolveTier(planSlug);
      const multiplier = TIER_MULTIPLIERS[tier]?.capacityMultiplier ?? 1;
      const scaledCapacity = Math.floor(config.capacity * multiplier);

      // ── 5. Generate Redis key ─────────────────────────────
      const key = generateKey(req, endpointName, config.keyStrategy);

      // ── 6. Consume token ──────────────────────────────────
      const result = await consumeToken(_redisClient, key, {
        capacity: scaledCapacity,
        refillRate: config.refillRate,
        refillIntervalMs: config.refillIntervalMs,
      });

      // ── 7. Set response headers ───────────────────────────
      setRateLimitHeaders(res, {
        limit: scaledCapacity,
        remaining: result.remaining,
        retryAfterMs: result.retryAfterMs,
        refillRate: config.refillRate,
        refillIntervalMs: config.refillIntervalMs,
      });

      // ── 8. Allow or deny ──────────────────────────────────
      if (!result.allowed) {
        const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);
        return res.status(429).json({
          success: false,
          message: "Too many requests.",
          retryAfter: retryAfterSeconds,
        });
      }

      return next();
    } catch (err) {
      // Fail open — log and allow
      logger.error("Rate limiter error — allowing request", err);
      return next();
    }
  };
}

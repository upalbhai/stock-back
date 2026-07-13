/**
 * @fileoverview Rate limiter module entry point.
 *
 * Exports:
 *  - rateLimit(endpointName)  — Express middleware factory
 *  - initRateLimiter(client)  — One-time setup (call at startup)
 *
 * Usage:
 *   // At startup (index.js):
 *   import { initRateLimiter } from "./middlewares/rateLimiter/index.js";
 *   await initRateLimiter(redisClient);
 *
 *   // In routes:
 *   import { rateLimit } from "../middlewares/rateLimiter/index.js";
 *   router.post("/login", rateLimit("login"), loginController);
 */

import { loadScript } from "./redisBucket.js";
import { rateLimit, setRedisClient } from "./limiterFactory.js";
import { logger } from "../../utils/logger.js";

/**
 * Initialize the rate limiter subsystem.
 *
 * Must be called once after Redis is connected and before
 * the Express app starts accepting requests.
 *
 * @param {import("redis").RedisClientType} redisClient - Connected Redis client
 */
export async function initRateLimiter(redisClient) {
  setRedisClient(redisClient);
  await loadScript(redisClient);
  logger.info("Rate limiter initialized");
}

export { rateLimit };

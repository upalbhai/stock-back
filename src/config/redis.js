import { createClient } from "redis";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

/**
 * @fileoverview Redis client configuration with reconnection strategy.
 *
 * Exports:
 *  - redisClient   — The singleton Redis client instance
 *  - connectRedis  — Connect (or reconnect) to Redis
 *  - isRedisReady  — Check if Redis is connected and responsive
 */

const redisClient = createClient({
  url: env.REDIS_URL,
  socket: {
    // Reconnect with exponential backoff (capped at 5 seconds)
    reconnectStrategy(retries) {
      if (retries > 20) {
        logger.error("Redis: max reconnection attempts reached — giving up");
        return new Error("Redis max reconnection attempts reached");
      }
      const delay = Math.min(retries * 200, 5000);
      logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${retries})`);
      return delay;
    },
    connectTimeout: 10_000,
  },
});

// ── Event listeners ──────────────────────────────────────────
redisClient.on("error", (err) => {
  // Avoid noisy logs during expected reconnection cycles
  if (!err.message?.includes("reconnect")) {
    logger.error("Redis Client Error", err);
  }
});

redisClient.on("connect", () => {
  logger.info("Redis Client Connected");
});

redisClient.on("reconnecting", () => {
  logger.warn("Redis Client Reconnecting...");
});

redisClient.on("ready", () => {
  logger.info("Redis Client Ready");
});

// ── Public API ───────────────────────────────────────────────

/**
 * Connect to Redis if not already connected.
 * Safe to call multiple times — only connects once.
 */
export const connectRedis = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
};

/**
 * Check if Redis is connected and ready to accept commands.
 *
 * @returns {boolean}
 */
export function isRedisReady() {
  return redisClient.isReady;
}

export { redisClient };

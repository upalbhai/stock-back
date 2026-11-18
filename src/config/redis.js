import { createClient } from "redis";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

/**
 * @fileoverview Redis client configuration with graceful fallback when Redis is offline.
 */

const redisClient = createClient({
  url: env.REDIS_URL,
  socket: {
    reconnectStrategy(retries) {
      if (retries > 3) {
        return false; // Stop retrying if Redis is not running locally
      }
      return Math.min(retries * 200, 1000);
    },
    connectTimeout: 3000,
  },
});

// ── Event listeners ──────────────────────────────────────────
redisClient.on("error", (err) => {
  // Silence connection errors when Redis is not running locally
  if (err.code !== "ECONNREFUSED") {
    logger.error("Redis Client Error", err.message);
  }
});

redisClient.on("connect", () => {
  logger.info("Redis Client Connected");
});

redisClient.on("ready", () => {
  logger.info("Redis Client Ready");
});

// ── Public API ───────────────────────────────────────────────

export const connectRedis = async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  } catch (err) {
    logger.warn("Redis server is not running locally — proceeding without Redis cache/rate limiting.");
  }
};

export function isRedisReady() {
  return redisClient.isReady;
}

export { redisClient };

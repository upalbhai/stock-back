import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { logger } from "../../utils/logger.js";

/**
 * @fileoverview Redis wrapper for the Token Bucket Lua script.
 *
 * Loads the Lua script once via SCRIPT LOAD, caches the SHA1 hash,
 * and executes it atomically via EVALSHA on every request.
 * Handles NOSCRIPT errors by transparently re-loading the script.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {string} Raw Lua script source */
const LUA_SCRIPT = readFileSync(join(__dirname, "tokenBucket.lua"), "utf-8");

/** @type {string|null} Cached SHA1 hash of the loaded Lua script */
let scriptSha = null;

/**
 * Load (or re-load) the Lua script into Redis and cache its SHA.
 *
 * @param {import("redis").RedisClientType} redisClient - Connected Redis client
 * @returns {Promise<string>} The SHA1 hash of the loaded script
 */
export async function loadScript(redisClient) {
  scriptSha = await redisClient.scriptLoad(LUA_SCRIPT);
  logger.info("Rate limiter Lua script loaded", { sha: scriptSha });
  return scriptSha;
}

/**
 * Consume a single token from a bucket.
 *
 * Executes the token bucket Lua script atomically inside Redis.
 * Returns the result without side effects on the Express response —
 * the caller (limiterFactory) is responsible for setting headers / responding.
 *
 * @param {import("redis").RedisClientType} redisClient - Connected Redis client
 * @param {string}  key              - Full Redis key for this bucket
 * @param {object}  config           - Bucket configuration
 * @param {number}  config.capacity          - Max tokens
 * @param {number}  config.refillRate        - Tokens added per interval
 * @param {number}  config.refillIntervalMs  - Milliseconds between refill cycles
 * @returns {Promise<{ allowed: boolean, remaining: number, retryAfterMs: number, limit: number }>}
 */
export async function consumeToken(redisClient, key, config) {
  const { capacity, refillRate, refillIntervalMs } = config;
  const nowMs = Date.now();

  try {
    const result = await execScript(redisClient, key, [
      capacity,
      refillRate,
      refillIntervalMs,
      nowMs,
    ]);

    return parseResult(result);
  } catch (err) {
    // If the script was flushed from Redis (e.g. SCRIPT FLUSH, server restart),
    // re-load it and retry exactly once.
    if (err?.message?.includes("NOSCRIPT")) {
      logger.warn("Lua script evicted from Redis — re-loading");
      await loadScript(redisClient);
      const result = await execScript(redisClient, key, [
        capacity,
        refillRate,
        refillIntervalMs,
        nowMs,
      ]);
      return parseResult(result);
    }

    // Any other Redis error — let the caller handle it (fail-open)
    throw err;
  }
}

/**
 * Execute the cached Lua script via EVALSHA.
 *
 * @param {import("redis").RedisClientType} redisClient
 * @param {string} key
 * @param {number[]} args
 * @returns {Promise<number[]>}
 */
async function execScript(redisClient, key, args) {
  if (!scriptSha) {
    await loadScript(redisClient);
  }

  return redisClient.evalSha(scriptSha, {
    keys: [key],
    arguments: args.map(String),
  });
}

/**
 * Parse the raw Lua return array into a typed result object.
 *
 * @param {number[]} result - [allowed, remaining, retryAfterMs, limit]
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number, limit: number }}
 */
function parseResult(result) {
  return {
    allowed: Number(result[0]) === 1,
    remaining: Number(result[1]),
    retryAfterMs: Number(result[2]),
    limit: Number(result[3]),
  };
}

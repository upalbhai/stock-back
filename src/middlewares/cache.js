import { redisClient, isRedisReady } from "../config/redis.js";
import { logger } from "../utils/logger.js";

/**
 * Cache GET responses in Redis.
 * Key format: cache:{businessId}:{originalUrl}
 * 
 * @param {number} ttlSeconds - Time to live in seconds (default: 5 minutes)
 */
export function cacheRoute(ttlSeconds = 300) {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== "GET" || !isRedisReady()) return next();

    const businessId = req.user?.businessId || "global";
    // req.originalUrl includes the path and the query string (e.g. /api/products?page=1&limit=50)
    const key = `cache:${businessId}:${req.originalUrl}`;

    try {
      const cachedResponse = await redisClient.get(key);
      
      if (cachedResponse) {
        res.set("Content-Type", "application/json");
        res.set("X-Cache", "HIT");
        return res.send(cachedResponse);
      }

      res.set("X-Cache", "MISS");

      // Intercept the res.json method so we can cache the response right before it's sent
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        // Only cache successful HTTP responses (2xx)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redisClient.setEx(key, ttlSeconds, JSON.stringify(body)).catch((err) => {
            logger.error("Redis cache set error", err);
          });
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      logger.error("Redis cache get error", err);
      next();
    }
  };
}

/**
 * Middleware to invalidate cache for a specific route prefix.
 * Use this on POST/PATCH/DELETE routes to clear related GET caches so users see fresh data.
 * 
 * @param {string} prefix - The API prefix to clear (e.g., "/api/products")
 */
export function invalidateCache(prefix) {
  return async (req, res, next) => {
    // We wait until the request finishes successfully before clearing the cache
    res.on("finish", async () => {
      if (res.statusCode >= 200 && res.statusCode < 300 && isRedisReady()) {
        const businessId = req.user?.businessId || "global";
        try {
          // Find all keys starting with this prefix for this business
          const pattern = `cache:${businessId}:${prefix}*`;
          const keys = await redisClient.keys(pattern);
          
          if (keys.length > 0) {
            await redisClient.del(keys);
            logger.info(`Invalidated ${keys.length} cache keys for pattern: ${pattern}`);
          }
        } catch (err) {
          logger.error("Redis cache invalidation error", err);
        }
      }
    });
    next();
  };
}

import { createApp } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { connectRedis, redisClient } from "./config/redis.js";
import { initRateLimiter } from "./middlewares/rateLimiter/index.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

async function start() {
  await connectDatabase();
  await connectRedis();
  await initRateLimiter(redisClient);

  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info(`API running on port ${env.PORT}`);
  });
}

start().catch((error) => {
  logger.error("Failed to start server", error);
  process.exit(1);
});

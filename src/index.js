import { createApp } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { connectRedis, redisClient } from "./config/redis.js";
import { initRateLimiter } from "./middlewares/rateLimiter/index.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

import http from "http";
import { initSocket } from "./config/socket.js";

async function start() {
  await connectDatabase();
  await connectRedis();
  
  if (redisClient.isOpen) {
    await initRateLimiter(redisClient);
  } else {
    logger.info("Rate limiter running in fail-open mode (Redis offline)");
  }

  const app = createApp();
  const httpServer = http.createServer(app);
  
  initSocket(httpServer);
  
  // Initialize scheduled jobs
  import("./cron/subscriptionReminders.js").then(({ initSubscriptionCron }) => {
    initSubscriptionCron();
  }).catch(err => logger.error("Failed to load subscription cron module", err));

  import("./cron/blogImageCleanup.js").then(({ initBlogCleanupCron }) => {
    initBlogCleanupCron();
  }).catch(err => logger.error("Failed to load blog cleanup cron module", err));

  httpServer.listen(env.PORT, () => {
    logger.info(`API running on port ${env.PORT}`);
  });
}

start().catch((error) => {
  logger.error("Failed to start server", error);
  process.exit(1);
});

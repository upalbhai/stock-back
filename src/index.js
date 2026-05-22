import { createApp } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
async function start() {
  await connectDatabase();
  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info(`API running on port ${env.PORT}`);
  });
}
start().catch((error) => {
  logger.error("Failed to start server", error);
  process.exit(1);
});

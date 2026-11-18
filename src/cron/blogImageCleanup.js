import cron from "node-cron";
import { cleanupOrphanedBlogImages } from "../utils/blogImageCleanup.js";
import { logger } from "../utils/logger.js";

/**
 * Runs daily at 3:00 AM to scan the uploads/blog directory
 * and delete any image files not referenced by any blog post.
 */
export function initBlogCleanupCron() {
  logger.info("Initializing blog image cleanup cron (daily at 3:00 AM)");

  cron.schedule("0 3 * * *", async () => {
    logger.info("[blog-cleanup-cron] Starting orphaned image cleanup...");
    try {
      const deleted = await cleanupOrphanedBlogImages();
      if (deleted.length > 0) {
        logger.info(`[blog-cleanup-cron] Cleaned up ${deleted.length} orphaned image(s)`);
      } else {
        logger.info("[blog-cleanup-cron] No orphans found");
      }
    } catch (err) {
      logger.error("[blog-cleanup-cron] Failed:", err.message);
    }
  });
}

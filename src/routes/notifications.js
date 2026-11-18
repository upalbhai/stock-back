import { Router } from "express";
import { requireFeature } from "../middlewares/feature.js";
import { requirePermission } from "../middlewares/permission.js";
import {
  listNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount
} from "../controllers/notificationController.js";

const router = Router();

// Ensure the feature is enabled for all routes here
router.use(requireFeature("notifications"));

router.get(
  "/",
  requirePermission("notifications", "read"),
  listNotifications
);

router.get(
  "/unread-count",
  getUnreadCount
);

router.patch(
  "/:id/read",
  requirePermission("notifications", "read"),
  markAsRead
);

router.post(
  "/mark-all-read",
  markAllAsRead
);

export { router as notificationRouter };

import { Notification } from "../models/Notification.js";
import { emitToUser } from "./socketEmitter.js";
import { logger } from "./logger.js";
import { User } from "../models/User.js";

/**
 * Create and emit a single notification.
 */
export async function notify({ businessId, recipientId, type, title, body, metadata, link }) {
  try {
    const notification = await Notification.create({
      businessId,
      recipientId,
      type,
      title,
      body,
      metadata,
      link
    });

    emitToUser(recipientId, "notification:new", notification);
    return notification;
  } catch (err) {
    logger.error("Failed to create notification", err);
  }
}

/**
 * Bulk notify all active users in a business (optionally excluding a specific user).
 */
export async function notifyBusiness({ businessId, type, title, body, metadata, link, excludeUserId }) {
  try {
    const query = { businessId, isActive: true };
    if (excludeUserId) {
      query._id = { $ne: excludeUserId };
    }
    
    const users = await User.find(query).select("_id").lean();
    
    if (users.length === 0) return;
    
    const notifications = users.map(u => ({
      businessId,
      recipientId: u._id,
      type,
      title,
      body,
      metadata,
      link
    }));
    
    const inserted = await Notification.insertMany(notifications);
    
    inserted.forEach(notification => {
      emitToUser(notification.recipientId.toString(), "notification:new", notification);
    });
    
    return inserted;
  } catch (err) {
    logger.error("Failed to bulk create notifications", err);
  }
}

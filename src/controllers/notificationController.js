import { Notification } from "../models/Notification.js";
import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";

export async function listNotifications(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = {
      businessId: req.business._id,
      recipientId: req.user.userId
    };

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Notification.countDocuments(query);

    return successResponse({
      res,
      data: {
        items: notifications,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function markAsRead(req, res, next) {
  try {
    const { id } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipientId: req.user.userId, businessId: req.business._id },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    
    if (!notification) {
      return errorResponse({ res, statusCode: 404, message: "Notification not found" });
    }

    return successResponse({ res, data: { notification } });
  } catch (err) {
    next(err);
  }
}

export async function markAllAsRead(req, res, next) {
  try {
    await Notification.updateMany(
      { recipientId: req.user.userId, businessId: req.business._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    return successResponse({ res, message: "All notifications marked as read" });
  } catch (err) {
    next(err);
  }
}

export async function getUnreadCount(req, res, next) {
  try {
    const count = await Notification.countDocuments({
      recipientId: req.user.userId,
      businessId: req.business._id,
      isRead: false
    });
    return successResponse({ res, data: { unreadCount: count } });
  } catch (err) {
    next(err);
  }
}

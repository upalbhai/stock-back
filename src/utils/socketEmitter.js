import { getIO } from "../config/socket.js";
import { logger } from "./logger.js";

/**
 * Emit an event to a specific user's room.
 * @param {string} userId - The target user's ID
 * @param {string} event - The socket event name
 * @param {any} data - The data payload to emit
 */
export function emitToUser(userId, event, data) {
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit(event, data);
  } catch (err) {
    logger.error(`Failed to emit to user ${userId}`, err);
  }
}

/**
 * Emit an event to a specific business's room.
 * @param {string} businessId - The target business's ID
 * @param {string} event - The socket event name
 * @param {any} data - The data payload to emit
 */
export function emitToBusiness(businessId, event, data) {
  try {
    const io = getIO();
    io.to(`business:${businessId}`).emit(event, data);
  } catch (err) {
    logger.error(`Failed to emit to business ${businessId}`, err);
  }
}

/**
 * Emit an event to a specific outlet's room.
 * @param {string} outletId - The target outlet's ID
 * @param {string} event - The socket event name
 * @param {any} data - The data payload to emit
 */
export function emitToOutlet(outletId, event, data) {
  try {
    const io = getIO();
    io.to(`outlet:${outletId}`).emit(event, data);
  } catch (err) {
    logger.error(`Failed to emit to outlet ${outletId}`, err);
  }
}

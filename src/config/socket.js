import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { redisClient } from "./redis.js";
import { corsOrigins } from "./env.js";
import { logger } from "../utils/logger.js";
import { socketAuth } from "../middlewares/socketAuth.js";

let io;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      credentials: true
    }
  });

  // Setup Redis Adapter for multi-instance scaling if Redis is connected
  if (redisClient.isOpen) {
    const pubClient = redisClient.duplicate();
    const subClient = redisClient.duplicate();
    
    Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      logger.info("Socket.IO Redis Adapter initialized");
    }).catch(err => {
      logger.warn("Socket.IO running in single-instance mode (Redis connection failed)");
    });
  } else {
    logger.info("Socket.IO running in single-instance mode (Redis offline)");
  }

  // Apply Auth Middleware
  io.use(socketAuth);

  io.on("connection", (socket) => {
    logger.info(`Socket connected: ${socket.id} (User: ${socket.user?.userId})`);
    
    // Auto-join rooms
    if (socket.user?.businessId) {
      socket.join(`business:${socket.user.businessId}`);
    }
    if (socket.user?.userId) {
      socket.join(`user:${socket.user.userId}`);
    }
    // Join outlet rooms if any are specified in the token payload
    if (socket.user?.outlets && Array.isArray(socket.user.outlets)) {
      socket.user.outlets.forEach(outlet => {
        socket.join(`outlet:${outlet._id || outlet}`);
      });
    }

    // Send initial unread notification count
    if (socket.user?.userId) {
      import("../models/Notification.js").then(({ Notification }) => {
        Notification.countDocuments({
          recipientId: socket.user.userId,
          isRead: false
        }).then(count => {
          socket.emit("notification:unread-count", { count });
        }).catch(err => {
          logger.error("Failed to fetch unread count for socket", err);
        });
      });
    }

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${socket.id} (User: ${socket.user?.userId})`);
    });
  });

  return io;
}

export function getIO() {
  if (!io) {
    throw new Error("Socket.IO not initialized");
  }
  return io;
}

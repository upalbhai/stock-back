import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { Session } from "../models/Session.js";

export const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    
    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      return next(new Error("Authentication error: Invalid or expired token"));
    }

    // If session tracking is active (sessionId in token), validate session
    if (payload.sessionId) {
      const session = await Session.findById(payload.sessionId).select("isRevoked expiresAt").lean();

      if (!session) {
        return next(new Error("Authentication error: Session not found"));
      }

      if (session.isRevoked) {
        return next(new Error("Authentication error: Session has been revoked"));
      }

      if (new Date() > new Date(session.expiresAt)) {
        return next(new Error("Authentication error: Session expired"));
      }
    }

    // Attach user payload to socket
    socket.user = {
      userId: payload.userId,
      businessId: payload.businessId,
      role: payload.role,
      outlets: payload.outlets || []
    };

    next();
  } catch (error) {
    next(new Error("Authentication error: " + error.message));
  }
};

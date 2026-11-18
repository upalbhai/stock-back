import { Session } from "../models/Session.js";
import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";

/**
 * GET /auth/sessions — list all active sessions for the current user.
 */
async function listSessions(req, res, next) {
  try {
    const sessions = await Session.find({
      userId: req.user.userId,
      isRevoked: false,
      expiresAt: { $gt: new Date() }
    })
      .sort({ lastActiveAt: -1 })
      .lean();

    const currentSessionId = req.user.sessionId;

    const mapped = sessions.map((s) => ({
      id: s._id,
      deviceName: s.deviceName,
      deviceType: s.deviceType,
      browser: s.browser,
      os: s.os,
      ip: s.ip,
      location: s.location,
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      isCurrent: s._id.toString() === currentSessionId
    }));

    return successResponse({
      res,
      data: { sessions: mapped }
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * DELETE /auth/sessions/:id — revoke a specific session.
 */
async function revokeSession(req, res, next) {
  try {
    const { id } = req.params;

    // Don't allow revoking the current session (use logout instead)
    if (id === req.user.sessionId) {
      return errorResponse({
        res,
        statusCode: 400,
        message: "Cannot revoke current session. Use logout instead."
      });
    }

    const session = await Session.findOneAndUpdate(
      { _id: id, userId: req.user.userId, isRevoked: false },
      { isRevoked: true, revokedAt: new Date() },
      { new: true }
    );

    if (!session) {
      return errorResponse({
        res,
        statusCode: 404,
        message: "Session not found or already revoked"
      });
    }

    return successResponse({
      res,
      message: "Session revoked successfully"
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * DELETE /auth/sessions — revoke ALL sessions except the current one.
 */
async function revokeAllSessions(req, res, next) {
  try {
    const currentSessionId = req.user.sessionId;

    const result = await Session.updateMany(
      {
        userId: req.user.userId,
        isRevoked: false,
        _id: { $ne: currentSessionId }
      },
      { isRevoked: true, revokedAt: new Date() }
    );

    return successResponse({
      res,
      message: `${result.modifiedCount} session(s) revoked`,
      data: { revokedCount: result.modifiedCount }
    });
  } catch (error) {
    return next(error);
  }
}

export { listSessions, revokeSession, revokeAllSessions };

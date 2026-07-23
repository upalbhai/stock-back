import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { Session } from "../models/Session.js";
import { SystemSetting } from "../models/SystemSetting.js";

let maintenanceModeCache = { isEnabled: false, lastFetched: 0 };
const MAINTENANCE_CACHE_TTL = 60 * 1000; // 1 minute

function clearMaintenanceCache() {
  maintenanceModeCache.lastFetched = 0;
}

async function isMaintenanceModeEnabled() {
  const now = Date.now();
  if (now - maintenanceModeCache.lastFetched > MAINTENANCE_CACHE_TTL) {
    try {
      const settings = await SystemSetting.findOne().lean();
      maintenanceModeCache.isEnabled = settings ? Boolean(settings.maintenanceMode) : false;
      maintenanceModeCache.lastFetched = now;
    } catch (e) {
      // ignore db errors for cache update
    }
  }
  return maintenanceModeCache.isEnabled;
}

// Throttle lastActiveAt updates — track per session, max once per 5 minutes
const lastActiveCache = new Map();
const ACTIVE_THROTTLE = 5 * 60 * 1000; // 5 minutes

async function requireAuth(req, res, next) {
  if (req.user) return next();
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Missing authorization" });
  }
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Invalid authorization format" });
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.user = payload;

    const maintenance = await isMaintenanceModeEnabled();
    if (maintenance && req.user.role !== "superadmin" && !req.user.impersonating) {
      return res.status(503).json({ message: "System is currently under maintenance. Please try again later." });
    }

    // If session tracking is active (sessionId in token), validate session
    if (payload.sessionId) {
      // Non-blocking session validation + lastActiveAt update
      validateSession(payload.sessionId, res, next);
      return; // validateSession calls next() or returns 401
    }

    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

async function validateSession(sessionId, res, next) {
  try {
    const session = await Session.findById(sessionId).select("isRevoked expiresAt").lean();

    if (!session) {
      return res.status(401).json({ message: "Session not found. Please login again." });
    }

    if (session.isRevoked) {
      return res.status(401).json({ message: "Session has been revoked. Please login again." });
    }

    if (new Date() > new Date(session.expiresAt)) {
      return res.status(401).json({ message: "Session expired. Please login again." });
    }

    // Throttled lastActiveAt update
    const now = Date.now();
    const lastUpdate = lastActiveCache.get(sessionId);
    if (!lastUpdate || now - lastUpdate > ACTIVE_THROTTLE) {
      lastActiveCache.set(sessionId, now);
      // Fire and forget — don't await
      Session.findByIdAndUpdate(sessionId, { lastActiveAt: new Date() }).catch(() => {});

      // Evict stale cache entries periodically
      if (lastActiveCache.size > 1000) {
        for (const [key, val] of lastActiveCache) {
          if (now - val > ACTIVE_THROTTLE * 2) lastActiveCache.delete(key);
        }
      }
    }

    return next();
  } catch (err) {
    // If session check fails (DB down, etc.), allow request through
    // to avoid locking out users during transient DB issues
    console.error("Session validation error:", err.message);
    return next();
  }
}

function requireSuperAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ message: "Super admin access required" });
    }
    return next();
  });
}
export {
  requireAuth,
  requireSuperAdmin,
  clearMaintenanceCache
};

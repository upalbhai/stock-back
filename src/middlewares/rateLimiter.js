import { RateLimit } from "../models/RateLimit.js";

/**
 * Per-email rate limiter middleware using MongoDB.
 * 
 * @param {string} prefix  - Namespace prefix (e.g. "otp", "register", "forgot")
 * @param {number} maxHits - Max requests allowed in the window
 * @param {number} windowMinutes - Window duration in minutes
 * @returns Express middleware
 */
export function emailRateLimiter(prefix, maxHits, windowMinutes) {
  return async function (req, res, next) {
    const email = req.body?.email?.toLowerCase?.();
    if (!email) {
      return next(); // No email in body → skip (validator will catch it)
    }

    const key = `${prefix}:${email}`;
    const windowMs = windowMinutes * 60 * 1000;
    const now = new Date();

    try {
      // Try to find an existing window
      const entry = await RateLimit.findOne({ key, windowStart: { $gt: new Date(now.getTime() - windowMs) } });

      if (!entry) {
        // First request in this window — create entry
        await RateLimit.create({
          key,
          hits: 1,
          windowStart: now,
          expiresAt: new Date(now.getTime() + windowMs)
        });
        return next();
      }

      if (entry.hits >= maxHits) {
        // Rate limit exceeded
        const retryAfter = Math.ceil((entry.windowStart.getTime() + windowMs - now.getTime()) / 1000);
        res.set("Retry-After", String(retryAfter));
        return res.status(429).json({
          success: false,
          message: `Too many requests. Please try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
          retryAfter
        });
      }

      // Increment hit count
      entry.hits += 1;
      await entry.save();
      return next();
    } catch (err) {
      // If rate limit DB fails, don't block the user — just log and proceed
      console.error("Rate limiter error:", err.message);
      return next();
    }
  };
}

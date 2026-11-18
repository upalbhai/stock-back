/**
 * @fileoverview Redis key generation for rate limiting.
 *
 * Generates distinct keys per request context so that:
 *  - Different users never share a bucket
 *  - Different IPs never share a bucket
 *  - Different endpoints have separate counters
 *
 * Key strategies:
 *  "authenticated" → rate:user:{userId}:{endpoint}
 *  "ip"           → rate:ip:{ip}:{endpoint}
 *  "login"        → rate:login:{ip}
 *  "otp"          → rate:otp:{ip}
 *  "passwordReset"→ rate:password-reset:{ip}
 *  "upload"       → rate:upload:{userId}
 */

/**
 * Extract the client IP from the Express request.
 * Respects `trust proxy` setting via `req.ip`.
 * Falls back to raw socket address.
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
function getClientIp(req) {
  // req.ip is trust-proxy-aware in Express
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  // Normalize IPv6-mapped IPv4 (::ffff:127.0.0.1 → 127.0.0.1) for consistency
  return ip.replace(/^::ffff:/, "");
}

/**
 * Generate a Redis key for the rate limiter bucket.
 *
 * @param {import("express").Request} req          - Express request object
 * @param {string}                    endpointName - Logical endpoint name (e.g. "login", "productSearch")
 * @param {string}                    keyStrategy  - One of: "authenticated", "ip", "login", "otp", "passwordReset", "upload"
 * @returns {string} Redis key
 */
export function generateKey(req, endpointName, keyStrategy) {
  const ip = getClientIp(req);
  const userId = req.user?.userId;

  switch (keyStrategy) {
    case "authenticated":
      // Authenticated users get per-user keys; fall back to IP if no user context yet
      return userId
        ? `rate:user:${userId}:${endpointName}`
        : `rate:ip:${ip}:${endpointName}`;

    case "ip":
      return `rate:ip:${ip}:${endpointName}`;

    case "login":
      return `rate:login:${ip}`;

    case "otp":
      return `rate:otp:${ip}`;

    case "passwordReset":
      return `rate:password-reset:${ip}`;

    case "upload":
      // Uploads require auth, but fall back to IP if somehow unauthenticated
      return userId
        ? `rate:upload:${userId}`
        : `rate:ip:${ip}:upload`;

    default:
      return `rate:ip:${ip}:${endpointName}`;
  }
}

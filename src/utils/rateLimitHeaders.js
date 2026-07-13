/**
 * @fileoverview Rate-limit response header helpers.
 *
 * Sets standard rate-limiting headers on every response:
 *  - X-RateLimit-Limit     — bucket capacity
 *  - X-RateLimit-Remaining — tokens currently remaining
 *  - X-RateLimit-Reset     — Unix epoch (seconds) when bucket will be full again
 *  - Retry-After           — seconds until next available token (only on 429)
 */

/**
 * Set rate-limit headers on the response.
 *
 * @param {import("express").Response} res
 * @param {object}  opts
 * @param {number}  opts.limit          - Bucket capacity
 * @param {number}  opts.remaining      - Tokens remaining after this request
 * @param {number}  opts.retryAfterMs   - Milliseconds until next token (0 if allowed)
 * @param {number}  opts.refillRate     - Tokens added per refill interval
 * @param {number}  opts.refillIntervalMs - Ms between refill cycles
 */
export function setRateLimitHeaders(res, { limit, remaining, retryAfterMs, refillRate, refillIntervalMs }) {
  // Calculate when the bucket would be full again
  const tokensNeeded = limit - remaining;
  const intervalsToFull = Math.ceil(tokensNeeded / refillRate);
  const msToFull = intervalsToFull * refillIntervalMs;
  const resetEpochSeconds = Math.ceil((Date.now() + msToFull) / 1000);

  res.set("X-RateLimit-Limit", String(limit));
  res.set("X-RateLimit-Remaining", String(Math.max(remaining, 0)));
  res.set("X-RateLimit-Reset", String(resetEpochSeconds));

  if (retryAfterMs > 0) {
    res.set("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
  }
}

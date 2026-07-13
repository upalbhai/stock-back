/**
 * @fileoverview Centralized rate-limit configuration.
 *
 * All rate-limit numbers live here — nothing is hardcoded in middleware or routes.
 *
 * Each endpoint config defines:
 *  - capacity:          Max tokens in the bucket (base value before tier multiplier)
 *  - refillRate:        Tokens added per refill interval
 *  - refillIntervalMs:  Milliseconds between refill cycles
 *  - keyStrategy:       How to generate the Redis key (see keyGenerator.js)
 *
 * Tier multipliers scale the `capacity` based on the user's subscription plan.
 */

// ─────────────────────────────────────────────────────────────
//  Endpoint bucket configurations
// ─────────────────────────────────────────────────────────────

/** @type {Record<string, { capacity: number, refillRate: number, refillIntervalMs: number, keyStrategy: string }>} */
export const ENDPOINT_CONFIGS = {

  // ── Auth (tight limits, per-IP) ──────────────────────────
  login:          { capacity: 5,   refillRate: 1,  refillIntervalMs: 60_000,  keyStrategy: "login" },
  register:       { capacity: 3,   refillRate: 1,  refillIntervalMs: 60_000,  keyStrategy: "login" },
  sendOtp:        { capacity: 3,   refillRate: 1,  refillIntervalMs: 60_000,  keyStrategy: "otp" },
  forgotPassword: { capacity: 3,   refillRate: 1,  refillIntervalMs: 60_000,  keyStrategy: "passwordReset" },
  checkEmail:     { capacity: 5,   refillRate: 1,  refillIntervalMs: 60_000,  keyStrategy: "login" },

  // ── Dashboard / Reports (high read throughput) ───────────
  dashboard:      { capacity: 150, refillRate: 30, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },
  reports:        { capacity: 150, refillRate: 30, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },

  // ── Search / List reads ──────────────────────────────────
  productSearch:  { capacity: 100, refillRate: 20, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },
  categoryList:   { capacity: 100, refillRate: 20, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },
  unitList:       { capacity: 100, refillRate: 20, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },

  // ── Invoices ─────────────────────────────────────────────
  invoices:       { capacity: 80,  refillRate: 20, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },

  // ── CRUD operations ──────────────────────────────────────
  productCrud:    { capacity: 60,  refillRate: 15, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },
  orderCrud:      { capacity: 60,  refillRate: 15, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },
  stockCrud:      { capacity: 60,  refillRate: 15, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },
  categoryCrud:   { capacity: 60,  refillRate: 15, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },
  unitCrud:       { capacity: 60,  refillRate: 15, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },
  outletCrud:     { capacity: 60,  refillRate: 15, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },
  customerCrud:   { capacity: 60,  refillRate: 15, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },
  expenseCrud:    { capacity: 60,  refillRate: 15, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },
  userCrud:       { capacity: 60,  refillRate: 15, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },
  roleCrud:       { capacity: 60,  refillRate: 15, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },
  businessCrud:   { capacity: 60,  refillRate: 15, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },

  // ── File / Export (very tight) ───────────────────────────
  fileUpload:     { capacity: 10,  refillRate: 1,  refillIntervalMs: 60_000,  keyStrategy: "upload" },
  export:         { capacity: 5,   refillRate: 1,  refillIntervalMs: 60_000,  keyStrategy: "authenticated" },
  print:          { capacity: 30,  refillRate: 5,  refillIntervalMs: 1_000,   keyStrategy: "authenticated" },

  // ── Webhooks ─────────────────────────────────────────────
  webhook:        { capacity: 100, refillRate: 20, refillIntervalMs: 1_000,   keyStrategy: "ip" },

  // ── Admin (higher limits) ────────────────────────────────
  admin:          { capacity: 300, refillRate: 60, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },

  // ── Public endpoints (plans, features pages) ─────────────
  publicRead:     { capacity: 60,  refillRate: 10, refillIntervalMs: 1_000,   keyStrategy: "ip" },

  // ── Audit logs ───────────────────────────────────────────
  auditLogs:      { capacity: 60,  refillRate: 15, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },

  // ── Payments ─────────────────────────────────────────────
  payments:       { capacity: 30,  refillRate: 5,  refillIntervalMs: 1_000,   keyStrategy: "authenticated" },

  // ── Sessions ─────────────────────────────────────────────
  sessions:       { capacity: 30,  refillRate: 5,  refillIntervalMs: 1_000,   keyStrategy: "authenticated" },

  // ── Default fallback ─────────────────────────────────────
  default:        { capacity: 60,  refillRate: 15, refillIntervalMs: 1_000,   keyStrategy: "authenticated" },
};


// ─────────────────────────────────────────────────────────────
//  Subscription tier multipliers
// ─────────────────────────────────────────────────────────────

/**
 * Multipliers applied to the base `capacity` of every endpoint config.
 * Higher tiers get proportionally larger buckets.
 *
 * @type {Record<string, { capacityMultiplier: number }>}
 */
export const TIER_MULTIPLIERS = {
  free:       { capacityMultiplier: 1 },
  starter:    { capacityMultiplier: 4 },
  business:   { capacityMultiplier: 10 },
  enterprise: { capacityMultiplier: 20 },
};


// ─────────────────────────────────────────────────────────────
//  Plan slug → tier mapping
// ─────────────────────────────────────────────────────────────

/**
 * Maps plan slugs (from the Plan model) to internal tier names.
 * Unrecognized slugs fall back to "free".
 *
 * @type {Record<string, string>}
 */
export const PLAN_TIER_MAP = {
  "starter-retail":   "starter",
  "starter":          "starter",
  "wholesale-pro":    "business",
  "pro":              "business",
  "hybrid-business":  "business",
  "enterprise":       "enterprise",
};

/**
 * Resolve the tier name for a given plan slug.
 *
 * @param {string|undefined|null} planSlug - The plan slug from the database
 * @returns {string} Tier name (e.g. "free", "starter", "business", "enterprise")
 */
export function resolveTier(planSlug) {
  if (!planSlug) return "free";
  return PLAN_TIER_MAP[planSlug] || "free";
}


// ─────────────────────────────────────────────────────────────
//  Whitelist configuration
// ─────────────────────────────────────────────────────────────

/**
 * Requests matching any of these criteria bypass rate limiting entirely.
 */
export const WHITELIST = {
  /** @type {string[]} IP addresses that bypass rate limiting */
  ips: [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
  ],

  /** @type {string[]} URL paths that bypass rate limiting */
  paths: [
    "/api/health",
  ],

  /** @type {string[]} User roles that bypass rate limiting */
  roles: [
    "superadmin",
  ],
};

/**
 * Check whether a request should bypass rate limiting.
 *
 * @param {import("express").Request} req
 * @returns {boolean}
 */
export function isWhitelisted(req) {
  // Check path
  if (WHITELIST.paths.includes(req.path)) return true;

  // Check role
  if (req.user?.role && WHITELIST.roles.includes(req.user.role)) return true;

  // Check IP
  const ip = (req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
  if (WHITELIST.ips.includes(ip)) return true;

  return false;
}

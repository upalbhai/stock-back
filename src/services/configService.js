import { SystemSetting } from "../models/SystemSetting.js";
import { logger } from "../utils/logger.js";

let cachedSettings = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute in-memory cache

/**
 * Retrieves the system setting singleton, using cached version when valid.
 */
export async function getSystemSettings({ forceFresh = false } = {}) {
  const now = Date.now();
  if (!forceFresh && cachedSettings && now < cacheExpiry) {
    return cachedSettings;
  }

  let settings = await SystemSetting.findOne();
  if (!settings) {
    settings = await SystemSetting.create({});
  }

  cachedSettings = settings;
  cacheExpiry = now + CACHE_TTL_MS;
  return settings;
}

/**
 * Invalidates the in-memory settings cache.
 */
export function invalidateConfigCache() {
  cachedSettings = null;
  cacheExpiry = 0;
}

/**
 * Retrieves email configuration (ZeptoMail).
 */
export async function getMailConfig() {
  const settings = await getSystemSettings();
  const cfg = settings.emailConfig || {};
  const zeptoApiKey = cfg.zepto?.apiKey || cfg.apiKey || process.env.ZEPTOMAIL_API_KEY || "";
  const brevoApiKey = cfg.brevo?.apiKey || process.env.BREVO_API_KEY || "";

  return {
    provider: (cfg.provider || "ZEPTOMAIL").toUpperCase(),
    fallbackEnabled: cfg.fallbackEnabled !== false,
    fromEmail: cfg.fromEmail || "noreply@minihisab.com",
    fromName: cfg.fromName || "Mini Hisab",
    zepto: {
      apiKey: zeptoApiKey,
      region: cfg.zepto?.region || cfg.region || "IN",
      isConfigured: Boolean(zeptoApiKey && zeptoApiKey.trim().length > 0)
    },
    brevo: {
      apiKey: brevoApiKey,
      isConfigured: Boolean(brevoApiKey && brevoApiKey.trim().length > 0)
    },
    // Legacy compatibility helpers
    apiKey: zeptoApiKey,
    region: cfg.zepto?.region || cfg.region || "IN"
  };
}

/**
 * Retrieves Razorpay credentials from database.
 */
export async function getRazorpayConfig() {
  const settings = await getSystemSettings();
  const cfg = settings.razorpayConfig || {};
  return {
    keyId: cfg.keyId || "",
    keySecret: cfg.keySecret || "",
    webhookSecret: cfg.webhookSecret || ""
  };
}

/**
 * Ensures system settings document exists and migrates any existing environment keys
 * into the database on startup if database has not yet been populated.
 */
export async function ensureInitialSettings() {
  try {
    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = new SystemSetting();
    }

    let modified = false;

    // Migrate Razorpay credentials from process.env if not set in DB
    if (!settings.razorpayConfig?.keyId && process.env.RAZORPAY_KEY_ID) {
      if (!settings.razorpayConfig) settings.razorpayConfig = {};
      settings.razorpayConfig.keyId = process.env.RAZORPAY_KEY_ID;
      settings.razorpayConfig.keySecret = process.env.RAZORPAY_KEY_SECRET || "";
      modified = true;
      logger.info("[ConfigService] Auto-migrated Razorpay credentials from environment to Database");
    }

    // Initialize default email config if empty
    if (!settings.emailConfig) {
      settings.emailConfig = {
        provider: "ZEPTOMAIL",
        apiKey: "",
        region: "IN",
        fromEmail: "noreply@minihisab.com",
        fromName: "Mini Hisab"
      };
      modified = true;
    }

    if (modified) {
      await settings.save();
      invalidateConfigCache();
    }

    logger.info("[ConfigService] System settings initialized and verified in Database");
  } catch (err) {
    logger.error("[ConfigService] Error ensuring initial settings:", err);
  }
}

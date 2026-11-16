import { successResponse } from "../../utils/successResponse.js";
import { errorResponse } from "../../utils/errorResponse.js";
import { SystemSetting } from "../../models/SystemSetting.js";
import { AuditLog } from "../../models/AuditLog.js";
import { clearMaintenanceCache } from "../../middlewares/auth.js";
import { invalidateConfigCache } from "../../services/configService.js";
import { sendEmail } from "../../utils/mailer.js";

function maskSecret(val) {
  if (!val || typeof val !== "string") return "";
  if (val.length <= 8) return "••••••••";
  return `••••••••${val.slice(-4)}`;
}

async function getSettings(req, res, next) {
  try {
    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = await SystemSetting.create({});
    }

    const safeSettings = settings.toObject();

    // Mask sensitive secrets for safe UI display (Brevo + ZeptoMail + Razorpay)
    if (safeSettings.emailConfig) {
      const cfg = safeSettings.emailConfig;
      const zeptoKey = cfg.zepto?.apiKey || cfg.apiKey || "";
      const brevoKey = cfg.brevo?.apiKey || "";

      safeSettings.emailConfig.hasZeptoApiKey = Boolean(zeptoKey && zeptoKey.trim().length > 0);
      safeSettings.emailConfig.hasBrevoApiKey = Boolean(brevoKey && brevoKey.trim().length > 0);
      safeSettings.emailConfig.hasApiKey = safeSettings.emailConfig.hasZeptoApiKey || safeSettings.emailConfig.hasBrevoApiKey;

      safeSettings.emailConfig.zepto = {
        apiKey: maskSecret(zeptoKey),
        region: cfg.zepto?.region || cfg.region || "IN",
        hasApiKey: safeSettings.emailConfig.hasZeptoApiKey
      };

      safeSettings.emailConfig.brevo = {
        apiKey: maskSecret(brevoKey),
        hasApiKey: safeSettings.emailConfig.hasBrevoApiKey
      };

      // Legacy fallback
      safeSettings.emailConfig.apiKey = maskSecret(zeptoKey);
    }

    if (safeSettings.razorpayConfig) {
      const rawSecret = safeSettings.razorpayConfig.keySecret;
      safeSettings.razorpayConfig.hasKeySecret = Boolean(rawSecret && rawSecret.trim().length > 0);
      safeSettings.razorpayConfig.keySecret = maskSecret(rawSecret);

      const rawWebhookSecret = safeSettings.razorpayConfig.webhookSecret;
      safeSettings.razorpayConfig.hasWebhookSecret = Boolean(rawWebhookSecret && rawWebhookSecret.trim().length > 0);
      safeSettings.razorpayConfig.webhookSecret = maskSecret(rawWebhookSecret);
    }

    return successResponse({ res, data: { settings: safeSettings } });
  } catch (error) {
    return next(error);
  }
}

async function updateSettings(req, res, next) {
  try {
    const {
      maintenanceMode,
      defaultTrialDays,
      allowNewSignups,
      globalAnnouncement,
      bankDetails,
      emailConfig,
      razorpayConfig
    } = req.body;

    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = new SystemSetting();
    }
    
    if (maintenanceMode !== undefined) settings.maintenanceMode = maintenanceMode;
    if (defaultTrialDays !== undefined) settings.defaultTrialDays = defaultTrialDays;
    if (allowNewSignups !== undefined) settings.allowNewSignups = allowNewSignups;
    if (globalAnnouncement !== undefined) settings.globalAnnouncement = globalAnnouncement;
    if (bankDetails && typeof bankDetails === "object") {
      settings.bankDetails = {
        ...(settings.bankDetails?.toObject?.() || settings.bankDetails || {}),
        ...bankDetails
      };
    }

    // Update Email Configuration (Brevo + ZeptoMail Dynamic)
    if (emailConfig && typeof emailConfig === "object") {
      if (!settings.emailConfig) settings.emailConfig = {};
      if (emailConfig.provider !== undefined) {
        settings.emailConfig.provider = String(emailConfig.provider).toUpperCase();
      }
      if (emailConfig.fallbackEnabled !== undefined) {
        settings.emailConfig.fallbackEnabled = Boolean(emailConfig.fallbackEnabled);
      }
      if (emailConfig.fromEmail !== undefined) {
        settings.emailConfig.fromEmail = emailConfig.fromEmail.trim().toLowerCase();
      }
      if (emailConfig.fromName !== undefined) {
        settings.emailConfig.fromName = emailConfig.fromName.trim();
      }

      // ZeptoMail
      if (!settings.emailConfig.zepto) settings.emailConfig.zepto = {};
      if (emailConfig.zepto?.region) settings.emailConfig.zepto.region = emailConfig.zepto.region;
      if (emailConfig.region) settings.emailConfig.region = emailConfig.region;
      
      const newZeptoKey = emailConfig.zepto?.apiKey || emailConfig.apiKey;
      if (typeof newZeptoKey === "string" && newZeptoKey.trim().length > 0 && !newZeptoKey.includes("••")) {
        settings.emailConfig.zepto.apiKey = newZeptoKey.trim();
        settings.emailConfig.apiKey = newZeptoKey.trim(); // sync legacy
      }

      // Brevo
      if (!settings.emailConfig.brevo) settings.emailConfig.brevo = {};
      const newBrevoKey = emailConfig.brevo?.apiKey;
      if (typeof newBrevoKey === "string" && newBrevoKey.trim().length > 0 && !newBrevoKey.includes("••")) {
        settings.emailConfig.brevo.apiKey = newBrevoKey.trim();
      }
    }

    // Update Razorpay Configuration
    if (razorpayConfig && typeof razorpayConfig === "object") {
      if (!settings.razorpayConfig) settings.razorpayConfig = {};
      if (razorpayConfig.keyId !== undefined) {
        settings.razorpayConfig.keyId = razorpayConfig.keyId.trim();
      }
      // Only overwrite keySecret if caller provided a new unmasked string
      if (
        typeof razorpayConfig.keySecret === "string" &&
        razorpayConfig.keySecret.trim().length > 0 &&
        !razorpayConfig.keySecret.includes("••")
      ) {
        settings.razorpayConfig.keySecret = razorpayConfig.keySecret.trim();
      }
      // Only overwrite webhookSecret if caller provided a new unmasked string
      if (
        typeof razorpayConfig.webhookSecret === "string" &&
        razorpayConfig.webhookSecret.trim().length > 0 &&
        !razorpayConfig.webhookSecret.includes("••")
      ) {
        settings.razorpayConfig.webhookSecret = razorpayConfig.webhookSecret.trim();
      }
    }
    
    await settings.save();
    clearMaintenanceCache();
    invalidateConfigCache();

    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "update_system_settings",
      message: `System settings updated (including integration credentials)`,
      ip: req.ip
    });

    try {
      if (maintenanceMode !== undefined) {
        const { getIO } = await import("../../config/socket.js");
        getIO().emit("maintenanceUpdated", { isEnabled: maintenanceMode });
      }
    } catch (e) {
      console.error("Failed to emit maintenance socket event", e);
    }

    const safeSettings = settings.toObject();
    if (safeSettings.emailConfig) {
      const cfg = safeSettings.emailConfig;
      const zeptoKey = cfg.zepto?.apiKey || cfg.apiKey || "";
      const brevoKey = cfg.brevo?.apiKey || "";

      safeSettings.emailConfig.hasZeptoApiKey = Boolean(zeptoKey && zeptoKey.trim().length > 0);
      safeSettings.emailConfig.hasBrevoApiKey = Boolean(brevoKey && brevoKey.trim().length > 0);
      safeSettings.emailConfig.hasApiKey = safeSettings.emailConfig.hasZeptoApiKey || safeSettings.emailConfig.hasBrevoApiKey;

      safeSettings.emailConfig.zepto = {
        apiKey: maskSecret(zeptoKey),
        region: cfg.zepto?.region || cfg.region || "IN",
        hasApiKey: safeSettings.emailConfig.hasZeptoApiKey
      };

      safeSettings.emailConfig.brevo = {
        apiKey: maskSecret(brevoKey),
        hasApiKey: safeSettings.emailConfig.hasBrevoApiKey
      };

      safeSettings.emailConfig.apiKey = maskSecret(zeptoKey);
    }
    if (safeSettings.razorpayConfig) {
      safeSettings.razorpayConfig.hasKeySecret = Boolean(settings.razorpayConfig?.keySecret);
      safeSettings.razorpayConfig.keySecret = maskSecret(settings.razorpayConfig?.keySecret);
      safeSettings.razorpayConfig.hasWebhookSecret = Boolean(settings.razorpayConfig?.webhookSecret);
      safeSettings.razorpayConfig.webhookSecret = maskSecret(settings.razorpayConfig?.webhookSecret);
    }

    return successResponse({ res, data: { settings: safeSettings }, message: "Settings updated successfully" });
  } catch (error) {
    return next(error);
  }
}

async function testEmailDispatch(req, res, next) {
  try {
    const { targetEmail, provider } = req.body;
    if (!targetEmail || !targetEmail.trim()) {
      return errorResponse({ res, statusCode: 400, message: "Target recipient email is required" });
    }

    const testSubject = `MiniHisab Email Test - ${provider || "Active"} Connection`;
    const testHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="margin-bottom: 20px;">
          <h2 style="color: #0f172a; margin: 0 0 6px; font-size: 20px;">MiniHisab Gateway Test</h2>
          <p style="color: #64748b; margin: 0; font-size: 13px;">Dynamic Brevo & ZeptoMail Dispatch Verification</p>
        </div>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <p style="margin: 0 0 8px; font-size: 13px; color: #334155;"><strong>Requested Provider:</strong> ${provider || "System Primary Chain"}</p>
          <p style="margin: 0 0 8px; font-size: 13px; color: #334155;"><strong>Recipient Address:</strong> ${targetEmail.trim()}</p>
          <p style="margin: 0; font-size: 13px; color: #334155;"><strong>Timestamp:</strong> ${new Date().toUTCString()}</p>
        </div>
        <p style="font-size: 13px; color: #16a34a; font-weight: 600; margin: 0;">If you received this message, your transactional email gateway is configured and live!</p>
      </div>
    `.trim();

    const result = await sendEmail({
      to: targetEmail.trim(),
      subject: testSubject,
      html: testHtml,
      templateName: "GATEWAY_TEST",
      forceProvider: provider || null
    });

    return successResponse({
      res,
      message: `Test email dispatched successfully via ${result.provider || "Gateway"}`,
      data: result
    });
  } catch (error) {
    return errorResponse({
      res,
      statusCode: error.status || 500,
      message: error.message || "Failed to dispatch test email"
    });
  }
}

export { getSettings, updateSettings, testEmailDispatch };

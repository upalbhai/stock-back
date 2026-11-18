import { getMailConfig } from "../services/configService.js";
import { EmailLog } from "../models/EmailLog.js";
import {
  getOtpEmailTemplate,
  getRegistrationSubmittedTemplate,
  getBusinessApprovedTemplate,
  getBusinessRejectedTemplate,
  getOutletApprovedTemplate,
  getInviteEmailTemplate,
  getWelcomeEmailTemplate,
  getPasswordResetOtpTemplate,
  getTrialExpiringEmailTemplate,
  getTrialExpiredEmailTemplate,
  getSubscriptionConfirmationTemplate,
  getNewDeviceLoginTemplate,
  getAgentWelcomeLinkTemplate,
  getManualPaymentInvoiceTemplate,
  getManualPaymentRejectedTemplate
} from "./emailTemplates.js";

const ZEPTOMAIL_ENDPOINTS = Object.freeze({
  IN: "https://api.zeptomail.in/v1.1/email",
  US: "https://api.zeptomail.com/v1.1/email",
  EU: "https://api.zeptomail.eu/v1.1/email"
});

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

const DEFAULT_TIMEOUT_MS = 10000;

function formatAuthHeader(apiKey) {
  const trimmed = (apiKey || "").trim();
  if (trimmed.startsWith("Zoho-enczapikey ")) {
    return trimmed;
  }
  return `Zoho-enczapikey ${trimmed}`;
}

async function sendViaZeptoMail({ recipients, mailConfig, subject, html, text }) {
  const region = mailConfig.zepto?.region || mailConfig.region || "IN";
  const endpoint = ZEPTOMAIL_ENDPOINTS[region] || ZEPTOMAIL_ENDPOINTS.IN;
  const formattedRecipients = recipients.map((target) => {
    if (typeof target === "string") {
      return { email_address: { address: target.trim() } };
    }
    return {
      email_address: {
        address: target.email || target.address,
        ...(target.name ? { name: target.name } : {})
      }
    };
  });

  const payload = {
    from: {
      address: mailConfig.fromEmail || "noreply@minihisab.com",
      name: mailConfig.fromName || "Mini Hisab"
    },
    to: formattedRecipients,
    subject,
    htmlbody: html,
    ...(text ? { textbody: text } : {})
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": formatAuthHeader(mailConfig.zepto?.apiKey || mailConfig.apiKey)
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const resJson = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg =
        resJson?.message ||
        resJson?.error?.message ||
        resJson?.data?.[0]?.message ||
        `ZeptoMail delivery rejected with HTTP ${res.status}`;
      const err = new Error(errMsg);
      err.provider = "ZEPTOMAIL";
      err.status = res.status;
      err.response = resJson;
      throw err;
    }

    const messageId =
      resJson?.data?.[0]?.details?.message_id ||
      resJson?.data?.[0]?.message_id ||
      resJson?.message_id ||
      "accepted";

    return { ok: true, provider: "ZEPTOMAIL", messageId, response: resJson };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendViaBrevo({ recipients, mailConfig, subject, html, text }) {
  const formattedRecipients = recipients.map((target) => {
    if (typeof target === "string") {
      return { email: target.trim() };
    }
    return {
      email: target.email || target.address,
      ...(target.name ? { name: target.name } : {})
    };
  });

  const payload = {
    sender: {
      email: mailConfig.fromEmail || "noreply@minihisab.com",
      name: mailConfig.fromName || "Mini Hisab"
    },
    to: formattedRecipients,
    subject,
    htmlContent: html,
    ...(text ? { textContent: text } : {})
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const apiKey = (mailConfig.brevo?.apiKey || "").trim();
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const resJson = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg =
        resJson?.message ||
        resJson?.error?.message ||
        `Brevo delivery rejected with HTTP ${res.status}`;
      const err = new Error(errMsg);
      err.provider = "BREVO";
      err.status = res.status;
      err.response = resJson;
      throw err;
    }

    const messageId = resJson?.messageId || "accepted";
    return { ok: true, provider: "BREVO", messageId, response: resJson };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Core multi-provider email dispatcher with automated fallback between Brevo and ZeptoMail.
 */
export async function sendEmail({ to, subject, html, text, templateName = null, forceProvider = null }) {
  const mailConfig = await getMailConfig();
  const recipientStr = Array.isArray(to) ? to.join(", ") : to;
  const rawRecipients = Array.isArray(to) ? to : [to];

  // Build attempt chain: primary first, followed by secondary fallback if enabled
  let chain = [];
  if (forceProvider) {
    chain = [forceProvider.toUpperCase()];
  } else {
    const primary = mailConfig.provider === "BREVO" ? "BREVO" : "ZEPTOMAIL";
    const secondary = primary === "BREVO" ? "ZEPTOMAIL" : "BREVO";
    chain = [primary];
    if (mailConfig.fallbackEnabled) {
      chain.push(secondary);
    }
  }

  // Filter chain to only configured providers
  const configuredChain = chain.filter((p) => {
    if (p === "BREVO") return Boolean(mailConfig.brevo?.isConfigured);
    if (p === "ZEPTOMAIL") return Boolean(mailConfig.zepto?.isConfigured);
    return false;
  });

  // Dev / unconfigured fallback: print to console and log
  if (configuredChain.length === 0) {
    const codeMatch = html?.match(/\b(\d{6})\b/);
    console.log(`\n📧 [DEV EMAIL - NO ACTIVE PROVIDER KEY] To: ${recipientStr} | Subject: ${subject}${codeMatch ? ` | OTP Code: ${codeMatch[1]}` : ""}`);
    
    try {
      await EmailLog.create({
        recipient: recipientStr,
        subject,
        template: templateName,
        provider: mailConfig.provider,
        status: "DEV_LOGGED",
        metadata: { devNote: "Neither ZeptoMail nor Brevo API keys configured in settings" }
      });
    } catch (e) {
      // Don't crash dispatch on logging error
    }

    return { dev: true, message: "Logged to console in dev mode (no email provider API key configured in DB)" };
  }

  const errors = [];
  for (let i = 0; i < configuredChain.length; i++) {
    const providerName = configuredChain[i];
    const isFallback = i > 0;

    try {
      let result;
      if (providerName === "BREVO") {
        result = await sendViaBrevo({ recipients: rawRecipients, mailConfig, subject, html, text });
      } else {
        result = await sendViaZeptoMail({ recipients: rawRecipients, mailConfig, subject, html, text });
      }

      await EmailLog.create({
        recipient: recipientStr,
        subject,
        template: templateName,
        provider: providerName,
        status: "SENT",
        providerMessageId: result.messageId,
        metadata: {
          fallbackUsed: isFallback,
          primaryProvider: mailConfig.provider,
          attemptChain: configuredChain,
          response: result.response
        }
      }).catch(() => {});

      return {
        ok: true,
        provider: providerName,
        messageId: result.messageId,
        fallbackUsed: isFallback
      };
    } catch (err) {
      errors.push({ provider: providerName, error: err.message, status: err.status });
      console.warn(`[Mailer] Provider ${providerName} failed for ${recipientStr}: ${err.message}`);
    }
  }

  // All providers in chain failed
  const errorSummary = errors.map((e) => `[${e.provider}] ${e.error}`).join(" | ");
  await EmailLog.create({
    recipient: recipientStr,
    subject,
    template: templateName,
    provider: configuredChain[0],
    status: "FAILED",
    error: errorSummary,
    metadata: { errors, attemptChain: configuredChain }
  }).catch(() => {});

  const combinedError = new Error(`Email delivery failed across providers: ${errorSummary}`);
  combinedError.status = 502;
  throw combinedError;
}

export async function sendOtpEmail(email, code) {
  const { subject, html } = getOtpEmailTemplate(code);
  return sendEmail({ to: email, subject, html, templateName: "OTP" });
}

export async function sendAgentWelcomeLink(email, name, loginLink) {
  if (!email) return;
  const { subject, html } = getAgentWelcomeLinkTemplate(loginLink, name);
  return sendEmail({ to: email, subject, html, templateName: "AGENT_WELCOME" });
}

export async function sendRegistrationSubmitted(ownerEmail, businessName) {
  if (!ownerEmail) return;
  const { subject, html } = getRegistrationSubmittedTemplate(businessName);
  return sendEmail({ to: ownerEmail, subject, html, templateName: "REGISTRATION_SUBMITTED" });
}

export async function sendBusinessApproved(ownerEmail, businessName) {
  if (!ownerEmail) return;
  const { subject, html } = getBusinessApprovedTemplate(businessName);
  return sendEmail({ to: ownerEmail, subject, html, templateName: "BUSINESS_APPROVED" });
}

export async function sendBusinessRejected(ownerEmail, businessName, reason) {
  if (!ownerEmail) return;
  const { subject, html } = getBusinessRejectedTemplate(businessName, reason);
  return sendEmail({ to: ownerEmail, subject, html, templateName: "BUSINESS_REJECTED" });
}

export async function sendOutletApproved(email, outletName) {
  if (!email) return;
  const { subject, html } = getOutletApprovedTemplate(outletName);
  return sendEmail({ to: email, subject, html, templateName: "OUTLET_APPROVED" });
}

export async function sendInviteEmail(email, inviteLink, name) {
  if (!email) return;
  const { subject, html } = getInviteEmailTemplate(inviteLink, name);
  return sendEmail({ to: email, subject, html, templateName: "USER_INVITE" });
}

export async function sendWelcomeEmail(email, name, trialEndDate) {
  if (!email) return;
  const { subject, html } = getWelcomeEmailTemplate(name, trialEndDate);
  return sendEmail({ to: email, subject, html, templateName: "WELCOME" });
}

export async function sendPasswordResetOtp(email, code) {
  if (!email) return;
  const { subject, html } = getPasswordResetOtpTemplate(code);
  return sendEmail({ to: email, subject, html, templateName: "PASSWORD_RESET_OTP" });
}

export async function sendTrialExpiringEmail(email, name, daysLeft) {
  if (!email) return;
  const { subject, html } = getTrialExpiringEmailTemplate(name, daysLeft);
  return sendEmail({ to: email, subject, html, templateName: "TRIAL_EXPIRING" });
}

export async function sendTrialExpiredEmail(email, name) {
  if (!email) return;
  const { subject, html } = getTrialExpiredEmailTemplate(name);
  return sendEmail({ to: email, subject, html, templateName: "TRIAL_EXPIRED" });
}

export async function sendSubscriptionConfirmation(email, planName, amount, currency, endDate) {
  if (!email) return;
  const { subject, html } = getSubscriptionConfirmationTemplate(planName, amount, currency, endDate);
  return sendEmail({ to: email, subject, html, templateName: "SUBSCRIPTION_CONFIRMATION" });
}

export async function sendNewDeviceLoginEmail(email, name, deviceInfo) {
  if (!email) return;
  const { subject, html } = getNewDeviceLoginTemplate(
    name,
    deviceInfo.deviceName,
    deviceInfo.location,
    deviceInfo.ip,
    deviceInfo.time || new Date()
  );
  return sendEmail({ to: email, subject, html, templateName: "NEW_DEVICE_LOGIN" });
}

export async function sendManualPaymentInvoice(email, businessName, amount, currency, transactionId, planName, endDate) {
  if (!email) return;
  const { subject, html } = getManualPaymentInvoiceTemplate(businessName, amount, currency, transactionId, planName, endDate);
  return sendEmail({ to: email, subject, html, templateName: "MANUAL_PAYMENT_INVOICE" });
}

export async function sendManualPaymentRejected(email, businessName, amount, currency, transactionId, reason) {
  if (!email) return;
  const { subject, html } = getManualPaymentRejectedTemplate(businessName, amount, currency, transactionId, reason);
  return sendEmail({ to: email, subject, html, templateName: "MANUAL_PAYMENT_REJECTED" });
}

export default {
  sendEmail,
  sendOtpEmail,
  sendRegistrationSubmitted,
  sendBusinessApproved,
  sendBusinessRejected,
  sendOutletApproved,
  sendInviteEmail,
  sendWelcomeEmail,
  sendPasswordResetOtp,
  sendTrialExpiringEmail,
  sendTrialExpiredEmail,
  sendSubscriptionConfirmation,
  sendNewDeviceLoginEmail,
  sendAgentWelcomeLink,
  sendManualPaymentInvoice,
  sendManualPaymentRejected
};

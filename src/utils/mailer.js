import { env } from "../config/env.js";
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
  getSubscriptionConfirmationTemplate
} from "./emailTemplates.js";

const BREVO_API = "https://api.brevo.com/v3/smtp/email";
const fetchImpl = globalThis.fetch?.bind(globalThis);
const SENDER = {
  email: process.env.BREVO_FROM_EMAIL || env.BREVO_FROM_EMAIL || "no-reply@example.com",
  name: process.env.BREVO_FROM_NAME || env.BREVO_FROM_NAME || "Retail SaaS"
};

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.BREVO_API_KEY && !env.BREVO_API_KEY) {
    console.warn("BREVO_API_KEY not configured; skipping email");
    return null;
  }
  if (!fetchImpl) {
    throw new Error("Fetch is not available in this Node runtime");
  }
  const body = {
    sender: SENDER,
    to: Array.isArray(to) ? to.map((t) => ({ email: t })) : [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text
  };
  const res = await fetchImpl(BREVO_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY || env.BREVO_API_KEY
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("Brevo send failed:", res.status, txt);
    throw new Error("Email send failed");
  }
  return await res.json();
}

export async function sendOtpEmail(email, code) {
  const { subject, html } = getOtpEmailTemplate(code);
  return sendEmail({ to: email, subject, html });
}

export async function sendRegistrationSubmitted(ownerEmail, businessName) {
  if (!ownerEmail) return;
  const { subject, html } = getRegistrationSubmittedTemplate(businessName);
  return sendEmail({ to: ownerEmail, subject, html });
}

export async function sendBusinessApproved(ownerEmail, businessName) {
  if (!ownerEmail) return;
  const { subject, html } = getBusinessApprovedTemplate(businessName);
  return sendEmail({ to: ownerEmail, subject, html });
}

export async function sendBusinessRejected(ownerEmail, businessName, reason) {
  if (!ownerEmail) return;
  const { subject, html } = getBusinessRejectedTemplate(businessName, reason);
  return sendEmail({ to: ownerEmail, subject, html });
}

export async function sendOutletApproved(email, outletName) {
  if (!email) return;
  const { subject, html } = getOutletApprovedTemplate(outletName);
  return sendEmail({ to: email, subject, html });
}

export async function sendInviteEmail(email, inviteLink, name) {
  if (!email) return;
  const { subject, html } = getInviteEmailTemplate(inviteLink, name);
  return sendEmail({ to: email, subject, html });
}

export async function sendWelcomeEmail(email, name, trialEndDate) {
  if (!email) return;
  const { subject, html } = getWelcomeEmailTemplate(name, trialEndDate);
  return sendEmail({ to: email, subject, html });
}

export async function sendPasswordResetOtp(email, code) {
  if (!email) return;
  const { subject, html } = getPasswordResetOtpTemplate(code);
  return sendEmail({ to: email, subject, html });
}

export async function sendTrialExpiringEmail(email, name, daysLeft) {
  if (!email) return;
  const { subject, html } = getTrialExpiringEmailTemplate(name, daysLeft);
  return sendEmail({ to: email, subject, html });
}

export async function sendTrialExpiredEmail(email, name) {
  if (!email) return;
  const { subject, html } = getTrialExpiredEmailTemplate(name);
  return sendEmail({ to: email, subject, html });
}

export async function sendSubscriptionConfirmation(email, planName, amount, endDate) {
  if (!email) return;
  const { subject, html } = getSubscriptionConfirmationTemplate(planName, amount, endDate);
  return sendEmail({ to: email, subject, html });
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
  sendSubscriptionConfirmation
};

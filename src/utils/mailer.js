import { env } from "../config/env.js";

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
  const subject = "Your login code";
  const html = `<p>Your login code is <strong>${code}</strong>. It expires in 10 minutes.</p>`;
  return sendEmail({ to: email, subject, html });
}

export async function sendRegistrationSubmitted(ownerEmail, businessName) {
  if (!ownerEmail) return;
  const subject = `Registration submitted for ${businessName}`;
  const html = `<p>Your registration for <strong>${businessName}</strong> has been received and is awaiting admin approval.</p>`;
  return sendEmail({ to: ownerEmail, subject, html });
}

export async function sendBusinessApproved(ownerEmail, businessName) {
  if (!ownerEmail) return;
  const subject = `Your business ${businessName} is approved`;
  const html = `<p>Congratulations — your business <strong>${businessName}</strong> has been approved. You can now login and manage outlets.</p>`;
  return sendEmail({ to: ownerEmail, subject, html });
}

export async function sendBusinessRejected(ownerEmail, businessName, reason) {
  if (!ownerEmail) return;
  const subject = `Your business ${businessName} registration was declined`;
  const html = `<p>We're sorry — your business <strong>${businessName}</strong> was declined. ${reason ? `<p>Reason: ${reason}</p>` : ""}</p>`;
  return sendEmail({ to: ownerEmail, subject, html });
}

export async function sendOutletApproved(email, outletName) {
  if (!email) return;
  const subject = `Outlet approved: ${outletName}`;
  const html = `<p>Your outlet <strong>${outletName}</strong> has been approved and is now active.</p>`;
  return sendEmail({ to: email, subject, html });
}

export async function sendInviteEmail(email, inviteLink, name) {
  if (!email) return;
  const subject = `You're invited to join`;
  const html = `<p>Hi ${name || ""},</p><p>You have been invited. Click <a href="${inviteLink}">this link</a> to accept the invite.</p>`;
  return sendEmail({ to: email, subject, html });
}

export default {
  sendEmail,
  sendOtpEmail,
  sendRegistrationSubmitted,
  sendBusinessApproved,
  sendBusinessRejected,
  sendOutletApproved,
  sendInviteEmail
};

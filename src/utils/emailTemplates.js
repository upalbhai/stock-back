/**
 * File containing all the email templates used across the application.
 * You can customize the return values based on your UI/UX needs.
 */

export const getOtpEmailTemplate = (code) => {
  return {
    subject: "Your login code",
    html: `<p>Your login code is <strong>${code}</strong>. It expires in 10 minutes.</p>`
  };
};

export const getRegistrationSubmittedTemplate = (businessName) => {
  return {
    subject: `Registration submitted for ${businessName}`,
    html: `<p>Your registration for <strong>${businessName}</strong> has been received and is awaiting admin approval.</p>`
  };
};

export const getBusinessApprovedTemplate = (businessName) => {
  return {
    subject: `Your business ${businessName} is approved`,
    html: `<p>Congratulations — your business <strong>${businessName}</strong> has been approved. You can now login and manage outlets.</p>`
  };
};

export const getBusinessRejectedTemplate = (businessName, reason) => {
  return {
    subject: `Your business ${businessName} registration was declined`,
    html: `<p>We're sorry — your business <strong>${businessName}</strong> was declined. ${reason ? `<p>Reason: ${reason}</p>` : ""}</p>`
  };
};

export const getOutletApprovedTemplate = (outletName) => {
  return {
    subject: `Outlet approved: ${outletName}`,
    html: `<p>Your outlet <strong>${outletName}</strong> has been approved and is now active.</p>`
  };
};

export const getInviteEmailTemplate = (inviteLink, name) => {
  return {
    subject: `You're invited to join`,
    html: `<p>Hi ${name || ""},</p><p>You have been invited. Click <a href="${inviteLink}">this link</a> to accept the invite.</p>`
  };
};

export const getWelcomeEmailTemplate = (name, trialEndDate) => {
  const endDateStr = trialEndDate ? new Date(trialEndDate).toLocaleDateString() : 'in 7 days';
  return {
    subject: `Welcome to Outlet Pulse - Your 7-Day Trial Starts Now!`,
    html: `
      <h2>Welcome aboard, ${name}!</h2>
      <p>Your 7-day free trial has been activated successfully.</p>
      <p>You now have full access to all features to test out how Outlet Pulse can help your business.</p>
      <p>Your trial will end on <strong>${endDateStr}</strong>. Enjoy!</p>
    `
  };
};

export const getPasswordResetOtpTemplate = (code) => {
  return {
    subject: "Password Reset Code",
    html: `
      <h2>Password Reset</h2>
      <p>Your password reset code is: <strong>${code}</strong></p>
      <p>This code will expire in 10 minutes. If you didn't request this, you can ignore this email.</p>
    `
  };
};

export const getTrialExpiringEmailTemplate = (name, daysLeft) => {
  return {
    subject: `Your free trial expires in ${daysLeft} days`,
    html: `
      <h2>Hi ${name},</h2>
      <p>We hope you're enjoying Outlet Pulse!</p>
      <p>This is a quick reminder that your 7-day free trial will expire in <strong>${daysLeft} days</strong>.</p>
      <p>To ensure uninterrupted access, please upgrade to a paid plan before your trial ends.</p>
    `
  };
};

export const getTrialExpiredEmailTemplate = (name) => {
  return {
    subject: `Your free trial has expired`,
    html: `
      <h2>Hi ${name},</h2>
      <p>Your 7-day free trial has expired.</p>
      <p>We'd love to keep having you with us! Please log in to your dashboard and choose a subscription plan to restore access to your account.</p>
    `
  };
};

export const getSubscriptionConfirmationTemplate = (planName, amount, endDate) => {
  return {
    subject: `Subscription Confirmation - ${planName} Plan`,
    html: `
      <h2>Thank you for subscribing!</h2>
      <p>Your payment of <strong>₹${amount}</strong> was successful.</p>
      <p>You are now subscribed to the <strong>${planName}</strong> plan.</p>
      <p>Your subscription is active until: <strong>${new Date(endDate).toLocaleDateString()}</strong>.</p>
    `
  };
};

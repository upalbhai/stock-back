/**
 * File containing all the email templates used across the application.
 * You can customize the return values based on your UI/UX needs.
 */

const wrapHtml = (title, content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F5F5F7; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #FFFFFF; border-radius: 14px; border: 1px solid #D9D9E0; overflow: hidden; box-shadow: 0 10px 30px -20px rgba(28, 28, 30, 0.15);">
    <div style="padding: 32px 32px 24px;">
      <h2 style="margin: 0; font-size: 22px; font-weight: 600; color: #1C1C1E; letter-spacing: -0.5px;">${title}</h2>
    </div>
    <div style="padding: 0 32px 32px; font-size: 15px; line-height: 1.6; color: #1C1C1E;">
      ${content}
    </div>
    <div style="padding: 24px 32px; background-color: #F5F5F7; border-top: 1px solid #D9D9E0; font-size: 13px; color: #6C6C70; text-align: center;">
      <p style="margin: 0;">© ${new Date().getFullYear()} Mini Hisab. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

export const getAgentWelcomeLinkTemplate = (loginLink, name) => {
  return {
    subject: "Welcome to Mini Hisab - Access Your Agent Account",
    html: wrapHtml(
      `Welcome to Mini Hisab, ${name || "Agent"}!`,
      `<p style="margin-top: 0;">An Agent account has been created for you by the Administrator.</p>
       <p>Click the button below to verify your email and instantly access your Agent Portal:</p>
       <div style="margin: 32px 0; text-align: center;">
         <a href="${loginLink}" style="display: inline-block; padding: 14px 28px; background-color: #0066CC; color: #FFFFFF; text-decoration: none; font-weight: 600; border-radius: 8px; font-size: 16px;">Verify & Access Portal</a>
       </div>
       <p style="margin-bottom: 0; font-size: 14px; color: #6C6C70;">Or copy and paste this link into your browser:<br><a href="${loginLink}" style="color: #0066CC; word-break: break-all;">${loginLink}</a></p>`
    )
  };
};

export const getOtpEmailTemplate = (code) => {
  return {
    subject: "Your login code",
    html: wrapHtml(
      "Login to Mini Hisab",
      `<p style="margin-top: 0;">Use the following code to complete your login. This code will expire in 10 minutes.</p>
       <div style="margin: 32px 0; padding: 24px; background-color: #F5F5F7; border-radius: 12px; text-align: center; border: 1px solid #D9D9E0;">
         <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #0066CC;">${code}</span>
       </div>
       <p style="margin-bottom: 0; color: #6C6C70; font-size: 14px;">If you didn't request this code, you can safely ignore this email.</p>`
    )
  };
};

export const getRegistrationSubmittedTemplate = (businessName) => {
  return {
    subject: `Registration submitted for ${businessName}`,
    html: wrapHtml(
      "Registration Received",
      `<p style="margin-top: 0;">Hi there,</p>
       <p>Your registration for <strong>${businessName}</strong> has been successfully received.</p>
       <div style="margin: 24px 0; padding: 16px; background-color: #E8F0FE; border-radius: 8px; border-left: 4px solid #0066CC;">
         <p style="margin: 0; color: #0066CC; font-weight: 500;">Status: Awaiting Admin Approval</p>
       </div>
       <p style="margin-bottom: 0;">We will notify you once your business registration has been reviewed.</p>`
    )
  };
};

export const getBusinessApprovedTemplate = (businessName) => {
  return {
    subject: `Your business ${businessName} is approved`,
    html: wrapHtml(
      "Business Approved!",
      `<p style="margin-top: 0;">Congratulations!</p>
       <p>Your business <strong>${businessName}</strong> has been approved by our team.</p>
       <div style="margin: 24px 0; text-align: center;">
         <a href="#" style="display: inline-block; padding: 12px 24px; background-color: #0066CC; color: #FFFFFF; text-decoration: none; font-weight: 600; border-radius: 8px; font-size: 15px;">Login to Dashboard</a>
       </div>
       <p style="margin-bottom: 0;">You can now log in to your account and start managing your outlets.</p>`
    )
  };
};

export const getBusinessRejectedTemplate = (businessName, reason) => {
  return {
    subject: `Your business ${businessName} registration was declined`,
    html: wrapHtml(
      "Registration Declined",
      `<p style="margin-top: 0;">Hi there,</p>
       <p>We're sorry to inform you that your registration for <strong>${businessName}</strong> was declined.</p>
       ${reason ? `<div style="margin: 24px 0; padding: 16px; background-color: #FFF2F1; border-radius: 8px; border-left: 4px solid #FF3B30;"><p style="margin: 0; color: #C22922;"><strong>Reason:</strong> ${reason}</p></div>` : ""}
       <p style="margin-bottom: 0; color: #6C6C70;">If you believe this was a mistake or have questions, please contact our support team.</p>`
    )
  };
};

export const getOutletApprovedTemplate = (outletName) => {
  return {
    subject: `Outlet approved: ${outletName}`,
    html: wrapHtml(
      "Outlet Approved",
      `<p style="margin-top: 0;">Good news!</p>
       <p>Your outlet <strong>${outletName}</strong> has been approved and is now active.</p>
       <p style="margin-bottom: 0;">You can now start managing this outlet from your dashboard.</p>`
    )
  };
};

export const getInviteEmailTemplate = (inviteLink, name) => {
  return {
    subject: `You're invited to join`,
    html: wrapHtml(
      "You've been invited",
      `<p style="margin-top: 0;">Hi ${name || "there"},</p>
       <p>You have been invited to join a team on Mini Hisab.</p>
       <div style="margin: 32px 0; text-align: center;">
         <a href="${inviteLink}" style="display: inline-block; padding: 12px 24px; background-color: #0066CC; color: #FFFFFF; text-decoration: none; font-weight: 600; border-radius: 8px; font-size: 15px;">Accept Invitation</a>
       </div>
       <p style="margin-bottom: 0; font-size: 14px; color: #6C6C70;">Or copy and paste this link into your browser:<br><a href="${inviteLink}" style="color: #0066CC; word-break: break-all;">${inviteLink}</a></p>`
    )
  };
};

export const getWelcomeEmailTemplate = (name, trialEndDate) => {
  const endDateStr = trialEndDate ? new Date(trialEndDate).toLocaleDateString() : 'in 7 days';
  return {
    subject: `Welcome to Mini Hisab - Your 7-Day Trial Starts Now!`,
    html: wrapHtml(
      `Welcome aboard, ${name}!`,
      `<p style="margin-top: 0;">Your 7-day free trial has been activated successfully.</p>
       <p>You now have full access to all premium features to test out how Mini Hisab can help your business thrive.</p>
       <div style="margin: 24px 0; padding: 16px; background-color: #E8F0FE; border-radius: 8px; border: 1px solid #0066CC;">
         <p style="margin: 0; color: #0066CC; font-weight: 500; text-align: center;">Your trial will end on <strong>${endDateStr}</strong></p>
       </div>
       <p style="margin-bottom: 0;">Enjoy exploring the platform!</p>`
    )
  };
};

export const getPasswordResetOtpTemplate = (code) => {
  return {
    subject: "Password Reset Code",
    html: wrapHtml(
      "Password Reset",
      `<p style="margin-top: 0;">We received a request to reset your password. Use the code below to proceed.</p>
       <div style="margin: 32px 0; padding: 24px; background-color: #F5F5F7; border-radius: 12px; text-align: center; border: 1px solid #D9D9E0;">
         <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #0066CC;">${code}</span>
       </div>
       <p style="margin-bottom: 0; color: #6C6C70; font-size: 14px;">This code will expire in 10 minutes. If you didn't request a password reset, you can safely ignore this email.</p>`
    )
  };
};

export const getTrialExpiringEmailTemplate = (name, daysLeft) => {
  return {
    subject: `Your free trial expires in ${daysLeft} days`,
    html: wrapHtml(
      "Trial Expiring Soon",
      `<p style="margin-top: 0;">Hi ${name},</p>
       <p>We hope you're enjoying Mini Hisab!</p>
       <p>This is a quick reminder that your 7-day free trial will expire in <strong>${daysLeft} days</strong>.</p>
       <div style="margin: 24px 0; text-align: center;">
         <a href="#" style="display: inline-block; padding: 12px 24px; background-color: #FF9500; color: #FFFFFF; text-decoration: none; font-weight: 600; border-radius: 8px; font-size: 15px;">Upgrade Now</a>
       </div>
       <p style="margin-bottom: 0;">To ensure uninterrupted access to all features, please upgrade to a paid plan before your trial ends.</p>`
    )
  };
};

export const getTrialExpiredEmailTemplate = (name) => {
  return {
    subject: `Your free trial has expired`,
    html: wrapHtml(
      "Free Trial Expired",
      `<p style="margin-top: 0;">Hi ${name},</p>
       <p>Your 7-day free trial has officially expired.</p>
       <p>We'd love to keep having you with us! To restore access to your account and continue managing your outlets seamlessly, please choose a subscription plan.</p>
       <div style="margin: 24px 0; text-align: center;">
         <a href="#" style="display: inline-block; padding: 12px 24px; background-color: #0066CC; color: #FFFFFF; text-decoration: none; font-weight: 600; border-radius: 8px; font-size: 15px;">View Plans</a>
       </div>`
    )
  };
};

export const getSubscriptionConfirmationTemplate = (planName, amount, currency, endDate) => {
  const displayCurrency = currency || "INR";
  return {
    subject: `Subscription Confirmation - ${planName} Plan`,
    html: wrapHtml(
      "Thank you for subscribing!",
      `<p style="margin-top: 0;">Your payment was successful and your subscription is now active.</p>
       <table style="width: 100%; border-collapse: collapse; margin: 24px 0; background: #F5F5F7; border-radius: 8px; overflow: hidden; border: 1px solid #D9D9E0;">
         <tr><td style="padding: 12px 16px; color: #6C6C70; font-size: 14px; border-bottom: 1px solid #D9D9E0;">Plan</td><td style="padding: 12px 16px; font-weight: 600; text-align: right; border-bottom: 1px solid #D9D9E0;">${planName}</td></tr>
         <tr><td style="padding: 12px 16px; color: #6C6C70; font-size: 14px; border-bottom: 1px solid #D9D9E0;">Amount Paid</td><td style="padding: 12px 16px; font-weight: 600; text-align: right; border-bottom: 1px solid #D9D9E0;">${displayCurrency} ${amount}</td></tr>
         <tr><td style="padding: 12px 16px; color: #6C6C70; font-size: 14px;">Next Billing Date</td><td style="padding: 12px 16px; font-weight: 600; text-align: right;">${new Date(endDate).toLocaleDateString()}</td></tr>
       </table>
       <p style="margin-bottom: 0;">You can view and download your invoice from the billing section in your dashboard.</p>`
    )
  };
};

export const getNewDeviceLoginTemplate = (name, deviceName, location, ip, time) => {
  const locationStr = [location?.city, location?.region, location?.country]
    .filter(Boolean)
    .join(", ") || "Unknown location";
  const timeStr = new Date(time).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  });
  return {
    subject: "New device login detected on your account",
    html: wrapHtml(
      "New Login Detected",
      `<p style="margin-top: 0;">Hi ${name || "there"},</p>
       <p>We noticed a new sign-in to your Mini Hisab account from a device we haven't seen before.</p>
       <table style="width: 100%; border-collapse: collapse; margin: 24px 0; background: #F5F5F7; border-radius: 8px; overflow: hidden; border: 1px solid #D9D9E0;">
         <tr><td style="padding: 12px 16px; color: #6C6C70; font-size: 14px; border-bottom: 1px solid #D9D9E0; width: 100px;">Device</td><td style="padding: 12px 16px; font-weight: 600; color: #1C1C1E; border-bottom: 1px solid #D9D9E0;">${deviceName || "Unknown device"}</td></tr>
         <tr><td style="padding: 12px 16px; color: #6C6C70; font-size: 14px; border-bottom: 1px solid #D9D9E0;">Location</td><td style="padding: 12px 16px; font-weight: 600; color: #1C1C1E; border-bottom: 1px solid #D9D9E0;">${locationStr}</td></tr>
         <tr><td style="padding: 12px 16px; color: #6C6C70; font-size: 14px; border-bottom: 1px solid #D9D9E0;">IP Address</td><td style="padding: 12px 16px; font-weight: 600; color: #1C1C1E; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; border-bottom: 1px solid #D9D9E0;">${ip || "Unknown"}</td></tr>
         <tr><td style="padding: 12px 16px; color: #6C6C70; font-size: 14px;">Time</td><td style="padding: 12px 16px; font-weight: 600; color: #1C1C1E;">${timeStr}</td></tr>
       </table>
       <p style="margin-bottom: 12px;">If this was you, no action is needed.</p>
       <div style="padding: 16px; background-color: #FFF2F1; border-radius: 8px; border-left: 4px solid #FF3B30;">
         <p style="margin: 0; color: #C22922; font-size: 14px;"><strong>If this wasn't you</strong>, please change your password immediately and revoke unknown sessions from your account settings.</p>
       </div>`
    )
  };
};

export const getManualPaymentInvoiceTemplate = (businessName, amount, currency, transactionId, planName, endDate) => {
  const displayCurrency = currency || "INR";
  return {
    subject: `Payment Receipt & Invoice - ${businessName}`,
    html: wrapHtml(
      "Payment Received Successfully",
      `<p style="margin-top: 0;">Dear ${businessName},</p>
       <p>We have successfully verified your recent manual payment. Your subscription is now active.</p>
       <table style="width: 100%; border-collapse: collapse; margin: 24px 0; background: #F5F5F7; border-radius: 8px; overflow: hidden; border: 1px solid #D9D9E0;">
         <tr><td style="padding: 12px 16px; color: #6C6C70; font-size: 14px; border-bottom: 1px solid #D9D9E0;">Transaction ID</td><td style="padding: 12px 16px; font-weight: 600; text-align: right; border-bottom: 1px solid #D9D9E0;">${transactionId}</td></tr>
         <tr><td style="padding: 12px 16px; color: #6C6C70; font-size: 14px; border-bottom: 1px solid #D9D9E0;">Plan/Features</td><td style="padding: 12px 16px; font-weight: 600; text-align: right; border-bottom: 1px solid #D9D9E0;">${planName || "Custom Plan"}</td></tr>
         <tr><td style="padding: 12px 16px; color: #6C6C70; font-size: 14px; border-bottom: 1px solid #D9D9E0;">Amount Paid</td><td style="padding: 12px 16px; font-weight: 600; text-align: right; border-bottom: 1px solid #D9D9E0;">${displayCurrency} ${amount}</td></tr>
         <tr><td style="padding: 12px 16px; color: #6C6C70; font-size: 14px;">Next Billing Date</td><td style="padding: 12px 16px; font-weight: 600; text-align: right;">${new Date(endDate).toLocaleDateString()}</td></tr>
       </table>
       <p style="margin-bottom: 0;">Thank you for your business! You can now log into your dashboard to access your features.</p>`
    )
  };
};

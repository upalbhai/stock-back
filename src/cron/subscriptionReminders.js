import cron from "node-cron";
import { Business } from "../models/Business.js";
import { User } from "../models/User.js";
import mailer from "../utils/mailer.js";
import { logger } from "../utils/logger.js";

// Check subscriptions every day at 00:00 (midnight)
export function initSubscriptionCron() {
  logger.info("Initializing subscription cron jobs");

  cron.schedule("0 0 * * *", async () => {
    logger.info("Running daily subscription check cron job...");
    try {
      const now = new Date();
      
      // Look 3 days ahead for expiration warnings
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(now.getDate() + 3);

      // Find businesses that have trials or subscriptions expiring/expired
      // and haven't had their respective reminders sent yet.
      const businesses = await Business.find({ 
        isActive: true,
        $or: [
          // Trial ends within 3 days and expiring email not sent
          { trialEndsAt: { $lte: threeDaysFromNow, $gt: now }, 'reminders.trialExpiringSentAt': null },
          // Trial expired and expired email not sent
          { trialEndsAt: { $lte: now }, 'reminders.trialExpiredSentAt': null },
          // Subscription expired and grace period started email not sent
          { currentPeriodEnd: { $lte: now }, 'reminders.gracePeriodStartedSentAt': null }
        ]
      })
      .populate("ownerId", "name email")
      .lean();

      if (businesses.length === 0) {
        logger.info("No businesses require subscription reminders today.");
        return;
      }

      logger.info(`Found ${businesses.length} businesses for subscription reminders.`);

      for (const business of businesses) {
        try {
          const owner = business.ownerId; // Populated object
          if (!owner || !owner.email) continue;
          
          const updates = {};
          const currentStatus = business.subscriptionStatus;

          // 1. Trial Expiring Soon (within 3 days)
          if (currentStatus === "trial" && business.trialEndsAt) {
            const trialEnd = new Date(business.trialEndsAt);
            if (trialEnd > now && trialEnd <= threeDaysFromNow && !business.reminders?.trialExpiringSentAt) {
              const diffTime = Math.abs(trialEnd - now);
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              
              await mailer.sendTrialExpiringEmail(owner.email, owner.name, diffDays);
              updates["reminders.trialExpiringSentAt"] = new Date();
              logger.info(`Sent trial expiring reminder to ${owner.email} for business ${business.name}`);
            }
          }

          // 2. Trial Expired
          if (currentStatus === "trial" && business.trialEndsAt) {
            const trialEnd = new Date(business.trialEndsAt);
            if (now > trialEnd && !business.reminders?.trialExpiredSentAt) {
              await mailer.sendTrialExpiredEmail(owner.email, owner.name);
              updates["reminders.trialExpiredSentAt"] = new Date();
              updates.subscriptionStatus = "payment_locked";
              logger.info(`Sent trial expired email to ${owner.email} for business ${business.name}`);
            }
          }

          // 3. Grace Period Started / Subscription Expired Warning
          if (currentStatus === "active" && business.currentPeriodEnd) {
            const periodEnd = new Date(business.currentPeriodEnd);
            if (now > periodEnd && !business.reminders?.gracePeriodStartedSentAt) {
              updates.subscriptionStatus = "payment_locked";
              updates["reminders.gracePeriodStartedSentAt"] = new Date();
            }
          }

          if (Object.keys(updates).length > 0) {
            await Business.findByIdAndUpdate(business._id, { $set: updates });
            if (updates.subscriptionStatus) {
               try {
                 const { getIO } = await import("../config/socket.js");
                 getIO().to(`business:${business._id.toString()}`).emit("subscriptionUpdated");
               } catch (err) {
                 logger.error("Cron socket emit failed", err);
               }
            }
          }
        } catch (bizError) {
          logger.error(`Error processing cron for business ${business._id}:`, bizError);
        }
      }
    } catch (error) {
      logger.error("Error running subscription cron job:", error);
    }
  });
}

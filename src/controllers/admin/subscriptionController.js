import { successResponse } from "../../utils/successResponse.js";
import { errorResponse } from "../../utils/errorResponse.js";
import { Business } from "../../models/Business.js";
import { Plan } from "../../models/Plan.js";
import { Subscription } from "../../models/Subscription.js";
import { AuditLog } from "../../models/AuditLog.js";
import { applyPlanToBusiness } from "../../utils/syncBusinessPlan.js";
import mailer from "../../utils/mailer.js";
import { getIO } from "../../config/socket.js";

async function adminCreateManualSubscription(req, res, next) {
  try {
    const { businessId, planId, billingCycle = "monthly", amount, paymentReference, endDate, notes } = req.body;
    
    if (!businessId || !planId) {
      return errorResponse({
        res,
        statusCode: 400,
        message: "businessId and planId are required"
      });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return errorResponse({
        res,
        statusCode: 404,
        message: "Business not found"
      });
    }

    const plan = await Plan.findById(planId);
    if (!plan) {
      return errorResponse({
        res,
        statusCode: 404,
        message: "Plan not found"
      });
    }

    const startDate = new Date();
    let calculatedEndDate;
    if (endDate) {
      calculatedEndDate = new Date(endDate);
    } else {
      calculatedEndDate = new Date();
      if (billingCycle === "yearly") {
        calculatedEndDate.setFullYear(calculatedEndDate.getFullYear() + 1);
      } else {
        calculatedEndDate.setMonth(calculatedEndDate.getMonth() + 1);
      }
    }

    const finalAmount = amount !== undefined ? Number(amount) : (billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice);

    // Create Subscription record
    const subscription = await Subscription.create({
      businessId,
      planId,
      billingCycle,
      status: "active",
      razorpayPaymentId: paymentReference || `MANUAL_${Date.now()}`,
      razorpayOrderId: "MANUAL_ADMIN_ORDER",
      razorpaySignature: "MANUAL_ADMIN_SIG",
      amount: finalAmount,
      startDate,
      endDate: calculatedEndDate
    });

    await applyPlanToBusiness(businessId, plan, {
      subscriptionStatus: "active",
      currentPeriodStart: startDate,
      currentPeriodEnd: calculatedEndDate
    });

    await AuditLog.create({
      businessId,
      actorId: req.user?.userId,
      module: "admin",
      action: "manual_subscription_create",
      message: `Manually created subscription for ${plan.name} (${billingCycle}). Notes: ${notes || "None"}`,
      ip: req.ip
    });

    // Send confirmation email
    const populatedBiz = await Business.findById(businessId).populate("ownerId", "email name");
    if (populatedBiz?.ownerId?.email) {
      try {
        await mailer.sendSubscriptionConfirmation(populatedBiz.ownerId.email, plan.name, finalAmount, calculatedEndDate);
      } catch (e) {
        console.warn("Failed to send subscription confirmation email:", e.message);
      }
    }

    try {
      getIO().to(`business:${businessId}`).emit("subscriptionUpdated");
    } catch (err) {
      console.warn("Failed to emit subscription socket event", err.message);
    }

    return successResponse({
      res,
      data: {
        subscription,
        business
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function adminCancelSubscription(req, res, next) {
  try {
    const { businessId } = req.body;
    
    if (!businessId) {
      return errorResponse({
        res,
        statusCode: 400,
        message: "businessId is required"
      });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return errorResponse({
        res,
        statusCode: 404,
        message: "Business not found"
      });
    }

    // Update Business Subscription Status
    business.subscriptionStatus = "cancelled";
    await business.save();

    // Cancel latest active subscription
    const latestSub = await Subscription.findOne({ businessId, status: "active" }).sort({ createdAt: -1 });
    if (latestSub) {
      latestSub.status = "cancelled";
      latestSub.cancelledAt = new Date();
      await latestSub.save();
    }

    await AuditLog.create({
      businessId,
      actorId: req.user?.userId,
      module: "admin",
      action: "manual_subscription_cancel",
      message: `Manually cancelled subscription for business: ${business.name}`,
      ip: req.ip
    });

    try {
      getIO().to(`business:${businessId}`).emit("subscriptionUpdated");
    } catch (err) {
      console.warn("Failed to emit subscription socket event", err.message);
    }

    return successResponse({
      res,
      data: {
        business
      }
    });
  } catch (error) {
    return next(error);
  }
}

export {
  adminCreateManualSubscription,
  adminCancelSubscription
};

import { successResponse } from "../../utils/successResponse.js";
import { errorResponse } from "../../utils/errorResponse.js";
import { Business } from "../../models/Business.js";
import { Plan } from "../../models/Plan.js";
import { Subscription } from "../../models/Subscription.js";
import { AuditLog } from "../../models/AuditLog.js";
import { AgentProfile } from "../../models/AgentProfile.js";
import { AgentTransaction } from "../../models/AgentTransaction.js";
import { applyPlanToBusiness } from "../../utils/syncBusinessPlan.js";
import mailer from "../../utils/mailer.js";
import { getSubscriptionConfirmationTemplate } from "../../utils/emailTemplates.js";
import { getIO } from "../../config/socket.js";

async function adminListSubscriptions(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;
    const { status, search } = req.query;

    const query = {};
    if (status && status !== "all") {
      query.status = status;
    }

    if (search) {
      const businesses = await Business.find({ name: { $regex: search, $options: "i" } }).select('_id');
      const businessIds = businesses.map(b => b._id);
      query.businessId = { $in: businessIds };
    }

    const [subscriptions, total] = await Promise.all([
      Subscription.find(query)
        .populate("businessId", "name email status")
        .populate("planId", "name monthlyPrice yearlyPrice")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Subscription.countDocuments(query)
    ]);

    return successResponse({
      res,
      data: {
        subscriptions
      },
      meta: {
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}


async function adminCreateManualSubscription(req, res, next) {
  try {
    const { businessId, planId, billingCycle = "monthly", amount, currency, paymentReference, endDate, notes } = req.body;

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
    const finalCurrency = currency || business.currency || "INR";

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
      currency: finalCurrency,
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

    if (business.agentId) {
      const profile = await AgentProfile.findOne({ userId: business.agentId });
      if (profile) {
        const commission = (finalAmount * (profile.commissionPercentage || 0)) / 100;
        let wallet = profile.wallets.find(w => w.currency === finalCurrency);
        if (!wallet) {
          profile.wallets.push({ currency: finalCurrency, totalSales: 0, pending: 0, paid: 0 });
          wallet = profile.wallets[profile.wallets.length - 1];
        }
        wallet.pending += commission;
        wallet.totalSales += finalAmount;
        profile.totalSales += finalAmount;
        await profile.save();
        
        await AgentTransaction.create({
          agentId: business.agentId,
          type: "commission",
          amount: commission,
          currency: finalCurrency,
          referenceId: subscription._id.toString(),
          description: `Commission earned from manual subscription ${plan.name} (${billingCycle}) for business ${business.name}`
        });
      }
    }

    // Removed automatic email sending so admin can view and send manually

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

async function adminPreviewSubscriptionEmail(req, res, next) {
  try {
    const { id: businessId } = req.params;
    const subscription = await Subscription.findOne({ businessId, status: "active" }).sort({ createdAt: -1 }).populate("planId");
    if (!subscription) {
      return errorResponse({ res, statusCode: 404, message: "Active subscription not found for this business" });
    }
    const { html } = getSubscriptionConfirmationTemplate(
      subscription.planId.name,
      subscription.amount,
      subscription.currency,
      subscription.endDate
    );
    return successResponse({ res, data: { html, subscriptionId: subscription._id } });
  } catch (error) {
    return next(error);
  }
}

async function adminSendSubscriptionEmail(req, res, next) {
  try {
    const { id: businessId } = req.params;
    const subscription = await Subscription.findOne({ businessId, status: "active" }).sort({ createdAt: -1 }).populate("planId");
    if (!subscription) {
      return errorResponse({ res, statusCode: 404, message: "Active subscription not found for this business" });
    }
    const business = await Business.findById(subscription.businessId).populate("ownerId");
    if (!business || !business.ownerId?.email) {
      return errorResponse({ res, statusCode: 400, message: "Business owner email not found" });
    }
    await mailer.sendSubscriptionConfirmation(
      business.ownerId.email,
      subscription.planId.name,
      subscription.amount,
      subscription.currency,
      subscription.endDate
    );
    return successResponse({ res, data: { message: "Email sent successfully" } });
  } catch (error) {
    return next(error);
  }
}

export {
  adminListSubscriptions,
  adminCreateManualSubscription,
  adminCancelSubscription,
  adminPreviewSubscriptionEmail,
  adminSendSubscriptionEmail
};

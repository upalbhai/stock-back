import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import { env } from "../config/env.js";
import { Plan } from "../models/Plan.js";
import { Business } from "../models/Business.js";
import { Subscription } from "../models/Subscription.js";
import { AuditLog } from "../models/AuditLog.js";
import { applyPlanToBusiness } from "../utils/syncBusinessPlan.js";
import mailer from "../utils/mailer.js";
import { ManualPayment } from "../models/ManualPayment.js";
import { resolveUtr } from "../utils/manualPaymentProof.js";
import { getRazorpayConfig } from "../services/configService.js";

async function getRazorpayClient() {
  const config = await getRazorpayConfig();
  if (!config.keyId || !config.keySecret) {
    throw new Error("Razorpay keys not configured in database settings");
  }
  return {
    rzp: new Razorpay({
      key_id: config.keyId,
      key_secret: config.keySecret
    }),
    keyId: config.keyId,
    keySecret: config.keySecret,
    webhookSecret: config.webhookSecret
  };
}

// 1. Create Order
async function createOrder(req, res, next) {
  try {
    const { planId, billingCycle = "monthly", isCustomPlan } = req.body;
    const businessId = req.user?.businessId;
    
    if (!businessId) return errorResponse({
      res: res,
      statusCode: 403,
      message: "Business not found"
    });
    
    let amount = 0;
    let currency = "INR";
    
    if (isCustomPlan) {
      const business = await Business.findById(businessId);
      if (!business || !business.customPlanDetails) {
        return errorResponse({
          res: res,
          statusCode: 400,
          message: "Custom plan details not found for this business"
        });
      }
      amount = business.customPlanDetails.price || 0;
      currency = business.customPlanDetails.currency || "INR";
    } else {
      const plan = await Plan.findById(planId);
      if (!plan || !plan.isActive) {
        return errorResponse({
          res: res,
          statusCode: 404,
          message: "Plan not found or inactive"
        });
      }
      
      amount = billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
    }

    if (amount <= 0) {
      return errorResponse({
        res: res,
        statusCode: 400,
        message: "Cannot create an order for a free plan"
      });
    }

    const { rzp, keyId } = await getRazorpayClient();
    
    const options = {
      amount: amount * 100, // amount in the smallest currency unit (paise for INR)
      currency: currency,
      receipt: `receipt_${businessId}_${Date.now()}`
    };
    
    const order = await rzp.orders.create(options);
    
    return successResponse({
      res: res,

      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId
      }
    });
  } catch (error) {
    return next(error);
  }
}

// 2. Verify Payment
async function verifyPayment(req, res, next) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId, billingCycle = "monthly", isCustomPlan } = req.body;
    const businessId = req.user?.businessId;
    
    if (!businessId) return errorResponse({
      res: res,
      statusCode: 403,
      message: "Business not found"
    });

    const { keySecret } = await getRazorpayClient();
    const generated_signature = crypto
      .createHmac("sha256", keySecret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return errorResponse({
        res: res,
        statusCode: 400,
        message: "Payment verification failed"
      });
    }

    let amount = 0;
    let planName = "Custom Plan";
    let planDoc = null;
    let currency = "INR";
    const business = await Business.findById(businessId).populate("ownerId", "email name");
    
    if (isCustomPlan) {
      if (!business || !business.customPlanDetails) {
        return errorResponse({
          res: res,
          statusCode: 400,
          message: "Custom plan details not found for this business"
        });
      }
      amount = business.customPlanDetails.price || 0;
      currency = business.customPlanDetails.currency || "INR";
      planName = `Custom ${business.planType || 'Plan'}`;
    } else {
      planDoc = await Plan.findById(planId);
      if (!planDoc) return errorResponse({
        res: res,
        statusCode: 404,
        message: "Plan not found"
      });
      amount = billingCycle === "yearly" ? planDoc.yearlyPrice : planDoc.monthlyPrice;
      planName = planDoc.name;
    }
    
    const startDate = new Date();
    const endDate = new Date();
    if (billingCycle === "yearly") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }
    
    // Create Subscription record
    const subscription = await Subscription.create({
      businessId,
      planId: planDoc ? planDoc._id : business._id, // fallback for custom plans
      billingCycle,
      status: "active",
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      razorpaySignature: razorpay_signature,
      amount,
      currency,
      startDate,
      endDate
    });
    
    // Update Business
    if (planDoc) {
      await applyPlanToBusiness(businessId, planDoc, {
        subscriptionStatus: "active",
        currentPeriodStart: startDate,
        currentPeriodEnd: endDate
      });
    } else {
      business.subscriptionStatus = "active";
      business.currentPeriodStart = startDate;
      business.currentPeriodEnd = endDate;
      await business.save();
    }

    // Calculate agent commission if business was referred by an agent
    if (business.agentId) {
      try {
        const { AgentProfile } = await import("../models/AgentProfile.js");
        const { AgentTransaction } = await import("../models/AgentTransaction.js");
        const profile = await AgentProfile.findOne({ userId: business.agentId });
        if (profile && (profile.commissionPercentage || 0) > 0) {
          const commission = (amount * profile.commissionPercentage) / 100;
          let wallet = profile.wallets.find((w) => w.currency === currency);
          if (!wallet) {
            profile.wallets.push({ currency, totalSales: 0, pending: 0, paid: 0 });
            wallet = profile.wallets[profile.wallets.length - 1];
          }
          wallet.pending += commission;
          wallet.totalSales += amount;
          profile.totalSales += amount;
          await profile.save();

          await AgentTransaction.create({
            agentId: business.agentId,
            businessId: business._id,
            type: "commission",
            amount: commission,
            currency,
            referenceId: subscription._id.toString(),
            description: `Commission earned (${profile.commissionPercentage}%) from online subscription ${planName} (${billingCycle}) for business ${business.name}`
          });
        }
      } catch (agentErr) {
        console.warn("Failed to credit agent commission:", agentErr.message);
      }
    }

    try {
      const { getIO } = await import("../config/socket.js");
      getIO().to(`business:${businessId.toString()}`).emit("subscriptionUpdated");
    } catch (err) {
      // socket non-blocking
    }
    
    await AuditLog.create({
      businessId,
      actorId: req.user?.userId,
      module: "billing",
      action: "subscription_payment",
      message: `Purchased ${planName} (${billingCycle})`,
      ip: req.ip
    });
    
    // Send confirmation email
    if (business.ownerId?.email) {
      try {
        await mailer.sendSubscriptionConfirmation(business.ownerId.email, planName, amount, currency, endDate);
      } catch (e) {
        console.warn("Failed to send subscription confirmation email", e.message);
      }
    }
    
    return successResponse({
      res: res,

      data: {
        subscriptionStatus: "active",
        currentPeriodEnd: endDate
      }
    });
  } catch (error) {
    return next(error);
  }
}

// 3. Webhook handler (Optional - useful if doing actual recurring subscriptions via Razorpay Subscriptions API)
async function webhookHandler(req, res, next) {
  try {
    const { keySecret, webhookSecret } = await getRazorpayClient();
    const secret = webhookSecret || keySecret;
    const signature = req.headers["x-razorpay-signature"];
    
    // Validate webhook
    const expectedSignature = crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");
    if (expectedSignature !== signature) {
      return res.status(400).send("Invalid signature");
    }
    
    const event = req.body.event;
    
    // We can handle events like subscription.charged, payment.failed here in the future
    console.log("Razorpay Webhook Event:", event);
    
    return res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).send("Internal Error");
  }
}

// 4. Get Subscription Status
async function getSubscriptionStatus(req, res, next) {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return errorResponse({
      res: res,
      statusCode: 403,
      message: "Business not found"
    });
    
    const business = await Business.findById(businessId)
      .select("subscriptionStatus trialEndsAt currentPeriodEnd planId maxOutlets maxStaff maxProducts customPlanDetails pendingCustomPlan agentId currency country isInternational")
      .populate("planId")
      .populate("agentId", "name email phone")
      .lean();
    if (!business) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Business not found"
    });
    
    const [pendingManualPayment, lastRejectedManualPayment] = await Promise.all([
      ManualPayment.findOne({ businessId, status: "pending_verification" }).sort({ createdAt: -1 }).lean(),
      ManualPayment.findOne({ businessId, status: "rejected" }).sort({ createdAt: -1 }).lean()
    ]);

    return successResponse({
      res: res,

      data: {
        subscriptionStatus: business.subscriptionStatus,
        trialEndsAt: business.trialEndsAt,
        currentPeriodEnd: business.currentPeriodEnd,
        currency: business.currency || "INR",
        country: business.country || "IN",
        isInternational: Boolean(business.isInternational),
        plan: business.planId,
        agent: business.agentId ? {
          _id: business.agentId._id,
          name: business.agentId.name,
          email: business.agentId.email,
          phone: business.agentId.phone
        } : null,
        maxOutlets: business.maxOutlets,
        maxStaff: business.maxStaff,
        maxProducts: business.maxProducts,
        customPlanDetails: business.customPlanDetails,
        pendingCustomPlan: business.pendingCustomPlan,
        pendingManualPayment: pendingManualPayment
          ? {
              id: pendingManualPayment._id,
              utr: resolveUtr(pendingManualPayment),
              amount: pendingManualPayment.amount,
              currency: pendingManualPayment.currency,
              createdAt: pendingManualPayment.createdAt,
              status: pendingManualPayment.status
            }
          : null,
        lastRejectedManualPayment: lastRejectedManualPayment && !pendingManualPayment
          ? {
              id: lastRejectedManualPayment._id,
              utr: resolveUtr(lastRejectedManualPayment),
              amount: lastRejectedManualPayment.amount,
              currency: lastRejectedManualPayment.currency,
              rejectionReason: lastRejectedManualPayment.rejectionReason,
              createdAt: lastRejectedManualPayment.createdAt
            }
          : null
      }
    });
  } catch (error) {
    return next(error);
  }
}

// 6. Get Payment History
async function getPaymentHistory(req, res, next) {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) {
      return errorResponse({ res, statusCode: 403, message: "Business not found" });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const [subscriptions, manualPayments] = await Promise.all([
      Subscription.find({ businessId }).populate("planId", "name").lean(),
      ManualPayment.find({ businessId }).lean()
    ]);

    const history = [
      ...subscriptions.map((sub) => ({
        id: sub._id.toString(),
        type: "subscription",
        amount: sub.amount,
        currency: sub.currency || "INR",
        status: sub.status,
        date: sub.createdAt,
        reference: sub.razorpayPaymentId || sub.razorpayOrderId,
        description: sub.planId ? sub.planId.name : "Custom Plan",
        periodStart: sub.startDate,
        periodEnd: sub.endDate
      })),
      ...manualPayments.map((mp) => ({
        id: mp._id.toString(),
        type: "manual",
        amount: mp.amount,
        currency: mp.currency || "INR",
        status: mp.status,
        date: mp.createdAt,
        reference: resolveUtr(mp) || mp.screenshotUrl,
        description: "Manual Bank Transfer",
        rejectionReason: mp.rejectionReason
      }))
    ];

    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    const total = history.length;
    const paginatedHistory = history.slice(skip, skip + limit);

    return successResponse({
      res,
      data: { history: paginatedHistory },
      meta: {
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit))
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

export {
  createOrder,
  verifyPayment,
  webhookHandler,
  getSubscriptionStatus,
  requestGracePeriod,
  getPaymentHistory
};

// 5. Request Grace Period
async function requestGracePeriod(req, res, next) {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) {
      return errorResponse({ res, statusCode: 403, message: "Business not found" });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return errorResponse({ res, statusCode: 404, message: "Business not found" });
    }

    if (business.subscriptionStatus !== "payment_locked") {
      return errorResponse({ res, statusCode: 400, message: "Grace period can only be requested from locked status" });
    }

    const { notes, requestedDays } = req.body || {};
    const days = Math.min(Math.max(Number(requestedDays) || 3, 1), 7);

    const gracePeriodEndsAt = new Date();
    gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + days);

    business.subscriptionStatus = "grace_period";
    business.gracePeriodEndsAt = gracePeriodEndsAt;
    business.unlockRequest = {
      requestedAt: new Date(),
      notes: notes || "Requested grace extension to submit payment",
      requestedDays: days,
      status: "approved",
      decidedAt: new Date(),
      decisionNotes: "Self-serve grace period granted"
    };
    await business.save();

    await AuditLog.create({
      businessId,
      actorId: req.user?.userId,
      module: "billing",
      action: "grace_period_requested",
      message: `Requested ${days}-day grace period until ${gracePeriodEndsAt.toLocaleDateString()}${notes ? `. Notes: ${notes}` : ""}`,
      ip: req.ip
    });

    // Notify Superadmins
    try {
      const { Notification } = await import("../models/Notification.js");
      const { User } = await import("../models/User.js");
      const superadmins = await User.find({ role: "superadmin" }).select("_id").lean();
      if (superadmins.length > 0) {
        const notifs = superadmins.map(sa => ({
          businessId: business._id,
          recipientId: sa._id,
          type: "system",
          title: "Account Grace Extension Activated",
          body: `${business.name} activated a ${days}-day grace period until ${gracePeriodEndsAt.toLocaleDateString()}.${notes ? ` Note: ${notes}` : ""}`,
          link: `/dashboard/admin/businesses?search=${encodeURIComponent(business.name)}`,
          metadata: { businessId: business._id, action: "grace_period_activated" }
        }));
        await Notification.insertMany(notifs);
      }
    } catch (notifErr) {
      console.error("Failed to create admin notification:", notifErr);
    }

    // Socket emit to admin and business
    try {
      const { getIO } = await import("../config/socket.js");
      getIO().to("superadmin").emit("adminNotification", {
        type: "grace_period_activated",
        businessId: business._id,
        businessName: business.name,
        message: `${business.name} activated a ${days}-day grace period.`
      });
      getIO().to(`business:${business._id.toString()}`).emit("subscriptionUpdated");
    } catch (e) {
      // socket silent
    }

    return successResponse({
      res,
      message: `Grace period activated successfully for ${days} days`,
      data: {
        subscriptionStatus: "grace_period",
        gracePeriodEndsAt
      }
    });
  } catch (error) {
    return next(error);
  }
}

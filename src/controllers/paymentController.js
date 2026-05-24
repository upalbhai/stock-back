import Razorpay from "Razorpay";
import crypto from "crypto";
import { env } from "../config/env.js";
import { Plan } from "../models/Plan.js";
import { Business } from "../models/Business.js";
import { Subscription } from "../models/Subscription.js";
import { AuditLog } from "../models/AuditLog.js";
import mailer from "../utils/mailer.js";

function getRazorpayInstance() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay keys not configured");
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

// 1. Create Order
async function createOrder(req, res, next) {
  try {
    const { planId, billingCycle = "monthly" } = req.body;
    const businessId = req.user?.businessId;
    
    if (!businessId) return res.status(403).json({ message: "Business not found" });
    
    const plan = await Plan.findById(planId);
    if (!plan || !plan.isActive) {
      return res.status(404).json({ message: "Plan not found or inactive" });
    }
    
    const amount = billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
    if (amount <= 0) {
      return res.status(400).json({ message: "Cannot create an order for a free plan" });
    }

    const rzp = getRazorpayInstance();
    
    const options = {
      amount: amount * 100, // amount in the smallest currency unit (paise for INR)
      currency: "INR",
      receipt: `receipt_${businessId}_${Date.now()}`
    };
    
    const order = await rzp.orders.create(options);
    
    return res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    return next(error);
  }
}

// 2. Verify Payment
async function verifyPayment(req, res, next) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId, billingCycle = "monthly" } = req.body;
    const businessId = req.user?.businessId;
    
    if (!businessId) return res.status(403).json({ message: "Business not found" });

    const secret = process.env.RAZORPAY_KEY_SECRET;
    const generated_signature = crypto
      .createHmac("sha256", secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ message: "Payment verification failed" });
    }

    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    
    const amount = billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
    
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
      planId,
      billingCycle,
      status: "active",
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      razorpaySignature: razorpay_signature,
      amount,
      startDate,
      endDate
    });
    
    // Update Business
    const business = await Business.findByIdAndUpdate(businessId, {
      subscriptionStatus: "active",
      planId,
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
      maxOutlets: plan.maxOutlets,
      maxStaff: plan.maxStaff,
      maxProducts: plan.maxProducts
    }, { new: true }).populate("ownerId", "email name");
    
    await AuditLog.create({
      businessId,
      actorId: req.user?.userId,
      module: "billing",
      action: "subscription_payment",
      message: `Purchased ${plan.name} (${billingCycle})`,
      ip: req.ip
    });
    
    // Send confirmation email
    if (business.ownerId?.email) {
      try {
        await mailer.sendSubscriptionConfirmation(business.ownerId.email, plan.name, amount, endDate);
      } catch (e) {
        console.warn("Failed to send subscription confirmation email", e.message);
      }
    }
    
    return res.json({ success: true, subscriptionStatus: "active", currentPeriodEnd: endDate });
  } catch (error) {
    return next(error);
  }
}

// 3. Webhook handler (Optional - useful if doing actual recurring subscriptions via Razorpay Subscriptions API)
async function webhookHandler(req, res, next) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
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
    if (!businessId) return res.status(403).json({ message: "Business not found" });
    
    const business = await Business.findById(businessId).select("subscriptionStatus trialEndsAt currentPeriodEnd planId maxOutlets maxStaff maxProducts").populate("planId").lean();
    if (!business) return res.status(404).json({ message: "Business not found" });
    
    return res.json({
      subscriptionStatus: business.subscriptionStatus,
      trialEndsAt: business.trialEndsAt,
      currentPeriodEnd: business.currentPeriodEnd,
      plan: business.planId,
      maxOutlets: business.maxOutlets,
      maxStaff: business.maxStaff,
      maxProducts: business.maxProducts
    });
  } catch (error) {
    return next(error);
  }
}

export {
  createOrder,
  verifyPayment,
  webhookHandler,
  getSubscriptionStatus
};

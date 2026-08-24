import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Business } from "../models/Business.js";
import { ManualPayment } from "../models/ManualPayment.js";
import { AgentProfile } from "../models/AgentProfile.js";
import { AuditLog } from "../models/AuditLog.js";
import { Subscription } from "../models/Subscription.js";
import { AgentTransaction } from "../models/AgentTransaction.js";
import { withTransaction } from "../utils/transaction.js";
import mailer from "../utils/mailer.js";
import { emitToBusiness } from "../utils/socketEmitter.js";
import { notify } from "../utils/notificationService.js";
import {
  normalizeUtr,
  resolveUtr,
  hasScreenshotFile,
  addBillingPeriod,
  saveManualPaymentScreenshot,
  screenshotAbsolutePath
} from "../utils/manualPaymentProof.js";
import fs from "fs/promises";

function publicBankDetails(settings) {
  const bank = settings?.bankDetails || {};
  return {
    accountName: bank.accountName || "",
    accountNumber: bank.accountNumber || "",
    ifsc: bank.ifsc || "",
    bankName: bank.bankName || "",
    branch: bank.branch || "",
    upiId: bank.upiId || "",
    notes: bank.notes || ""
  };
}

export async function getBankDetails(req, res, next) {
  try {
    const { SystemSetting } = await import("../models/SystemSetting.js");
    const settings = await SystemSetting.findOne().lean();
    return successResponse({ res, data: { bankDetails: publicBankDetails(settings) } });
  } catch (error) {
    next(error);
  }
}

// Owner: Submit UTR + optional screenshot for bank transfer
export async function uploadManualPayment(req, res, next) {
  try {
    const { utr, screenshotBase64, notes } = req.body;
    const businessId = req.user?.businessId;

    if (!businessId) {
      return errorResponse({ res, statusCode: 403, message: "Business not found" });
    }

    const normalizedUtr = normalizeUtr(utr);
    if (!normalizedUtr || normalizedUtr.length < 6) {
      return errorResponse({ res, statusCode: 400, message: "Enter a valid UTR / UPI reference (at least 6 characters)" });
    }

    const business = await Business.findById(businessId).lean();
    if (!business) {
      return errorResponse({ res, statusCode: 404, message: "Business not found" });
    }
    if (!business.customPlanDetails) {
      return errorResponse({ res, statusCode: 400, message: "No custom plan is assigned yet. Wait for admin to quote your plan." });
    }

    const quotedAmount = Number(business.customPlanDetails.price || 0);
    if (quotedAmount <= 0) {
      return errorResponse({ res, statusCode: 400, message: "Custom plan price is not set. Contact support." });
    }

    const pending = await ManualPayment.findOne({
      businessId,
      status: "pending_verification"
    }).lean();
    if (pending) {
      return errorResponse({
        res,
        statusCode: 409,
        message: "You already have a bank transfer waiting for verification. Please wait or contact support."
      });
    }

    const duplicateUtr = await ManualPayment.findOne({
      utr: normalizedUtr,
      status: { $in: ["pending_verification", "verified"] }
    }).lean();
    if (duplicateUtr) {
      return errorResponse({ res, statusCode: 409, message: "This UTR / reference is already submitted." });
    }

    let screenshotPath = null;
    let screenshotMime = null;
    if (screenshotBase64) {
      const saved = await saveManualPaymentScreenshot(businessId, screenshotBase64);
      screenshotPath = saved.screenshotPath;
      screenshotMime = saved.mimeType;
    }

    const billingCycle = business.customPlanDetails.billingCycle === "yearly" ? "yearly" : "monthly";
    const currency = business.customPlanDetails.currency || "INR";

    const manualPayment = await ManualPayment.create({
      businessId,
      agentId: business.agentId,
      amount: quotedAmount,
      currency,
      utr: normalizedUtr,
      screenshotUrl: screenshotPath ? `FILE:${screenshotPath}` : `UTR:${normalizedUtr}`,
      screenshotPath,
      screenshotMime,
      billingCycle,
      notes: notes ? String(notes).slice(0, 500) : undefined,
      status: "pending_verification"
    });

    return successResponse({
      res,
      statusCode: 201,
      message: "Payment submitted. We will verify it and activate your plan, usually within 24 hours.",
      data: { paymentId: manualPayment._id }
    });
  } catch (error) {
    if (error.status === 400) {
      return errorResponse({ res, statusCode: 400, message: error.message });
    }
    next(error);
  }
}

// Admin: Get manual payments
export async function getManualPayments(req, res, next) {
  try {
    const { status, page = 1, limit = 10, search } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    // We can't easily search populated fields natively in basic mongoose without aggregation,
    // so if they need search by business name, we could do a pre-query or aggregation.
    // For now, basic pagination.

    const [docs, total] = await Promise.all([
      ManualPayment.find(filter)
        .populate("businessId", "name email phone")
        .populate("agentId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      ManualPayment.countDocuments(filter)
    ]);

    const payments = docs.map((p) => ({
      ...p,
      utr: resolveUtr(p),
      hasScreenshot: hasScreenshotFile(p) || Boolean(p.screenshotPath)
    }));

    return successResponse({
      res,
      data: { payments },
      meta: {
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

// Admin: Verify manual payment
export async function verifyManualPayment(req, res, next) {
  try {
    return await withTransaction(async (session) => {
      const { paymentId } = req.params;

      const payment = await ManualPayment.findById(paymentId).session(session);
      if (!payment) return errorResponse({ res, statusCode: 404, message: "Payment not found" });

      if (payment.status !== "pending_verification") {
        return errorResponse({ res, statusCode: 400, message: "Payment is already processed" });
      }

      payment.status = "verified";
      payment.verifiedBy = req.user.userId;

      const business = await Business.findById(payment.businessId).populate("ownerId").session(session);
      if (business) {
        business.subscriptionStatus = "active";
        const cycle = payment.billingCycle || business.customPlanDetails?.billingCycle || "monthly";
        const baseDate = business.currentPeriodEnd && business.currentPeriodEnd > new Date()
          ? business.currentPeriodEnd
          : new Date();
        const endDate = addBillingPeriod(baseDate, cycle);
        business.currentPeriodEnd = endDate;
        business.currentPeriodStart = new Date();
        await business.save({ session });

        await Subscription.create([{
          businessId: business._id,
          planId: business.planId || business._id, // fallback if planId is missing
          billingCycle: cycle,
          status: "active",
          razorpayPaymentId: payment._id.toString(),
          razorpayOrderId: "MANUAL_PAYMENT",
          razorpaySignature: "MANUAL_PAYMENT",
          amount: payment.amount,
          currency: payment.currency,
          startDate: business.currentPeriodStart,
          endDate: business.currentPeriodEnd
        }], { session });
      }

      // Calculate agent commission
      if (payment.agentId) {
        const profile = await AgentProfile.findOne({ userId: payment.agentId }).session(session);
        if (profile) {
          const commission = (payment.amount * (profile.commissionPercentage || 0)) / 100;

          payment.commissionCalculated = true;
          payment.commissionAmount = commission;

          // Update wallets
          let wallet = profile.wallets.find(w => w.currency === payment.currency);
          if (!wallet) {
            profile.wallets.push({ currency: payment.currency, totalSales: 0, pending: 0, paid: 0 });
            wallet = profile.wallets[profile.wallets.length - 1];
          }
          wallet.pending += commission;
          wallet.totalSales += payment.amount;
          // Keep profile.totalSales updated for backward compatibility just in case
          profile.totalSales += payment.amount;

          await profile.save({ session });
          
          await AgentTransaction.create([{
            agentId: payment.agentId,
            type: "commission",
            amount: commission,
            currency: payment.currency,
            referenceId: payment._id.toString(),
            description: `Commission earned from manual payment verification for business ${business?.name || payment.businessId}`
          }], { session });
        }
      }

      await payment.save({ session });

      await AuditLog.create([{
        businessId: payment.businessId,
        actorId: req.user.userId,
        module: "billing",
        action: "manual_payment_verified",
        message: `Verified manual payment of ${payment.amount} ${payment.currency}`,
        ip: req.ip
      }], { session });

      // Send invoice email outside transaction (if it fails, we still want the tx to commit)
      if (business?.ownerId?.email) {
        // Fire and forget
        mailer.sendManualPaymentInvoice(
          business.ownerId.email,
          business.name,
          payment.amount,
          payment.currency,
          resolveUtr(payment) || payment._id.toString(),
          "Custom Plan",
          business.currentPeriodEnd
        ).catch(err => console.error("Failed to send invoice:", err.message));
      }

      const ownerId = business?.ownerId?._id || business?.ownerId;
      emitToBusiness(payment.businessId.toString(), "subscriptionUpdated", {
        subscriptionStatus: "active",
        currentPeriodEnd: business?.currentPeriodEnd
      });
      if (ownerId) {
        notify({
          businessId: payment.businessId,
          recipientId: ownerId,
          type: "system",
          title: "Payment verified",
          body: "Your bank transfer was verified and your subscription is now active.",
          link: "/dashboard/subscribe"
        });
      }

      return successResponse({ res, message: "Payment verified successfully" });
    });
  } catch (error) {
    next(error);
  }
}

// Admin: Resend manual payment invoice
export async function resendManualPaymentInvoice(req, res, next) {
  try {
    const { paymentId } = req.params;
    
    const payment = await ManualPayment.findById(paymentId);
    if (!payment) return errorResponse({ res, statusCode: 404, message: "Payment not found" });

    if (payment.status !== "verified") {
       return errorResponse({ res, statusCode: 400, message: "Only verified payments can have invoices resent" });
    }

    const business = await Business.findById(payment.businessId).populate("ownerId");
    if (!business || !business.ownerId?.email) {
      return errorResponse({ res, statusCode: 400, message: "Business or owner email not found" });
    }

    // Await it so we can give immediate feedback if it fails
    await mailer.sendManualPaymentInvoice(
      business.ownerId.email,
      business.name,
      payment.amount,
      payment.currency,
      resolveUtr(payment) || payment._id.toString(),
      "Custom Plan",
      business.currentPeriodEnd
    );

    return successResponse({ res, message: "Invoice resent successfully" });
  } catch (error) {
    next(error);
  }
}

// Admin: Reject manual payment
export async function rejectManualPayment(req, res, next) {
  try {
    const { paymentId } = req.params;
    const { rejectionReason, notes } = req.body;
    
    if (!rejectionReason) {
      return errorResponse({ res, statusCode: 400, message: "Rejection reason is required" });
    }

    const payment = await ManualPayment.findById(paymentId);
    if (!payment) return errorResponse({ res, statusCode: 404, message: "Payment not found" });

    if (payment.status !== "pending_verification") {
       return errorResponse({ res, statusCode: 400, message: "Only pending payments can be rejected" });
    }

    payment.status = "rejected";
    payment.rejectionReason = rejectionReason;
    if (notes) payment.notes = notes;
    payment.verifiedBy = req.user.userId;

    await payment.save();

    await AuditLog.create({
      businessId: payment.businessId,
      actorId: req.user.userId,
      module: "billing",
      action: "manual_payment_rejected",
      message: `Rejected manual payment of ${payment.amount} ${payment.currency}. Reason: ${rejectionReason}`,
      ip: req.ip
    });

    const business = await Business.findById(payment.businessId).populate("ownerId", "email name");
    const ownerId = business?.ownerId?._id || business?.ownerId;
    if (business?.ownerId?.email) {
      mailer.sendManualPaymentRejected(
        business.ownerId.email,
        business.name,
        payment.amount,
        payment.currency,
        resolveUtr(payment),
        rejectionReason
      ).catch((err) => console.error("Failed to send rejection email:", err.message));
    }
    emitToBusiness(payment.businessId.toString(), "subscriptionUpdated", { manualPaymentStatus: "rejected" });
    if (ownerId) {
      notify({
        businessId: payment.businessId,
        recipientId: ownerId,
        type: "system",
        title: "Bank transfer rejected",
        body: rejectionReason,
        link: "/dashboard/subscribe"
      });
    }

    return successResponse({ res, message: "Payment rejected successfully", data: payment });
  } catch (error) {
    next(error);
  }
}

export async function getManualPaymentProof(req, res, next) {
  try {
    const payment = await ManualPayment.findById(req.params.paymentId).lean();
    if (!payment) return errorResponse({ res, statusCode: 404, message: "Payment not found" });
    if (!payment.screenshotPath) {
      return errorResponse({ res, statusCode: 404, message: "No screenshot uploaded for this payment" });
    }
    const abs = screenshotAbsolutePath(payment.screenshotPath);
    try {
      await fs.access(abs);
    } catch {
      return errorResponse({ res, statusCode: 404, message: "Screenshot file is missing" });
    }
    res.setHeader("Content-Type", payment.screenshotMime || "image/jpeg");
    res.setHeader("Content-Disposition", "inline");
    return res.sendFile(abs);
  } catch (error) {
    next(error);
  }
}

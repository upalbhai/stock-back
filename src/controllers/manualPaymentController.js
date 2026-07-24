import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Business } from "../models/Business.js";
import { ManualPayment } from "../models/ManualPayment.js";
import { AgentProfile } from "../models/AgentProfile.js";
import { AuditLog } from "../models/AuditLog.js";
import { withTransaction } from "../utils/transaction.js";
import mailer from "../utils/mailer.js";

// Owner: Upload a screenshot for manual payment
export async function uploadManualPayment(req, res, next) {
  try {
    const { amount, currency, screenshotUrl } = req.body;
    const businessId = req.user?.businessId;

    if (!businessId) {
      return errorResponse({ res, statusCode: 403, message: "Business not found" });
    }

    const business = await Business.findById(businessId).lean();
    if (!business) {
      return errorResponse({ res, statusCode: 404, message: "Business not found" });
    }

    const manualPayment = await ManualPayment.create({
      businessId,
      agentId: business.agentId,
      amount,
      currency: currency || business.customPlanDetails?.currency || "INR",
      screenshotUrl,
      status: "pending_verification"
    });

    return successResponse({ res, statusCode: 201, message: "Payment screenshot uploaded for verification", data: { paymentId: manualPayment._id } });
  } catch (error) {
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

    const [payments, total] = await Promise.all([
      ManualPayment.find(filter)
        .populate("businessId", "name email phone")
        .populate("agentId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      ManualPayment.countDocuments(filter)
    ]);

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
        // Typical manual plan might give 1 month or 1 year. We'll add 1 month for now.
        const endDate = new Date(business.currentPeriodEnd && business.currentPeriodEnd > new Date() ? business.currentPeriodEnd : new Date());
        endDate.setMonth(endDate.getMonth() + 1);
        business.currentPeriodEnd = endDate;
        business.currentPeriodStart = new Date();
        await business.save({ session });
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
            profile.wallets.push({ currency: payment.currency, pending: 0, paid: 0 });
            wallet = profile.wallets[profile.wallets.length - 1];
          }
          wallet.pending += commission;
          profile.totalSales += payment.amount;

          await profile.save({ session });
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
          payment.screenshotUrl || "N/A",
          "Custom Plan",
          business.currentPeriodEnd
        ).catch(err => console.error("Failed to send invoice:", err.message));
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
      payment.screenshotUrl || "N/A",
      "Custom Plan",
      business.currentPeriodEnd
    );

    return successResponse({ res, message: "Invoice resent successfully" });
  } catch (error) {
    next(error);
  }
}

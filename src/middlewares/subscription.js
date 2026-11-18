import { Business } from "../models/Business.js";

async function requireActiveSubscription(req, res, next) {
  try {
    const userId = req.user?.userId;
    const role = req.user?.role;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (role === "superadmin" || role === "agent") {
      return next();
    }

    // Always allow plan requests and business profile retrieval even when subscription is locked
    if (
      req.originalUrl?.includes("/businesses/mine") ||
      req.originalUrl?.includes("/request-plan") ||
      req.path?.includes("/request-plan")
    ) {
      return next();
    }

    const businessId = req.user?.businessId;
    if (!businessId) {
      return res.status(403).json({ message: "No business association found" });
    }

    const business = await Business.findById(businessId).select("subscriptionStatus trialEndsAt currentPeriodEnd gracePeriodEndsAt").lean();
    if (!business) {
      return res.status(403).json({ message: "Business not found" });
    }

    const now = new Date();
    let isLocked = false;
    let newStatus = null;
    let currentStatus = business.subscriptionStatus;

    if (currentStatus === "trial") {
      if (business.trialEndsAt && now > new Date(business.trialEndsAt)) {
        newStatus = "payment_locked";
        currentStatus = "payment_locked";
      }
    } else if (currentStatus === "active") {
      if (business.currentPeriodEnd && now > new Date(business.currentPeriodEnd)) {
        newStatus = "payment_locked";
        currentStatus = "payment_locked";
      }
    }
    
    if (currentStatus === "grace_period") {
      if (business.gracePeriodEndsAt && now > new Date(business.gracePeriodEndsAt)) {
        newStatus = "payment_locked";
        currentStatus = "payment_locked";
      }
    }

    if (currentStatus === "payment_locked" || currentStatus === "expired" || currentStatus === "cancelled") {
      isLocked = true;
    }

    if (newStatus) {
      await Business.findByIdAndUpdate(businessId, { subscriptionStatus: newStatus });
      try {
        const { getIO } = await import("../config/socket.js");
        getIO().to(`business:${businessId}`).emit("subscriptionUpdated");
      } catch (err) {
        console.error("Socket emit failed on subscription status update", err);
      }
    }

    if (isLocked) {
      return res.status(403).json({ message: "Account locked pending payment", paymentLocked: true, status: currentStatus });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

export { requireActiveSubscription };

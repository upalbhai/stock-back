import { Business } from "../models/Business.js";

async function requireActiveSubscription(req, res, next) {
  try {
    const userId = req.user?.userId;
    const role = req.user?.role;
    
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    if (role === "superadmin") {
      return next();
    }
    
    const businessId = req.user?.businessId;
    if (!businessId) {
      return res.status(403).json({ message: "No business association found" });
    }
    
    const business = await Business.findById(businessId).select("subscriptionStatus trialEndsAt currentPeriodEnd").lean();
    if (!business) {
      return res.status(403).json({ message: "Business not found" });
    }
    
    const now = new Date();
    let isExpired = false;
    
    if (business.subscriptionStatus === "trial") {
      if (business.trialEndsAt && now > new Date(business.trialEndsAt)) {
        isExpired = true;
      }
    } else if (business.subscriptionStatus === "active") {
      if (business.currentPeriodEnd && now > new Date(business.currentPeriodEnd)) {
        // Only mark expired if past the period end, you might want to add a grace period here in the future
        isExpired = true;
      }
    } else if (business.subscriptionStatus === "expired" || business.subscriptionStatus === "cancelled") {
      isExpired = true;
    }
    
    if (isExpired) {
      // Update the db status if we just detected it's expired
      if (business.subscriptionStatus !== "expired") {
         await Business.findByIdAndUpdate(businessId, { subscriptionStatus: "expired" });
      }
      return res.status(403).json({ message: "Subscription expired", subscriptionExpired: true });
    }
    
    return next();
  } catch (error) {
    return next(error);
  }
}

export { requireActiveSubscription };

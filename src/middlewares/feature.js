import { Business } from "../models/Business.js";
import { Plan } from "../models/Plan.js";
import { resolveBusinessFeatures, resolveBusinessProfile } from "../config/features.js";

async function loadBusinessContext(req, res, next) {
  try {
    if (req.user?.role === "superadmin") {
      req.enabledFeatures = null;
      req.businessProfile = "hybrid";
      req.planType = "hybrid";
      return next();
    }

    const businessId = req.user?.businessId;
    if (!businessId) return next();

    const business = await Business.findById(businessId)
      .select("enabledFeatures businessProfile planType planId plan")
      .lean();
    if (!business) return next();

    let plan = null;
    if (business.planId) {
      plan = await Plan.findById(business.planId).select("planType featureKeys slug").lean();
    }

    // Expose plan slug for rate limiter tier resolution
    if (req.user) {
      req.user.planSlug = plan?.slug || business.plan || null;
    }

    req.enabledFeatures = resolveBusinessFeatures(business);
    req.businessProfile = resolveBusinessProfile(business, plan);
    req.planType = business.planType || plan?.planType || "retail";
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireFeature(featureKey) {
  return async (req, res, next) => {
    try {
      if (req.user?.role === "superadmin") return next();

      if (!req.enabledFeatures) {
        await new Promise((resolve, reject) => {
          loadBusinessContext(req, res, (err) => (err ? reject(err) : resolve()));
        });
      }

      const enabled = req.enabledFeatures || [];
      if (!enabled.includes(featureKey)) {
        return res.status(403).json({
          message: `Feature not available on your plan: ${featureKey}`,
          code: "FEATURE_NOT_AVAILABLE",
          featureKey
        });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function requireBusinessProfile(...profiles) {
  return (req, res, next) => {
    if (req.user?.role === "superadmin") return next();
    const profile = req.businessProfile || "retail";
    if (!profiles.includes(profile)) {
      return res.status(403).json({
        message: `Billing profile not allowed: requires ${profiles.join(" or ")}`,
        code: "PROFILE_NOT_ALLOWED"
      });
    }
    return next();
  };
}

export { loadBusinessContext, requireFeature, requireBusinessProfile };

import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Business } from "../models/Business.js";
import { Outlet } from "../models/Outlet.js";
import { AuditLog } from "../models/AuditLog.js";
async function getMyBusiness(req, res, next) {
  try {
    const query = req.user?.role === "superadmin" && req.query.businessId
      ? { _id: req.query.businessId }
      : { ownerId: req.user?.userId };
    const business = await Business.findOne(query).lean();
    if (!business) {
      return errorResponse({
        res: res,
        statusCode: 404,
        message: "Business not found"
      });
    }
    const outletCount = await Outlet.countDocuments({ businessId: business._id, isActive: true });
    return successResponse({
      res: res,

      data: {
        business: { ...business, outletCount }
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function updateMyBusiness(req, res, next) {
  try {
    const allowed = [
      "name",
      "address",
      "phone",
      "email",
      "gstNumber",
      "logo",
      "settings",
      "timezone",
      "currency"
    ];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== void 0) update[key] = req.body[key];
    }
    const query = req.user?.role === "superadmin" && (req.body.businessId || req.query.businessId)
      ? { _id: req.body.businessId || req.query.businessId }
      : { ownerId: req.user?.userId };
    const business = await Business.findOneAndUpdate(
      query,
      { $set: update },
      { new: true }
    );
    return successResponse({
      res: res,

      data: {
        business
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function requestCustomPlanDirect(req, res, next) {
  try {
    const { maxOutlets, maxProducts, features, notes, currency, billingCycle } = req.body;
    
    const query = req.user?.role === "superadmin" && req.query.businessId
      ? { _id: req.query.businessId }
      : { ownerId: req.user?.userId };
      
    const business = await Business.findOne(query);
    if (!business) {
      return errorResponse({ res, statusCode: 404, message: "Business not found" });
    }

    const requestedCurrency = currency || business.currency || (business.isInternational ? "USD" : "INR");

    business.pendingCustomPlan = {
      maxOutlets: Number(maxOutlets) || 1,
      maxProducts: Number(maxProducts) || 0, // 0 usually means unlimited or to be decided
      enabledFeatures: features || [],
      currency: requestedCurrency,
      billingCycle: billingCycle === "yearly" ? "yearly" : "monthly",
      requestedBy: req.user?.userId,
      requestedAt: new Date(),
      notes: notes || "Direct signup plan request"
    };

    if (currency && business.currency !== currency) {
      business.currency = currency;
    }

    await business.save();

    await AuditLog.create({
      businessId: business._id,
      actorId: req.user?.userId,
      module: "business",
      action: "direct_plan_change_requested",
      message: `Business owner requested a custom plan. Currency: ${requestedCurrency}, Max Outlets: ${business.pendingCustomPlan.maxOutlets}, Features: ${business.pendingCustomPlan.enabledFeatures.join(", ")}`,
      ip: req.ip
    });

    try {
      const { getIO } = await import("../config/socket.js");
      getIO().to(`business:${business._id.toString()}`).emit("subscriptionUpdated");
    } catch (err) {
      // socket non-blocking
    }

    return successResponse({ res, message: "Custom plan request submitted successfully." });
  } catch (error) {
    return next(error);
  }
}

export {
  getMyBusiness,
  updateMyBusiness,
  requestCustomPlanDirect
};

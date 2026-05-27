import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Business } from "../models/Business.js";
import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";
import { createDefaultRoles } from "./authController.js";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
async function adminListBusinesses(req, res, next) {
  try {
    const { search, plan, isActive, page = 1, limit = 20 } = req.query;
    const query = {};
    if (plan) query.plan = plan;
    if (isActive !== void 0) query.isActive = isActive === "true";
    if (search) query.name = { $regex: search, $options: "i" };
    const skip = (Number(page) - 1) * Number(limit);
    const [businesses, total] = await Promise.all([
      Business.find(query).populate("ownerId", "name phone email").sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Business.countDocuments(query)
    ]);
    return successResponse({
      res: res,

      data: {
        businesses,
        total
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function adminToggleBusiness(req, res, next) {
  try {
    const business = await Business.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: req.body.isActive } },
      { new: true }
    );
    if (!business) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Business not found"
    });
    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: req.body.isActive ? "enable_business" : "disable_business",
      targetType: "Business",
      targetId: business._id,
      targetName: business.name,
      message: `Business ${req.body.isActive ? "enabled" : "disabled"}: ${business.name}`,
      ip: req.ip
    });
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
async function adminUpdatePlan(req, res, next) {
  try {
    const { planId, maxOutlets, subscriptionStatus, currentPeriodEnd } = req.body;
    
    // Construct the fields to update dynamically
    const updateFields = {};
    if (planId !== undefined) updateFields.planId = planId;
    if (maxOutlets !== undefined) updateFields.maxOutlets = maxOutlets;
    if (subscriptionStatus !== undefined) updateFields.subscriptionStatus = subscriptionStatus;
    if (currentPeriodEnd !== undefined) updateFields.currentPeriodEnd = currentPeriodEnd;

    const business = await Business.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    );
    if (!business) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Business not found"
    });
    
    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "manual_plan_update",
      targetType: "Business",
      targetId: business._id,
      targetName: business.name,
      message: `Admin manually updated plan/subscription for ${business.name}`,
      ip: req.ip
    });

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
async function adminImpersonate(req, res, next) {
  try {
    const { targetUserId } = req.body;
    const targetUser = await User.findById(targetUserId).lean();
    if (!targetUser) return errorResponse({
      res: res,
      statusCode: 404,
      message: "User not found"
    });
    const token = jwt.sign({
      userId: targetUser._id.toString(),
      role: targetUser.role,
      businessId: targetUser.businessId?.toString(),
      outletIds: targetUser.outletIds?.map((id) => id.toString()),
      roleId: targetUser.roleId?.toString(),
      impersonating: true,
      originalAdminId: req.user?.userId
    }, env.JWT_SECRET, { expiresIn: "2h" });
    await AuditLog.create({
      businessId: targetUser.businessId,
      actorId: targetUser._id,
      actorName: targetUser.name,
      impersonatorId: req.user?.userId,
      impersonatorName: "Super Admin",
      module: "admin",
      action: "impersonate_start",
      message: `Super admin impersonating: ${targetUser.name}`,
      ip: req.ip
    });
    return successResponse({
      res: res,

      data: {
        token,
        user: { id: targetUser._id, name: targetUser.name, role: targetUser.role, businessId: targetUser.businessId },
        impersonating: true,
        originalAdminId: req.user?.userId
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function adminStopImpersonation(req, res, next) {
  try {
    await AuditLog.create({
      actorId: req.user?.userId,
      impersonatorId: req.user?.originalAdminId,
      module: "admin",
      action: "impersonate_end",
      message: "Impersonation session ended",
      ip: req.ip
    });
    return successResponse({
      res: res,
      message: "Impersonation ended"
    });
  } catch (error) {
    return next(error);
  }
}
async function adminPlatformStats(req, res, next) {
  try {
    const [totalBusinesses, activeBusinesses, totalUsers] = await Promise.all([
      Business.countDocuments(),
      Business.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: true })
    ]);
    return successResponse({
      res: res,

      data: {
        totalBusinesses,
        activeBusinesses,
        totalUsers
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function adminApproveBusiness(req, res, next) {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Business not found"
    });
    if (business.status === "active") return errorResponse({
      res: res,
      statusCode: 400,
      message: "Business already active"
    });
    business.status = "active";
    business.isActive = true;
    business.approvedAt = new Date();
    business.approvedBy = req.user?.userId;
    await business.save();
    // activate owner user if present
    if (business.ownerId) {
      await User.findByIdAndUpdate(business.ownerId, { $set: { isActive: true } });
    }
    // create default roles for the business
    await createDefaultRoles(business._id.toString());
    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "approve_business",
      targetType: "Business",
      targetId: business._id,
      targetName: business.name,
      message: `Business approved: ${business.name}`,
      ip: req.ip
    });
    // notify owner by email if available
    const owner = await User.findById(business.ownerId).lean();
    try {
      await (await import("../utils/mailer.js")).default.sendBusinessApproved(owner?.email, business.name);
    } catch (e) {
      console.warn("Failed to send approval email", e.message);
    }
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

async function adminSetBusinessStatus(req, res, next) {
  try {
    const { status } = req.body;
    const allowed = ["pending", "active", "suspended", "banned"];
    if (!allowed.includes(status)) return errorResponse({
      res: res,
      statusCode: 400,
      message: "Invalid status"
    });
    const business = await Business.findByIdAndUpdate(req.params.id, { $set: { status, isActive: status === "active" } }, { new: true });
    if (!business) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Business not found"
    });
    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "set_business_status",
      targetType: "Business",
      targetId: business._id,
      targetName: business.name,
      message: `Business status set to ${status}: ${business.name}`,
      ip: req.ip
    });
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
async function adminApproveOutlet(req, res, next) {
  try {
    const outlet = await (await import("../models/Outlet.js")).Outlet.findById(req.params.id);
    if (!outlet) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Outlet not found"
    });
    if (outlet.status === "active") return errorResponse({
      res: res,
      statusCode: 400,
      message: "Outlet already active"
    });
    outlet.status = "active";
    outlet.isActive = true;
    outlet.approvedAt = new Date();
    outlet.approvedBy = req.user?.userId;
    await outlet.save();
    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "approve_outlet",
      targetType: "Outlet",
      targetId: outlet._id,
      targetName: outlet.name,
      message: `Outlet approved: ${outlet.name}`,
      ip: req.ip
    });
    // notify outlet email or owner
    try {
      const owner = await User.findById(outlet.businessId ? (await Business.findById(outlet.businessId)).ownerId : null).lean();
      const notifyEmail = outlet.email || owner?.email;
      await (await import("../utils/mailer.js")).default.sendOutletApproved(notifyEmail, outlet.name);
    } catch (e) {
      console.warn("Failed to send outlet approval email", e.message);
    }
    return successResponse({
      res: res,

      data: {
        outlet
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function adminSetOutletStatus(req, res, next) {
  try {
    const { status } = req.body;
    const allowed = ["pending", "active", "suspended", "banned"];
    if (!allowed.includes(status)) return errorResponse({
      res: res,
      statusCode: 400,
      message: "Invalid status"
    });
    const OutletModel = (await import("../models/Outlet.js")).Outlet;
    const outlet = await OutletModel.findByIdAndUpdate(req.params.id, { $set: { status, isActive: status === "active" } }, { new: true });
    if (!outlet) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Outlet not found"
    });
    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "set_outlet_status",
      targetType: "Outlet",
      targetId: outlet._id,
      targetName: outlet.name,
      message: `Outlet status set to ${status}: ${outlet.name}`,
      ip: req.ip
    });
    return successResponse({
      res: res,

      data: {
        outlet
      }
    });
  } catch (error) {
    return next(error);
  }
}
export {
  adminImpersonate,
  adminListBusinesses,
  adminPlatformStats,
  adminStopImpersonation,
  adminToggleBusiness,
  adminUpdatePlan,
  adminApproveBusiness,
  adminSetBusinessStatus,
  adminApproveOutlet,
  adminSetOutletStatus
};

import { Business } from "../models/Business.js";
import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";
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
    return res.json({ businesses, total });
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
    if (!business) return res.status(404).json({ message: "Business not found" });
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
    return res.json({ business });
  } catch (error) {
    return next(error);
  }
}
async function adminUpdatePlan(req, res, next) {
  try {
    const { plan, planExpiresAt, maxOutlets } = req.body;
    const business = await Business.findByIdAndUpdate(
      req.params.id,
      { $set: { plan, planExpiresAt, maxOutlets } },
      { new: true }
    );
    if (!business) return res.status(404).json({ message: "Business not found" });
    return res.json({ business });
  } catch (error) {
    return next(error);
  }
}
async function adminImpersonate(req, res, next) {
  try {
    const { targetUserId } = req.body;
    const targetUser = await User.findById(targetUserId).lean();
    if (!targetUser) return res.status(404).json({ message: "User not found" });
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
    return res.json({
      token,
      user: { id: targetUser._id, name: targetUser.name, role: targetUser.role, businessId: targetUser.businessId },
      impersonating: true,
      originalAdminId: req.user?.userId
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
    return res.json({ message: "Impersonation ended" });
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
    return res.json({ totalBusinesses, activeBusinesses, totalUsers });
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
  adminUpdatePlan
};

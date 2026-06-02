import { successResponse } from "../../utils/successResponse.js";
import { errorResponse } from "../../utils/errorResponse.js";
import { User } from "../../models/User.js";
import { AuditLog } from "../../models/AuditLog.js";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

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

export {
  adminImpersonate,
  adminStopImpersonation
};

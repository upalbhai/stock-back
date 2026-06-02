import { successResponse } from "../../utils/successResponse.js";
import { errorResponse } from "../../utils/errorResponse.js";
import { Business } from "../../models/Business.js";
import { User } from "../../models/User.js";
import { AuditLog } from "../../models/AuditLog.js";

async function adminApproveOutlet(req, res, next) {
  try {
    const outlet = await (await import("../../models/Outlet.js")).Outlet.findById(req.params.id);
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
    
    try {
      const owner = await User.findById(outlet.businessId ? (await Business.findById(outlet.businessId)).ownerId : null).lean();
      const notifyEmail = outlet.email || owner?.email;
      await (await import("../../utils/mailer.js")).default.sendOutletApproved(notifyEmail, outlet.name);
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
    const OutletModel = (await import("../../models/Outlet.js")).Outlet;
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

async function adminListOutlets(req, res, next) {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) query.name = { $regex: search, $options: "i" };
    
    const skip = (Number(page) - 1) * Number(limit);
    const [outlets, total] = await Promise.all([
      (await import("../../models/Outlet.js")).Outlet.find(query)
        .populate("businessId", "name")
        .populate("managerId", "name email phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      (await import("../../models/Outlet.js")).Outlet.countDocuments(query)
    ]);

    return successResponse({
      res,
      data: {
        outlets,
        total
      }
    });
  } catch (error) {
    return next(error);
  }
}

export {
  adminApproveOutlet,
  adminSetOutletStatus,
  adminListOutlets
};

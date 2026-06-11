import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Outlet } from "../models/Outlet.js";
import { Business } from "../models/Business.js";
import { AuditLog } from "../models/AuditLog.js";
import { assertCanAddOutlet } from "../utils/planLimits.js";
function makeCode(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 16) + "-" + Math.random().toString(36).slice(2, 6);
}
async function listOutlets(req, res, next) {
  try {
    const { businessId, role, outletIds } = req.user;
    let query = { businessId, isActive: true };
    if (role !== "owner" && role !== "superadmin" && outletIds?.length) {
      query._id = { $in: outletIds };
    }
    const outlets = await Outlet.find(query).populate("managerId", "name phone").sort({ createdAt: 1 }).lean();
    return successResponse({
      res: res,

      data: {
        outlets
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function createOutlet(req, res, next) {
  try {
    const canAdd = await assertCanAddOutlet(req, res);
    if (!canAdd) return;

    const { businessId } = req.user;
    const { name, address, phone, email, taxEnabled, defaultTaxRate, billingModes, settings } = req.body;
    // determine if this outlet should be active immediately or await admin approval
    const business = await Business.findById(businessId).lean();
    const existingCount = await Outlet.countDocuments({ businessId });
    const shouldBePending = business?.status !== "active" || existingCount >= 1;
    const outlet = await Outlet.create({
      businessId,
      name,
      code: makeCode(name),
      address,
      phone,
      email,
      taxEnabled: taxEnabled ?? false,
      defaultTaxRate: defaultTaxRate ?? 0,
      billingModes: billingModes ?? ["takeaway", "quick"],
      settings,
      status: shouldBePending ? "pending" : "active",
      isActive: !shouldBePending
    });
    await AuditLog.create({
      businessId,
      actorId: req.user?.userId,
      actorName: req.user?.userId,
      module: "outlets",
      action: outlet.status === "pending" ? "create_pending" : "create",
      targetType: "Outlet",
      targetId: outlet._id,
      targetName: outlet.name,
      message: `Outlet created: ${outlet.name} (status: ${outlet.status})`,
      ip: req.ip
    });
    return successResponse({
      res: res,
      statusCode: 201,

      data: {
        outlet
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function updateOutlet(req, res, next) {
  try {
    const { businessId } = req.user;
    const allowed = ["name", "address", "phone", "email", "taxEnabled", "defaultTaxRate", "billingModes", "settings", "managerId", "isActive"];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== void 0) update[key] = req.body[key];
    }
    const outlet = await Outlet.findOneAndUpdate(
      { _id: req.params.id, businessId },
      { $set: update },
      { new: true }
    );
    if (!outlet) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Outlet not found"
    });
    await AuditLog.create({
      businessId,
      actorId: req.user?.userId,
      module: "outlets",
      action: "update",
      targetType: "Outlet",
      targetId: outlet._id,
      targetName: outlet.name,
      message: `Outlet updated: ${outlet.name}`,
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
async function deleteOutlet(req, res, next) {
  try {
    const { businessId } = req.user;
    const outlet = await Outlet.findOneAndUpdate(
      { _id: req.params.id, businessId },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!outlet) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Outlet not found"
    });
    return successResponse({
      res: res,
      message: "Outlet deactivated"
    });
  } catch (error) {
    return next(error);
  }
}
async function getOutlet(req, res, next) {
  try {
    const { businessId } = req.user;
    const outlet = await Outlet.findOne({ _id: req.params.id, businessId }).populate("managerId", "name phone role").lean();
    if (!outlet) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Outlet not found"
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
  createOutlet,
  deleteOutlet,
  getOutlet,
  listOutlets,
  updateOutlet
};

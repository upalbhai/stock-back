import type { Response, NextFunction } from "express";
import type { AuthedRequest } from "../middlewares/auth.js";
import { Outlet } from "../models/Outlet.js";
import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";

function makeCode(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 16) + "-" + Math.random().toString(36).slice(2, 6);
}

/** GET /api/outlets */
export async function listOutlets(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { businessId, role, outletIds } = req.user!;

    let query: Record<string, unknown> = { businessId, isActive: true };

    // Non-owners can only see their assigned outlets
    if (role !== "owner" && role !== "superadmin" && outletIds?.length) {
      query._id = { $in: outletIds };
    }

    const outlets = await Outlet.find(query)
      .populate("managerId", "name phone")
      .sort({ createdAt: 1 })
      .lean();

    return res.json({ outlets });
  } catch (error) {
    return next(error);
  }
}

/** POST /api/outlets */
export async function createOutlet(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { businessId } = req.user!;
    const { name, address, phone, email, taxEnabled, defaultTaxRate, billingModes, settings } =
      req.body;

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
      settings
    });

    await AuditLog.create({
      businessId,
      actorId: req.user?.userId,
      actorName: req.user?.userId,
      module: "outlets",
      action: "create",
      targetType: "Outlet",
      targetId: outlet._id,
      targetName: outlet.name,
      message: `Outlet created: ${outlet.name}`,
      ip: req.ip
    });

    return res.status(201).json({ outlet });
  } catch (error) {
    return next(error);
  }
}

/** PATCH /api/outlets/:id */
export async function updateOutlet(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { businessId } = req.user!;
    const allowed = ["name", "address", "phone", "email", "taxEnabled", "defaultTaxRate", "billingModes", "settings", "managerId", "isActive"];
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const outlet = await Outlet.findOneAndUpdate(
      { _id: req.params.id, businessId },
      { $set: update },
      { new: true }
    );

    if (!outlet) return res.status(404).json({ message: "Outlet not found" });

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

    return res.json({ outlet });
  } catch (error) {
    return next(error);
  }
}

/** DELETE /api/outlets/:id (soft delete) */
export async function deleteOutlet(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { businessId } = req.user!;
    const outlet = await Outlet.findOneAndUpdate(
      { _id: req.params.id, businessId },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!outlet) return res.status(404).json({ message: "Outlet not found" });
    return res.json({ message: "Outlet deactivated" });
  } catch (error) {
    return next(error);
  }
}

/** GET /api/outlets/:id */
export async function getOutlet(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { businessId } = req.user!;
    const outlet = await Outlet.findOne({ _id: req.params.id, businessId })
      .populate("managerId", "name phone role")
      .lean();
    if (!outlet) return res.status(404).json({ message: "Outlet not found" });
    return res.json({ outlet });
  } catch (error) {
    return next(error);
  }
}

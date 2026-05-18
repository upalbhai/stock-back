import type { Response, NextFunction } from "express";
import type { AuthedRequest } from "../middlewares/auth.js";
import { Business } from "../models/Business.js";
import { Outlet } from "../models/Outlet.js";

/** GET /api/businesses/mine */
export async function getMyBusiness(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const business = await Business.findOne({ ownerId: req.user?.userId })
      .lean();
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }
    const outletCount = await Outlet.countDocuments({ businessId: business._id, isActive: true });
    return res.json({ business: { ...business, outletCount } });
  } catch (error) {
    return next(error);
  }
}

/** PATCH /api/businesses/mine */
export async function updateMyBusiness(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const allowed = [
      "name", "address", "phone", "email", "gstNumber", "logo", "settings", "timezone", "currency"
    ];
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const business = await Business.findOneAndUpdate(
      { ownerId: req.user?.userId },
      { $set: update },
      { new: true }
    );

    return res.json({ business });
  } catch (error) {
    return next(error);
  }
}

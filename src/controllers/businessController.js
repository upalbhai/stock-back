import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Business } from "../models/Business.js";
import { Outlet } from "../models/Outlet.js";
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
export {
  getMyBusiness,
  updateMyBusiness
};
